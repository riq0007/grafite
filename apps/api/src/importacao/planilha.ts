// A leitura da planilha da importação (spec importacao-de-ativos, "Planilha da importação"; design do
// P1e, decisão 2), sem dependência nova:
// - o XLSX pelo diretório central do ZIP, cada parte descompactada pelo `node:zlib`, com um limite
//   para a bomba de compressão; a primeira aba visível do livro, pelas relações; as células pela
//   referência, porque o Excel pula as vazias; o número fica número, e a data do Excel, que é um
//   número, é lida pelo campo de data;
// - o CSV em UTF-8, com ou sem BOM, ou em Windows-1252, com o separador da linha dos títulos e as
//   aspas da RFC 4180.
// O tipo vem do conteúdo, e nunca do nome. A primeira linha preenchida tem os títulos, as linhas
// vazias saem, e cada linha guarda o número que tem na planilha, para a prévia apontar a certa.
import { inflateRawSync } from 'node:zlib';
import type { Celula } from '@grafite/domain';
import { type EntradaDoZip, entradasDoZip, eTexto } from '../arquivos/documentos.ts';
import { ProblemaDaApi } from '../problemas.ts';

/** A maior planilha: 10 MB, como a escolha na tela confere antes do envio. */
export const LIMITE_DA_PLANILHA = 10 * 1024 * 1024;
export const LINHAS_DA_PLANILHA = 5000;
export const COLUNAS_DA_PLANILHA = 200;

/** Quanto as partes do XLSX somam descompactadas, no máximo: barra a bomba de compressão. */
const LIMITE_DESCOMPACTADO = 100 * 1024 * 1024;

export interface LinhaDaPlanilha {
  /** O número da linha na planilha, contando a dos títulos. */
  linha: number;
  /** Uma célula por título, `null` na vazia. */
  celulas: Celula[];
}

export interface PlanilhaLida {
  titulos: string[];
  linhas: LinhaDaPlanilha[];
}

const recusa = (codigo: string, status: number, titulo: string, detalhe: string) =>
  new ProblemaDaApi({ codigo, status, titulo, detalhe });

export const planilhaNaoAceita = () =>
  recusa(
    'formato-nao-aceito',
    415,
    'Formato não aceito',
    'Formato não aceito. Envie a planilha em XLSX ou CSV.',
  );

/** A planilha passa de 10 MB: a mesma recusa para a leitura e para o corpo grande demais. */
export const planilhaPesadaDemais = () =>
  recusa('planilha-pesada-demais', 413, 'Planilha pesada demais', 'A planilha passa de 10 MB.');

const semLinhas = () =>
  recusa(
    'planilha-sem-linhas',
    400,
    'Planilha sem linhas',
    'A planilha não tem linhas para importar.',
  );

const linhasDemais = () =>
  recusa(
    'planilha-com-linhas-demais',
    400,
    'Linhas demais',
    'A planilha passa de 5.000 linhas. Divida-a em partes menores.',
  );

const colunasDemais = () =>
  recusa('planilha-com-colunas-demais', 400, 'Colunas demais', 'A planilha passa de 200 colunas.');

const grandeDemais = () =>
  recusa(
    'planilha-grande-demais',
    400,
    'Planilha grande demais',
    'A planilha é grande demais para importar. Divida-a em partes menores.',
  );

/** Uma linha como saiu do arquivo: as células pela posição, com buracos nas que faltam. */
interface LinhaBruta {
  linha: number;
  celulas: (Celula | undefined)[];
}

const ENTIDADES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** O texto do XML: as entidades e o escape `_xHHHH_` do OOXML, como o `_x000D_` do CR. */
function textoDoXml(xml: string): string {
  return xml
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos));/gi, (_, decimal, hexa, nome) =>
      decimal
        ? String.fromCodePoint(Number(decimal))
        : hexa
          ? String.fromCodePoint(Number.parseInt(hexa, 16))
          : (ENTIDADES[String(nome).toLowerCase()] ?? ''),
    )
    .replace(/_x([0-9a-f]{4})_/gi, (_, hexa) => String.fromCharCode(Number.parseInt(hexa, 16)));
}

/** Os atributos de uma marca, com os valores já como texto. */
function atributos(xml: string): Map<string, string> {
  const lidos = new Map<string, string>();
  for (const [, nome = '', aspas, apostrofos] of xml.matchAll(
    /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
  )) {
    lidos.set(nome, textoDoXml(aspas ?? apostrofos ?? ''));
  }
  return lidos;
}

/** O atributo pelo nome local, com qualquer prefixo, como o `r:id`. */
const atributoLocal = (lidos: Map<string, string>, local: string) => {
  for (const [nome, valor] of lidos) {
    if (nome === local || nome.endsWith(`:${local}`)) return valor;
  }
  return undefined;
};

/** Os elementos de um nome, com os atributos e o conteúdo, com ou sem prefixo. */
function elementos(xml: string, nome: string): { atributos: string; conteudo: string }[] {
  const padrao = new RegExp(
    `<(?:[\\w.-]+:)?${nome}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</(?:[\\w.-]+:)?${nome}>)`,
    'g',
  );
  return [...xml.matchAll(padrao)].map(([, atributosDoElemento = '', conteudo = '']) => ({
    atributos: atributosDoElemento,
    conteudo,
  }));
}

/** O texto de um item com formatação: os trechos `<t>`, sem a leitura fonética. */
function textoDoItem(xml: string): string {
  const semFonetica = xml.replace(/<(?:[\w.-]+:)?rPh\b[\s\S]*?<\/(?:[\w.-]+:)?rPh>/g, '');
  return elementos(semFonetica, 't')
    .map((trecho) => textoDoXml(trecho.conteudo))
    .join('');
}

/** A posição da coluna pela referência da célula: A é 0, Z é 25, AA é 26. */
function colunaDaReferencia(referencia: string): number | null {
  const letras = /^([A-Z]+)\d*$/i.exec(referencia)?.[1];
  if (!letras) return null;
  let coluna = 0;
  for (const letra of letras.toUpperCase()) coluna = coluna * 26 + (letra.charCodeAt(0) - 64);
  return coluna - 1;
}

/** A letra da coluna pela posição, como o Excel mostra. */
function letraDaColuna(posicao: number): string {
  let letras = '';
  for (let resto = posicao + 1; resto > 0; resto = Math.floor((resto - 1) / 26)) {
    letras = String.fromCharCode(65 + ((resto - 1) % 26)) + letras;
  }
  return letras;
}

/** O conteúdo compactado de uma entrada, pelo cabeçalho local; `null` se ele não se lê. */
function dadosDaEntrada(conteudo: Buffer, entrada: EntradaDoZip): Buffer | null {
  const { local } = entrada;
  if (entrada.bytes === 0xffffffff || local + 30 > conteudo.length) return null;
  if (conteudo.readUInt32LE(local) !== 0x04034b50) return null;
  const inicio = local + 30 + conteudo.readUInt16LE(local + 26) + conteudo.readUInt16LE(local + 28);
  const fim = inicio + entrada.bytes;
  return fim > conteudo.length ? null : conteudo.subarray(inicio, fim);
}

/** O caminho de uma parte do pacote, pela relação: relativo à pasta `xl/` ou absoluto. */
function caminhoDaParte(alvo: string): string {
  const partes: string[] = alvo.startsWith('/') ? [] : ['xl'];
  for (const parte of alvo.split('/')) {
    if (parte === '' || parte === '.') continue;
    if (parte === '..') partes.pop();
    else partes.push(parte);
  }
  return partes.join('/');
}

function lerXlsx(conteudo: Buffer, limiteDescompactado: number): LinhaBruta[] {
  const entradas = entradasDoZip(conteudo);
  if (!entradas) throw planilhaNaoAceita();
  const porNome = new Map(entradas.map((entrada) => [entrada.nome, entrada]));
  if (!porNome.has('[Content_Types].xml') || !porNome.has('xl/workbook.xml')) {
    throw planilhaNaoAceita();
  }

  let restante = limiteDescompactado;
  const ler = (nome: string): string | null => {
    const entrada = porNome.get(nome);
    if (!entrada) return null;
    const dados = dadosDaEntrada(conteudo, entrada);
    if (!dados) throw planilhaNaoAceita();
    let bytes: Buffer;
    if (entrada.metodo === 0) bytes = dados;
    else if (entrada.metodo === 8) {
      try {
        bytes = inflateRawSync(dados, { maxOutputLength: Math.max(restante, 1) });
      } catch (erro) {
        if (erro instanceof RangeError) throw grandeDemais();
        throw planilhaNaoAceita();
      }
    } else throw planilhaNaoAceita();
    if (bytes.length > restante) throw grandeDemais();
    restante -= bytes.length;
    return bytes.toString('utf8');
  };

  // A primeira aba visível, na ordem do livro, e o arquivo dela, pelas relações.
  const livro = ler('xl/workbook.xml') ?? '';
  const abas = elementos(livro, 'sheet').map((aba) => atributos(aba.atributos));
  const primeira =
    abas.find((aba) => !['hidden', 'veryHidden'].includes(aba.get('state') ?? '')) ?? abas[0];
  const idDaAba = primeira ? atributoLocal(primeira, 'id') : undefined;
  const relacoes = elementos(ler('xl/_rels/workbook.xml.rels') ?? '', 'Relationship').map(
    (relacao) => atributos(relacao.atributos),
  );
  const alvoDaAba = relacoes.find((relacao) => relacao.get('Id') === idDaAba)?.get('Target');
  if (!alvoDaAba) throw planilhaNaoAceita();
  const alvoDosTextos = relacoes
    .find((relacao) => relacao.get('Type')?.endsWith('/sharedStrings'))
    ?.get('Target');

  const textos = elementos(
    ler(alvoDosTextos ? caminhoDaParte(alvoDosTextos) : 'xl/sharedStrings.xml') ?? '',
    'si',
  ).map((item) => textoDoItem(item.conteudo));
  const aba = ler(caminhoDaParte(alvoDaAba));
  if (aba === null) throw planilhaNaoAceita();

  const linhas: LinhaBruta[] = [];
  let numero = 0;
  for (const linha of elementos(aba, 'row')) {
    const lidos = atributos(linha.atributos);
    numero = Number(lidos.get('r')) || numero + 1;
    const celulas: (Celula | undefined)[] = [];
    let coluna = -1;
    for (const celula of elementos(linha.conteudo, 'c')) {
      const daCelula = atributos(celula.atributos);
      const referencia = daCelula.get('r');
      coluna = (referencia ? colunaDaReferencia(referencia) : null) ?? coluna + 1;
      const [valor] = elementos(celula.conteudo, 'v');
      const texto = valor ? textoDoXml(valor.conteudo) : undefined;
      switch (daCelula.get('t') ?? 'n') {
        case 's':
          celulas[coluna] = texto === undefined ? null : (textos[Number(texto)] ?? null);
          break;
        case 'inlineStr': {
          const [item] = elementos(celula.conteudo, 'is');
          celulas[coluna] = item ? textoDoItem(item.conteudo) : null;
          break;
        }
        case 'b':
          celulas[coluna] = texto === undefined ? null : texto === '1' ? 'VERDADEIRO' : 'FALSO';
          break;
        case 'str':
        case 'e':
        case 'd':
          celulas[coluna] = texto ?? null;
          break;
        default: {
          const lido = texto === undefined || texto.trim() === '' ? null : Number(texto);
          celulas[coluna] = lido === null ? null : Number.isFinite(lido) ? lido : (texto ?? null);
        }
      }
    }
    linhas.push({ linha: numero, celulas });
  }
  return linhas;
}

const utf8 = new TextDecoder('utf-8', { fatal: true });
const windows1252 = new TextDecoder('windows-1252');

/** O separador da linha dos títulos: o que mais aparece fora das aspas, o ponto e vírgula no empate. */
function separadorDo(texto: string): string {
  const contagem = new Map<string, number>([
    [';', 0],
    [',', 0],
    ['\t', 0],
  ]);
  let aspas = false;
  for (const caractere of texto) {
    if (caractere === '"') aspas = !aspas;
    else if (!aspas && (caractere === '\n' || caractere === '\r')) break;
    else if (!aspas && contagem.has(caractere)) {
      contagem.set(caractere, (contagem.get(caractere) ?? 0) + 1);
    }
  }
  let escolhido = ';';
  for (const [separador, vezes] of contagem) {
    if (vezes > (contagem.get(escolhido) ?? 0)) escolhido = separador;
  }
  return escolhido;
}

function lerCsv(conteudo: Buffer): LinhaBruta[] {
  const comBom = conteudo[0] === 0xef && conteudo[1] === 0xbb && conteudo[2] === 0xbf;
  let texto: string;
  if (comBom) texto = conteudo.subarray(3).toString('utf8');
  else {
    try {
      texto = utf8.decode(conteudo);
    } catch {
      texto = windows1252.decode(conteudo);
    }
  }
  // Os títulos começam na primeira linha com algum texto: a de separadores vazios não conta.
  const separador = separadorDo(texto.replace(/^(?:[;,\t ]*\r?\n)+/, ''));

  const registros: string[][] = [];
  let registro: string[] = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const caractere = texto[i];
    if (aspas) {
      if (caractere !== '"') campo += caractere;
      else if (texto[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else aspas = false;
    } else if (caractere === '"' && campo === '') aspas = true;
    else if (caractere === separador) {
      registro.push(campo);
      campo = '';
    } else if (caractere === '\r' || caractere === '\n') {
      registro.push(campo);
      registros.push(registro);
      registro = [];
      campo = '';
      if (caractere === '\r' && texto[i + 1] === '\n') i += 1;
    } else campo += caractere;
  }
  if (campo !== '' || registro.length > 0) {
    registro.push(campo);
    registros.push(registro);
  }
  return registros.map((celulas, posicao) => ({ linha: posicao + 1, celulas }));
}

/** O texto sem espaços nas pontas, e `null` no vazio. */
const limpar = (celula: Celula | undefined): Celula => {
  if (typeof celula === 'string') {
    const limpo = celula.trim();
    return limpo === '' ? null : limpo;
  }
  return celula ?? null;
};

/** Os títulos e as linhas, com a largura da tabela e os limites. */
function montar(brutas: readonly LinhaBruta[]): PlanilhaLida {
  const preenchidas = brutas
    .map((bruta) => ({ linha: bruta.linha, celulas: Array.from(bruta.celulas, limpar) }))
    .filter((linha) => linha.celulas.some((celula) => celula !== null));
  const [cabecalho, ...dados] = preenchidas;
  if (!cabecalho || dados.length === 0) throw semLinhas();
  if (dados.length > LINHAS_DA_PLANILHA) throw linhasDemais();
  const largura = Math.max(
    ...preenchidas.map((linha) => linha.celulas.findLastIndex((celula) => celula !== null) + 1),
  );
  if (largura > COLUNAS_DA_PLANILHA) throw colunasDemais();
  const titulos = Array.from({ length: largura }, (_, posicao) => {
    const titulo = cabecalho.celulas[posicao];
    return titulo === null || titulo === undefined
      ? `Coluna ${letraDaColuna(posicao)}`
      : String(titulo);
  });
  return {
    titulos,
    linhas: dados.map((linha) => ({
      linha: linha.linha,
      celulas: Array.from({ length: largura }, (_, posicao) => linha.celulas[posicao] ?? null),
    })),
  };
}

const comeca = (conteudo: Buffer, assinatura: string) =>
  conteudo.subarray(0, assinatura.length).equals(Buffer.from(assinatura, 'latin1'));

/** A planilha lida, ou a recusa no formato único de erro. */
export function lerPlanilha(
  conteudo: Buffer,
  { limiteDescompactado = LIMITE_DESCOMPACTADO }: { limiteDescompactado?: number } = {},
): PlanilhaLida {
  if (conteudo.length > LIMITE_DA_PLANILHA) throw planilhaPesadaDemais();
  if (conteudo.length === 0) throw semLinhas();
  if (comeca(conteudo, 'PK')) return montar(lerXlsx(conteudo, limiteDescompactado));
  if (comeca(conteudo, '%PDF-') || !eTexto(conteudo)) throw planilhaNaoAceita();
  return montar(lerCsv(conteudo));
}

/** A extensão do formato lido, para o nome guardado: `.xlsx` ou `.csv`. */
export const extensaoDaPlanilha = (conteudo: Buffer) => (comeca(conteudo, 'PK') ? '.xlsx' : '.csv');
