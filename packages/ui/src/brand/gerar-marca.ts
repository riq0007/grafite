// Gerador da marca e dos derivados: monta o símbolo e a palavra "grafite" (convertida em curvas a
// partir da Instrument Sans, para não depender da fonte instalada) e grava, a partir dessa fonte:
// - em packages/ui/src/brand: símbolo, logotipo, marca e as versões monocromáticas (SVG), e a
//   montagem da marca em TypeScript (gerado/marca.ts), que o componente <Marca> desenha em linha;
// - também ali, o "olá" das boas-vindas em curvas (gerado/ola.ts), da Sacramento, de
//   desenvolvimento, para o produto não carregar a fonte;
// - em apps/web/public: favicon SVG (acompanha o tema do sistema) e ICO, os ícones da PWA e o
//   manifesto que os declara.
// As cores vêm dos tokens. Uso: node packages/ui/src/brand/gerar-marca.ts escrever | verificar
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { temas } from '../tokens/temas.ts';
import {
  GRADE_DO_SIMBOLO,
  grupoDoSimbolo,
  LIMITES_DO_SIMBOLO,
  NOME_DO_PRODUTO,
} from './simbolo.ts';

const pasta = dirname(fileURLToPath(import.meta.url));
const raizDoRepositorio = resolve(pasta, '../../../..');
const exigir = createRequire(import.meta.url);
// O opentype.js é CommonJS: no ESM do Node, só pelo require.
const { parse } = exigir('opentype.js') as typeof import('opentype.js');

/** Lê uma fonte de um pacote @fontsource, pelo caminho do arquivo dentro dele. */
function abrirFonte(arquivo: string) {
  const bytes = readFileSync(exigir.resolve(arquivo));
  return parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

/** Tamanho da palavra na grade do símbolo e onde fica a linha de base (fundo do bojo). */
const TAMANHO_DA_PALAVRA = 24;
const LINHA_DE_BASE = 19.85;
const RESPIRO_ENTRE_SIMBOLO_E_PALAVRA = 10;
/** Folga do recorte, para o antisserrilhado da borda não ser cortado. */
const MARGEM = 0.5;

/** Cores dos derivados com cor fixa, tiradas dos temas. */
const PLACA = temas.grafite.cores.fundo;
const TRACO_CLARO = temas.grafite.cores.texto;
const TRACO_ESCURO = temas.nevoa.cores.texto;

const casas = (valor: number) => Math.round(valor * 100) / 100;

export interface Palavra {
  caminho: string;
  largura: number;
  topo: number;
  base: number;
}

/** Espaçamento entre letras do conceito escolhido: -0,01 em. */
const ESPACAMENTO = -0.01 * TAMANHO_DA_PALAVRA;

/**
 * "grafite" em curvas, com a linha de base em y = LINHA_DE_BASE. Monta letra a letra (com o
 * kerning da fonte): num logotipo não se quer substituição tipográfica, como a ligadura "fi".
 */
export function palavraEmCurvas(texto = 'grafite'): Palavra {
  const fonte = abrirFonte(
    '@fontsource/instrument-sans/files/instrument-sans-latin-500-normal.woff',
  );
  const escala = TAMANHO_DA_PALAVRA / fonte.unitsPerEm;
  const glifos = [...texto].map((letra) => fonte.charToGlyph(letra));
  const partes: string[] = [];
  let x = 0;
  let topo = Number.POSITIVE_INFINITY;
  let base = Number.NEGATIVE_INFINITY;
  let direita = 0;
  glifos.forEach((glifo, posicao) => {
    const caminho = glifo.getPath(x, LINHA_DE_BASE, TAMANHO_DA_PALAVRA);
    const caixa = caminho.getBoundingBox();
    partes.push(caminho.toPathData(2));
    topo = Math.min(topo, caixa.y1);
    base = Math.max(base, caixa.y2);
    direita = Math.max(direita, caixa.x2);
    const seguinte = glifos[posicao + 1];
    x += (glifo.advanceWidth ?? 0) * escala + ESPACAMENTO;
    if (seguinte) x += fonte.getKerningValue(glifo, seguinte) * escala;
  });
  return {
    caminho: partes.join(''),
    largura: casas(direita),
    topo: casas(topo),
    base: casas(base),
  };
}

const svg = (largura: number, altura: number, conteudo: string, titulo = NOME_DO_PRODUTO) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" role="img" aria-label="${titulo}">` +
  `<title>${titulo}</title>${conteudo}</svg>\n`;

/** Troca a cor herdada por uma cor fixa (versões para uso fora da interface). */
const comCor = (conteudo: string, cor: string) => conteudo.replaceAll('currentColor', cor);

/** Só o símbolo, na grade de 32. */
export function simboloSvg(): string {
  return svg(GRADE_DO_SIMBOLO, GRADE_DO_SIMBOLO, grupoDoSimbolo());
}

/** Só a palavra, com recorte justo. */
export function logotipoSvg(): string {
  const palavra = palavraEmCurvas();
  const y = palavra.topo - MARGEM;
  const largura = casas(palavra.largura + 2 * MARGEM);
  const altura = casas(palavra.base + MARGEM - y);
  const conteudo = `<path fill="currentColor" transform="translate(${MARGEM} ${casas(-y)})" d="${palavra.caminho}"/>`;
  return svg(largura, altura, conteudo);
}

/** Marca completa na grade do símbolo: recorte e posição do símbolo e da palavra em curvas. */
export interface MontagemDaMarca {
  largura: number;
  altura: number;
  simbolo: string;
  palavra: string;
  caminhoDaPalavra: string;
}

/**
 * Símbolo e palavra lado a lado, alinhados pela linha de base no fundo do bojo. O recorte é
 * justo (pelos limites visíveis), para a marca alinhar com o resto da interface.
 */
export function montagemDaMarca(): MontagemDaMarca {
  const palavra = palavraEmCurvas();
  const inicio = LIMITES_DO_SIMBOLO.direita + RESPIRO_ENTRE_SIMBOLO_E_PALAVRA;
  const x = LIMITES_DO_SIMBOLO.esquerda - MARGEM;
  const y = Math.min(LIMITES_DO_SIMBOLO.topo, palavra.topo) - MARGEM;
  return {
    largura: casas(inicio + palavra.largura + MARGEM - x),
    altura: casas(Math.max(LIMITES_DO_SIMBOLO.base, palavra.base) + MARGEM - y),
    simbolo: `translate(${casas(-x)} ${casas(-y)})`,
    palavra: `translate(${casas(inicio - x)} ${casas(-y)})`,
    caminhoDaPalavra: palavra.caminho,
  };
}

export function marcaSvg(montagem = montagemDaMarca()): string {
  const conteudo =
    grupoDoSimbolo(montagem.simbolo) +
    `<path fill="currentColor" transform="${montagem.palavra}" d="${montagem.caminhoDaPalavra}"/>`;
  return svg(montagem.largura, montagem.altura, conteudo);
}

/** A mesma montagem como módulo TypeScript: o componente <Marca> desenha em linha, sem a fonte. */
export function moduloDaMarca(montagem = montagemDaMarca()): string {
  const campos = Object.entries(montagem).map(
    ([chave, valor]) => `  ${chave}: ${typeof valor === 'string' ? `'${valor}'` : valor},`,
  );
  return [
    '// Gerado por packages/ui/src/brand/gerar-marca.ts. Não edite à mão.',
    '',
    '/** Marca completa na grade do símbolo: recorte e posição do símbolo e da palavra em curvas. */',
    `export const MONTAGEM_DA_MARCA = {\n${campos.join('\n')}\n} as const;`,
    '',
  ].join('\n');
}

/** Tamanho do "olá" em curvas; o desenho escala com o SVG das boas-vindas. */
const TAMANHO_DO_OLA = 200;
/** Folga em volta do "olá": o traço das boas-vindas passa um pouco da borda das letras. */
export const MARGEM_DO_OLA = 2;

export interface Caixa {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface OlaEmCurvas {
  largura: number;
  altura: number;
  /** "ola", as três letras num caminho só, na ordem da escrita. */
  letras: string;
  /** O acento, num caminho próprio, desenhado depois das letras. */
  acento: string;
  /** As caixas das letras, do acento e do "a" embaixo dele, nas medidas do desenho. */
  caixas: { letras: Caixa; acento: Caixa; a: Caixa };
}

/** Um componente de um glifo composto: outro glifo, deslocado. */
interface Componente {
  glyphIndex: number;
  dx: number;
  dy: number;
}

const unir = (caixas: Caixa[]): Caixa => ({
  x1: Math.min(...caixas.map((caixa) => caixa.x1)),
  y1: Math.min(...caixas.map((caixa) => caixa.y1)),
  x2: Math.max(...caixas.map((caixa) => caixa.x2)),
  y2: Math.max(...caixas.map((caixa) => caixa.y2)),
});

/**
 * O "olá" da Sacramento em curvas, recortado junto ao desenho com a margem. O "á" da fonte é
 * composto pelo "a" e pelo acento: o "a" entra nas letras, e o acento fica num caminho próprio.
 */
export function olaEmCurvas(): OlaEmCurvas {
  const fonte = abrirFonte('@fontsource/sacramento/files/sacramento-latin-400-normal.woff');
  const escala = TAMANHO_DO_OLA / fonte.unitsPerEm;
  const glifos = [...'olá'].map((letra) => fonte.charToGlyph(letra));
  const agudo = glifos[2] as (typeof glifos)[0];
  // O glifo só lê os componentes quando o desenho dele é carregado.
  void agudo.path;
  const componentes = (agudo as unknown as { components?: Componente[] }).components;
  const [doA, doAcento] = componentes ?? [];
  if (!doA || !doAcento) throw new Error('O "á" da Sacramento deixou de ser o "a" com o acento.');
  const posicoes: number[] = [];
  let caneta = 0;
  glifos.forEach((glifo, posicao) => {
    posicoes.push(caneta);
    const seguinte = glifos[posicao + 1];
    caneta += (glifo.advanceWidth ?? 0) * escala;
    if (seguinte) caneta += fonte.getKerningValue(glifo, seguinte) * escala;
  });
  const [xDoO = 0, xDoL = 0, xDoA = 0] = posicoes;
  /** As letras e o acento com a linha de base em (x, y) no começo da palavra. */
  const desenhar = (x: number, y: number) => {
    const noLugar = (indice: number, dx: number, dy: number) =>
      fonte.glyphs.get(indice).getPath(x + dx, y - dy, TAMANHO_DO_OLA);
    const o = (glifos[0] as (typeof glifos)[0]).getPath(x + xDoO, y, TAMANHO_DO_OLA);
    const l = (glifos[1] as (typeof glifos)[0]).getPath(x + xDoL, y, TAMANHO_DO_OLA);
    const a = noLugar(doA.glyphIndex, xDoA + doA.dx * escala, doA.dy * escala);
    const acento = noLugar(doAcento.glyphIndex, xDoA + doAcento.dx * escala, doAcento.dy * escala);
    return { letras: [o, l, a], a, acento };
  };
  const rascunho = desenhar(0, 0);
  const caixa = unir(
    [...rascunho.letras, rascunho.acento].map((caminho) => caminho.getBoundingBox()),
  );
  const final = desenhar(MARGEM_DO_OLA - caixa.x1, MARGEM_DO_OLA - caixa.y1);
  const caixaDe = (caminhos: Array<{ getBoundingBox: () => Caixa }>) =>
    unir(caminhos.map((caminho) => caminho.getBoundingBox()));
  return {
    largura: casas(caixa.x2 - caixa.x1 + 2 * MARGEM_DO_OLA),
    altura: casas(caixa.y2 - caixa.y1 + 2 * MARGEM_DO_OLA),
    letras: final.letras.map((caminho) => caminho.toPathData(2)).join(''),
    acento: final.acento.toPathData(2),
    caixas: {
      letras: caixaDe(final.letras),
      acento: caixaDe([final.acento]),
      a: caixaDe([final.a]),
    },
  };
}

/** O "olá" como módulo TypeScript: as boas-vindas o desenham em linha, sem a fonte. */
export function moduloDoOla(ola = olaEmCurvas()): string {
  return [
    '// Gerado por packages/ui/src/brand/gerar-marca.ts. Não edite à mão.',
    '',
    '/**',
    ' * O "olá" das boas-vindas em curvas, da Sacramento: as letras, escritas da esquerda para a',
    ' * direita, e o acento, desenhado depois delas.',
    ' */',
    'export const OLA = {',
    `  largura: ${ola.largura},`,
    `  altura: ${ola.altura},`,
    `  letras: '${ola.letras}',`,
    `  acento: '${ola.acento}',`,
    '} as const;',
    '',
  ].join('\n');
}

/** Favicon SVG: o símbolo na cor do tema do sistema (escuro sobre claro, claro sobre escuro). */
export function faviconSvg(): string {
  const estilo = `<style>svg{color:${TRACO_ESCURO}}@media (prefers-color-scheme: dark){svg{color:${TRACO_CLARO}}}</style>`;
  return svg(GRADE_DO_SIMBOLO, GRADE_DO_SIMBOLO, estilo + grupoDoSimbolo());
}

/** Centro e medidas dos limites visíveis do símbolo. */
const larguraDoSimbolo = LIMITES_DO_SIMBOLO.direita - LIMITES_DO_SIMBOLO.esquerda;
const alturaDoSimbolo = LIMITES_DO_SIMBOLO.base - LIMITES_DO_SIMBOLO.topo;
const centroX = (LIMITES_DO_SIMBOLO.esquerda + LIMITES_DO_SIMBOLO.direita) / 2;
const centroY = (LIMITES_DO_SIMBOLO.topo + LIMITES_DO_SIMBOLO.base) / 2;

function simboloCentralizado(lado: number, escala: number): string {
  const tx = casas(lado / 2 - centroX * escala);
  const ty = casas(lado / 2 - centroY * escala);
  return comCor(grupoDoSimbolo(`translate(${tx} ${ty}) scale(${casas(escala)})`), TRACO_CLARO);
}

/** Ícone de aplicativo: placa arredondada com o símbolo ocupando 62% da altura. */
export function iconeComPlaca(lado: number): string {
  const escala = (0.62 * lado) / alturaDoSimbolo;
  const placa = `<rect width="${lado}" height="${lado}" rx="${casas(lado * 0.225)}" fill="${PLACA}"/>`;
  return svg(lado, lado, placa + simboloCentralizado(lado, escala));
}

/**
 * Ícone maskable: fundo cheio (o sistema recorta) e o desenho inteiro dentro da área segura, o
 * círculo de 80% do ícone. A caixa do símbolo cabe no círculo com folga de 10%.
 */
export function iconeMascaravel(lado: number): string {
  const raioSeguro = lado * 0.4;
  const meiaDiagonal = Math.hypot(larguraDoSimbolo / 2, alturaDoSimbolo / 2);
  const escala = (0.9 * raioSeguro) / meiaDiagonal;
  const fundo = `<rect width="${lado}" height="${lado}" fill="${PLACA}"/>`;
  return svg(lado, lado, fundo + simboloCentralizado(lado, escala));
}

const png = (conteudo: string, lado: number): Buffer =>
  Buffer.from(new Resvg(conteudo, { fitTo: { mode: 'width', value: lado } }).render().asPng());

/** ICO com PNGs dentro (formato aceito por todos os navegadores atuais). */
export function ico(imagens: Array<{ lado: number; png: Buffer }>): Buffer {
  const cabecalho = Buffer.alloc(6 + 16 * imagens.length);
  cabecalho.writeUInt16LE(0, 0);
  cabecalho.writeUInt16LE(1, 2);
  cabecalho.writeUInt16LE(imagens.length, 4);
  let deslocamento = cabecalho.length;
  imagens.forEach(({ lado, png: dados }, i) => {
    const entrada = 6 + 16 * i;
    cabecalho.writeUInt8(lado >= 256 ? 0 : lado, entrada);
    cabecalho.writeUInt8(lado >= 256 ? 0 : lado, entrada + 1);
    cabecalho.writeUInt8(0, entrada + 2);
    cabecalho.writeUInt8(0, entrada + 3);
    cabecalho.writeUInt16LE(1, entrada + 4);
    cabecalho.writeUInt16LE(32, entrada + 6);
    cabecalho.writeUInt32LE(dados.length, entrada + 8);
    cabecalho.writeUInt32LE(deslocamento, entrada + 12);
    deslocamento += dados.length;
  });
  return Buffer.concat([cabecalho, ...imagens.map((imagem) => imagem.png)]);
}

/** Ícones da PWA: com placa para a tela de início, e o maskable para a máscara do sistema. */
const ICONES_DA_PWA = [
  { nome: 'pwa-192.png', lado: 192, finalidade: 'any', desenho: iconeComPlaca },
  { nome: 'pwa-512.png', lado: 512, finalidade: 'any', desenho: iconeComPlaca },
  { nome: 'pwa-maskable-512.png', lado: 512, finalidade: 'maskable', desenho: iconeMascaravel },
];

/** Manifesto da PWA: nome, cores do tema padrão (Grafite) e os ícones gerados aqui. */
export function manifestoDaPwa(): string {
  const manifesto = {
    id: '/',
    name: NOME_DO_PRODUTO,
    short_name: NOME_DO_PRODUTO,
    description: 'Gestão de ativos, operação e governança de TI.',
    lang: 'pt-BR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: PLACA,
    theme_color: PLACA,
    icons: ICONES_DA_PWA.map(({ nome, lado, finalidade }) => ({
      src: `/icones/${nome}`,
      sizes: `${lado}x${lado}`,
      type: 'image/png',
      purpose: finalidade,
    })),
  };
  return `${JSON.stringify(manifesto, null, 2)}\n`;
}

const MARCA = 'packages/ui/src/brand';
const PUBLICO = 'apps/web/public';

/** Todos os arquivos da marca, por caminho a partir da raiz do repositório. */
export function arquivosDaMarca(): Map<string, string | Buffer> {
  const montagem = montagemDaMarca();
  const marca = marcaSvg(montagem);
  return new Map<string, string | Buffer>([
    [`${MARCA}/simbolo.svg`, simboloSvg()],
    [`${MARCA}/logotipo.svg`, logotipoSvg()],
    [`${MARCA}/marca.svg`, marca],
    [`${MARCA}/marca-escura.svg`, comCor(marca, TRACO_ESCURO)],
    [`${MARCA}/marca-clara.svg`, comCor(marca, TRACO_CLARO)],
    [`${MARCA}/gerado/marca.ts`, moduloDaMarca(montagem)],
    [`${MARCA}/gerado/ola.ts`, moduloDoOla()],
    [`${PUBLICO}/favicon.svg`, faviconSvg()],
    [
      `${PUBLICO}/favicon.ico`,
      ico([16, 32, 48].map((lado) => ({ lado, png: png(iconeComPlaca(lado), lado) }))),
    ],
    ...ICONES_DA_PWA.map(
      ({ nome, lado, desenho }) =>
        [`${PUBLICO}/icones/${nome}`, png(desenho(lado), lado)] as [string, Buffer],
    ),
    [`${PUBLICO}/manifest.webmanifest`, manifestoDaPwa()],
  ]);
}

/** Os arquivos gravados que não batem com a fonte, ou que faltam. */
export async function arquivosDesatualizados(
  arquivos: Map<string, string | Buffer>,
  raiz = raizDoRepositorio,
): Promise<string[]> {
  const diferentes: string[] = [];
  for (const [caminho, conteudo] of arquivos) {
    const atual = await readFile(join(raiz, caminho)).catch(() => null);
    if (!atual?.equals(Buffer.from(conteudo))) diferentes.push(caminho);
  }
  return diferentes;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const modo = process.argv[2];
  const arquivos = arquivosDaMarca();
  if (modo === 'escrever') {
    for (const [caminho, conteudo] of arquivos) {
      const destino = join(raizDoRepositorio, caminho);
      await mkdir(dirname(destino), { recursive: true });
      await writeFile(destino, conteudo);
    }
    console.log(`Marca gerada: ${arquivos.size} arquivos.`);
  } else if (modo === 'verificar') {
    const diferentes = await arquivosDesatualizados(arquivos);
    if (diferentes.length > 0) {
      console.error(`Marca desatualizada: ${diferentes.join(', ')}. Rode: pnpm marca:gerar`);
      process.exitCode = 1;
    } else {
      console.log('Marca em dia.');
    }
  } else {
    console.error('Uso: node packages/ui/src/brand/gerar-marca.ts escrever | verificar');
    process.exitCode = 2;
  }
}
