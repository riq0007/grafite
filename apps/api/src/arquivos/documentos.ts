// Os documentos dos campos de arquivo (spec arquivos-e-imagens, "Arquivos aceitos"; design do P1d,
// decisão 5). O tipo vem do conteúdo, e nunca do nome nem do tipo informado:
// - o PDF e as imagens pela assinatura;
// - os ZIP pelo diretório central, sem descompactar: o Office pelas pastas do pacote, o LibreOffice
//   pelo `mimetype`, e o resto é ZIP;
// - os formatos antigos do Office pelos fluxos da raiz do CFB; outro CFB, como um instalador, não;
// - o texto sem byte nulo, em UTF-8 ou só com os caracteres imprimíveis do Windows-1252.
// O arquivo é guardado como chegou, e o nome guardado ganha a extensão do tipo conferido.
import { ProblemaDaApi } from '../problemas.ts';

/** O maior arquivo de um campo: 25 MiB. */
export const LIMITE_DO_DOCUMENTO = 25 * 1024 * 1024;

const TAMANHO_DO_NOME = 200;

export interface DocumentoConferido {
  /** O tipo conferido, que a entrega informa. */
  tipo: string;
  /** A extensão do tipo, que o nome guardado tem. */
  extensao: string;
}

export const documentoNaoAceito = () =>
  new ProblemaDaApi({
    codigo: 'formato-nao-aceito',
    status: 415,
    titulo: 'Formato não aceito',
    detalhe:
      'Formato não aceito. Envie PDF, imagem, documento, planilha, apresentação, texto, CSV ou ZIP.',
  });

/** O arquivo passa de 25 MB: a mesma recusa para a conferência e para o corpo grande demais. */
export const documentoPesadoDemais = () =>
  new ProblemaDaApi({
    codigo: 'arquivo-pesado-demais',
    status: 413,
    titulo: 'Arquivo pesado demais',
    detalhe: 'O arquivo passa de 25 MB.',
  });

export const arquivoVazio = () =>
  new ProblemaDaApi({
    codigo: 'arquivo-vazio',
    status: 400,
    titulo: 'Arquivo vazio',
    detalhe: 'O arquivo está vazio.',
  });

const OOXML = 'application/vnd.openxmlformats-officedocument';
const ODF = 'application/vnd.oasis.opendocument';

const TIPOS = {
  pdf: { tipo: 'application/pdf', extensao: '.pdf' },
  png: { tipo: 'image/png', extensao: '.png' },
  jpeg: { tipo: 'image/jpeg', extensao: '.jpg' },
  webp: { tipo: 'image/webp', extensao: '.webp' },
  avif: { tipo: 'image/avif', extensao: '.avif' },
  docx: { tipo: `${OOXML}.wordprocessingml.document`, extensao: '.docx' },
  xlsx: { tipo: `${OOXML}.spreadsheetml.sheet`, extensao: '.xlsx' },
  pptx: { tipo: `${OOXML}.presentationml.presentation`, extensao: '.pptx' },
  odt: { tipo: `${ODF}.text`, extensao: '.odt' },
  ods: { tipo: `${ODF}.spreadsheet`, extensao: '.ods' },
  odp: { tipo: `${ODF}.presentation`, extensao: '.odp' },
  doc: { tipo: 'application/msword', extensao: '.doc' },
  xls: { tipo: 'application/vnd.ms-excel', extensao: '.xls' },
  ppt: { tipo: 'application/vnd.ms-powerpoint', extensao: '.ppt' },
  txt: { tipo: 'text/plain', extensao: '.txt' },
  csv: { tipo: 'text/csv', extensao: '.csv' },
  zip: { tipo: 'application/zip', extensao: '.zip' },
} as const satisfies Record<string, DocumentoConferido>;

/** As extensões que também valem para um tipo, além da dele. */
const OUTRAS_EXTENSOES: Readonly<Record<string, readonly string[]>> = { '.jpg': ['.jpeg'] };

const comeca = (conteudo: Buffer, assinatura: Buffer | string, inicio = 0) => {
  const bytes = typeof assinatura === 'string' ? Buffer.from(assinatura, 'latin1') : assinatura;
  return (
    conteudo.length >= inicio + bytes.length &&
    conteudo.subarray(inicio, inicio + bytes.length).equals(bytes)
  );
};

/** A imagem pela assinatura: PNG, JPG, WebP e o AVIF pelas marcas da caixa `ftyp`. */
function imagem(conteudo: Buffer): DocumentoConferido | null {
  if (comeca(conteudo, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return TIPOS.png;
  }
  if (comeca(conteudo, Buffer.from([0xff, 0xd8, 0xff]))) return TIPOS.jpeg;
  if (comeca(conteudo, 'RIFF') && comeca(conteudo, 'WEBP', 8)) return TIPOS.webp;
  if (comeca(conteudo, 'ftyp', 4)) {
    const fimDaCaixa = Math.min(conteudo.readUInt32BE(0), conteudo.length, 256);
    for (let i = 8; i + 4 <= fimDaCaixa; i += 4) {
      // A marca principal, a versão (que não é marca) e as compatíveis.
      if (i === 12) continue;
      const marca = conteudo.toString('latin1', i, i + 4);
      if (marca === 'avif' || marca === 'avis') return TIPOS.avif;
    }
  }
  return null;
}

export interface EntradaDoZip {
  nome: string;
  metodo: number;
  bytes: number;
  local: number;
}

/** O fim do diretório central, com o do ZIP64 quando os campos do fim comum não bastam. */
function fimDoDiretorio(conteudo: Buffer): { inicio: number; total: number } | null {
  const ultimo = conteudo.length - 22;
  for (let i = ultimo; i >= Math.max(0, ultimo - 0xffff); i -= 1) {
    if (conteudo.readUInt32LE(i) !== 0x06054b50) continue;
    const total = conteudo.readUInt16LE(i + 10);
    const inicio = conteudo.readUInt32LE(i + 16);
    if (total !== 0xffff && inicio !== 0xffffffff) return { inicio, total };
    const localizador = i - 20;
    if (localizador < 0 || conteudo.readUInt32LE(localizador) !== 0x07064b50) return null;
    const fim64 = Number(conteudo.readBigUInt64LE(localizador + 8));
    if (fim64 + 56 > conteudo.length || conteudo.readUInt32LE(fim64) !== 0x06064b50) return null;
    return {
      total: Number(conteudo.readBigUInt64LE(fim64 + 32)),
      inicio: Number(conteudo.readBigUInt64LE(fim64 + 48)),
    };
  }
  return null;
}

/** As entradas do ZIP pelo diretório central, sem descompactar nada; `null` se ele não se lê. */
export function entradasDoZip(conteudo: Buffer): EntradaDoZip[] | null {
  if (!comeca(conteudo, 'PK\x03\x04') && !comeca(conteudo, 'PK\x05\x06')) return null;
  const fim = fimDoDiretorio(conteudo);
  if (!fim) return null;
  const entradas: EntradaDoZip[] = [];
  let posicao = fim.inicio;
  for (let i = 0; i < fim.total; i += 1) {
    if (posicao + 46 > conteudo.length || conteudo.readUInt32LE(posicao) !== 0x02014b50) {
      return null;
    }
    const tamanhoDoNome = conteudo.readUInt16LE(posicao + 28);
    const proxima =
      posicao +
      46 +
      tamanhoDoNome +
      conteudo.readUInt16LE(posicao + 30) +
      conteudo.readUInt16LE(posicao + 32);
    if (proxima > conteudo.length) return null;
    entradas.push({
      nome: conteudo.toString('utf8', posicao + 46, posicao + 46 + tamanhoDoNome),
      metodo: conteudo.readUInt16LE(posicao + 10),
      bytes: conteudo.readUInt32LE(posicao + 20),
      local: conteudo.readUInt32LE(posicao + 42),
    });
    posicao = proxima;
  }
  return entradas;
}

/** O conteúdo de uma entrada guardada sem compressão, como o `mimetype` do LibreOffice. */
function conteudoGuardado(conteudo: Buffer, entrada: EntradaDoZip): string | null {
  const { local } = entrada;
  if (entrada.metodo !== 0 || local + 30 > conteudo.length) return null;
  if (conteudo.readUInt32LE(local) !== 0x04034b50) return null;
  const inicio = local + 30 + conteudo.readUInt16LE(local + 26) + conteudo.readUInt16LE(local + 28);
  if (inicio + entrada.bytes > conteudo.length || entrada.bytes > 200) return null;
  return conteudo.toString('latin1', inicio, inicio + entrada.bytes).trim();
}

const DO_LIBREOFFICE: Readonly<Record<string, DocumentoConferido>> = {
  [TIPOS.odt.tipo]: TIPOS.odt,
  [TIPOS.ods.tipo]: TIPOS.ods,
  [TIPOS.odp.tipo]: TIPOS.odp,
};

/** O pacote ZIP: o do Office pelas pastas, o do LibreOffice pelo `mimetype`, ou ZIP. */
function pacote(conteudo: Buffer): DocumentoConferido | null {
  const entradas = entradasDoZip(conteudo);
  if (!entradas) return null;
  const nomes = entradas.map((entrada) => entrada.nome);
  if (nomes.includes('[Content_Types].xml')) {
    const pasta = (prefixo: string) => nomes.some((nome) => nome.startsWith(prefixo));
    if (pasta('word/')) return TIPOS.docx;
    if (pasta('xl/')) return TIPOS.xlsx;
    if (pasta('ppt/')) return TIPOS.pptx;
  }
  const mimetype = entradas.find((entrada) => entrada.nome === 'mimetype');
  const doLibreOffice = mimetype
    ? DO_LIBREOFFICE[conteudoGuardado(conteudo, mimetype) ?? '']
    : null;
  return doLibreOffice ?? TIPOS.zip;
}

const FIM_DA_CADEIA = 0xfffffffe;
const NENHUM = 0xffffffff;

/** Os nomes dos fluxos da raiz de um CFB; `null` se ele não se lê. */
function fluxosDaRaiz(conteudo: Buffer): Set<string> | null {
  if (!comeca(conteudo, Buffer.from('d0cf11e0a1b11ae1', 'hex')) || conteudo.length < 512) {
    return null;
  }
  const deslocamentoDoSetor = conteudo.readUInt16LE(30);
  if (deslocamentoDoSetor !== 9 && deslocamentoDoSetor !== 12) return null;
  const setor = 1 << deslocamentoDoSetor;
  const totalDeSetores = Math.floor((conteudo.length - setor) / setor);
  const inicioDo = (numero: number) => (numero + 1) * setor;
  const valido = (numero: number) => numero < totalDeSetores;

  // Os setores da FAT: os 109 primeiros no cabeçalho e o resto nos setores da DIFAT.
  const setoresDaFat: number[] = [];
  const totalDaFat = conteudo.readUInt32LE(44);
  for (let i = 0; i < 109 && setoresDaFat.length < totalDaFat; i += 1) {
    setoresDaFat.push(conteudo.readUInt32LE(76 + i * 4));
  }
  let difat = conteudo.readUInt32LE(68);
  for (let passos = 0; setoresDaFat.length < totalDaFat && difat !== FIM_DA_CADEIA; passos += 1) {
    if (!valido(difat) || passos > totalDeSetores) return null;
    const inicio = inicioDo(difat);
    for (let i = 0; i < setor / 4 - 1 && setoresDaFat.length < totalDaFat; i += 1) {
      setoresDaFat.push(conteudo.readUInt32LE(inicio + i * 4));
    }
    difat = conteudo.readUInt32LE(inicio + setor - 4);
  }
  if (setoresDaFat.length < totalDaFat || !setoresDaFat.every(valido)) return null;
  const proximo = (numero: number) => {
    const posicao = numero * 4;
    const daFat = setoresDaFat[Math.floor(posicao / setor)];
    return daFat === undefined ? null : conteudo.readUInt32LE(inicioDo(daFat) + (posicao % setor));
  };

  // O diretório, pela cadeia da FAT, em entradas de 128 bytes.
  const entradas: {
    nome: string;
    tipo: number;
    esquerda: number;
    direita: number;
    filho: number;
  }[] = [];
  let atual: number | null = conteudo.readUInt32LE(48);
  for (let passos = 0; atual !== FIM_DA_CADEIA; passos += 1) {
    if (atual === null || !valido(atual) || passos > totalDeSetores) return null;
    const inicio = inicioDo(atual);
    for (let base = inicio; base < inicio + setor; base += 128) {
      const tamanhoDoNome = Math.min(conteudo.readUInt16LE(base + 64), 64);
      entradas.push({
        nome: conteudo.toString('utf16le', base, base + Math.max(tamanhoDoNome - 2, 0)),
        tipo: conteudo.readUInt8(base + 66),
        esquerda: conteudo.readUInt32LE(base + 68),
        direita: conteudo.readUInt32LE(base + 72),
        filho: conteudo.readUInt32LE(base + 76),
      });
    }
    atual = proximo(atual);
  }

  // Os filhos da raiz formam uma árvore pelos irmãos da esquerda e da direita.
  const raiz = entradas[0];
  if (raiz?.tipo !== 5) return null;
  const nomes = new Set<string>();
  const vistos = new Set<number>();
  const pendentes = [raiz.filho];
  while (pendentes.length > 0) {
    const id = pendentes.pop() ?? NENHUM;
    const entrada = entradas[id];
    if (id === NENHUM || vistos.has(id) || !entrada) continue;
    vistos.add(id);
    if (entrada.tipo === 2) nomes.add(entrada.nome);
    pendentes.push(entrada.esquerda, entrada.direita);
  }
  return nomes;
}

/** O documento antigo do Office pelos fluxos da raiz; outro CFB, como um instalador, não. */
function documentoAntigo(conteudo: Buffer): DocumentoConferido | null {
  const fluxos = fluxosDaRaiz(conteudo);
  if (!fluxos) return null;
  if (fluxos.has('WordDocument')) return TIPOS.doc;
  if (fluxos.has('PowerPoint Document')) return TIPOS.ppt;
  if (fluxos.has('Workbook') || fluxos.has('Book')) return TIPOS.xls;
  return null;
}

/** Os bytes que o Windows-1252 imprime, com a tabulação, as quebras de linha e a de página. */
const IMPRIMIVEL_NO_1252 = new Uint8Array(256).map((_, byte) =>
  [0x09, 0x0a, 0x0c, 0x0d].includes(byte) ||
  (byte >= 0x20 && byte <= 0x7e) ||
  (byte >= 0x80 && ![0x81, 0x8d, 0x8f, 0x90, 0x9d].includes(byte))
    ? 1
    : 0,
);

const utf8 = new TextDecoder('utf-8', { fatal: true });

/** O texto: sem byte nulo, em UTF-8 válido ou só com o que o Windows-1252 imprime. */
export function eTexto(conteudo: Buffer): boolean {
  if (conteudo.includes(0)) return false;
  try {
    utf8.decode(conteudo);
    return true;
  } catch {
    return conteudo.every((byte) => IMPRIMIVEL_NO_1252[byte] === 1);
  }
}

/** O tipo e a extensão do arquivo pelo conteúdo; o nome original só separa o CSV do texto. */
export function conferirDocumento(conteudo: Buffer, nome: string): DocumentoConferido {
  if (conteudo.length === 0) throw arquivoVazio();
  if (conteudo.length > LIMITE_DO_DOCUMENTO) throw documentoPesadoDemais();
  if (comeca(conteudo, '%PDF-')) return TIPOS.pdf;
  const conferido = imagem(conteudo) ?? pacote(conteudo) ?? documentoAntigo(conteudo);
  if (conferido) return conferido;
  if (eTexto(conteudo)) return /\.csv$/i.test(nome.trim()) ? TIPOS.csv : TIPOS.txt;
  throw documentoNaoAceito();
}

/** Os caracteres de controle e os que invertem a direção do texto, como em "fdp.exe". */
const CONTROLES = /[\p{Cc}‎‏‪-‮⁦-⁩]/gu;

/**
 * O nome guardado: sem o caminho e sem os caracteres de controle, com até 200 caracteres e com a
 * extensão do tipo conferido. O nome com outra extensão ganha a do tipo, como "limpeza.ps1.txt".
 */
export function nomeDoArquivo(original: string, extensao: string): string {
  const nome = (original.split(/[\\/]/).at(-1) ?? '').replace(CONTROLES, '').trim();
  const aceitas = [extensao, ...(OUTRAS_EXTENSOES[extensao] ?? [])];
  const propria = aceitas.find((uma) => nome.toLowerCase().endsWith(uma));
  const final = propria ? nome.slice(nome.length - propria.length) : extensao;
  const base = (propria ? nome.slice(0, nome.length - propria.length) : nome).trim() || 'arquivo';
  return [...base].slice(0, TAMANHO_DO_NOME - final.length).join('') + final;
}
