// Verificador de cores literais: toda cor do Grafite vem dos tokens em
// packages/ui/src/tokens (spec design-tokens, "Fonte única de valores visuais").
// Uso: node scripts/verificar-cores.ts [raiz]. Sai com código 1 se achar cor literal.
//
// Em TS/JS só o conteúdo de strings é examinado (evita campos privados como #fade
// e comentários). Em CSS, todo o texto fora de comentários; nomes de cor só contam
// como valor de propriedade. É uma heurística: texto JSX com apóstrofo pode confundir
// o leitor de strings.
//
// O hex e as funções de cor contam em todo lugar. O nome de cor numa string só conta
// no código das telas (apps/web, apps/painel e packages/ui): fora delas, ele é dado, como a cor
// "magenta" de um consumível (change p4b-consumiveis, design, decisão 8).

import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export type TipoDeArquivo = 'ts' | 'tsx' | 'js' | 'jsx' | 'css';

export interface CorLiteral {
  linha: number;
  coluna: number;
  trecho: string;
}

export interface Achado extends CorLiteral {
  arquivo: string;
}

// Nomes de cor do CSS, exceto transparent e currentColor, que não são cores da paleta.
const NOMES_DE_COR = new Set(
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'.split(
    ' ',
  ),
);

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const FUNCAO_DE_COR = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)/gi;
// Declaração CSS: o valor termina em ";" ou "}" (nunca em "{", que seria um seletor).
const DECLARACAO_CSS = /[-\w]+\s*:\s*([^;{}]*)(?=[;}])/g;
const PALAVRA = /[a-zA-Z]+/g;
const PROPRIEDADE_PERSONALIZADA = /--[-\w]+/g;

interface Ocorrencia {
  indice: number;
  trecho: string;
}

function hexEFuncoes(texto: string, deslocamento: number): Ocorrencia[] {
  const achados: Ocorrencia[] = [];
  for (const m of texto.matchAll(HEX))
    achados.push({ indice: deslocamento + m.index, trecho: m[0] });
  for (const m of texto.matchAll(FUNCAO_DE_COR)) {
    achados.push({ indice: deslocamento + m.index, trecho: m[0] });
  }
  return achados;
}

function segmentosDeString(fonte: string): Array<{ inicio: number; texto: string }> {
  const segmentos: Array<{ inicio: number; texto: string }> = [];
  const n = fonte.length;
  let i = 0;
  while (i < n) {
    const c = fonte[i];
    const proximo = fonte[i + 1];
    if (c === '/' && proximo === '/') {
      const fim = fonte.indexOf('\n', i);
      i = fim === -1 ? n : fim;
    } else if (c === '/' && proximo === '*') {
      const fim = fonte.indexOf('*/', i + 2);
      i = fim === -1 ? n : fim + 2;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n && fonte[j] !== c) {
        if (fonte[j] === '\\') j++;
        else if (c !== '`' && fonte[j] === '\n') break;
        j++;
      }
      segmentos.push({ inicio: i + 1, texto: fonte.slice(i + 1, j) });
      i = j + 1;
    } else {
      i++;
    }
  }
  return segmentos;
}

function semComentariosCss(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, (comentario) => comentario.replace(/[^\n]/g, ' '));
}

function ocorrenciasTs(fonte: string, nomes: boolean): Ocorrencia[] {
  const achados: Ocorrencia[] = [];
  for (const { inicio, texto } of segmentosDeString(fonte)) {
    achados.push(...hexEFuncoes(texto, inicio));
    const nome = texto.trim();
    if (nomes && NOMES_DE_COR.has(nome.toLowerCase())) {
      achados.push({ indice: inicio + texto.indexOf(nome), trecho: nome });
    }
  }
  return achados;
}

function ocorrenciasCss(fonte: string): Ocorrencia[] {
  const limpo = semComentariosCss(fonte);
  const achados = hexEFuncoes(limpo, 0);
  for (const declaracao of limpo.matchAll(DECLARACAO_CSS)) {
    const valor = declaracao[1] ?? '';
    const inicioValor = declaracao.index + declaracao[0].length - valor.length;
    const semVariaveis = valor.replace(PROPRIEDADE_PERSONALIZADA, (v) => ' '.repeat(v.length));
    for (const palavra of semVariaveis.matchAll(PALAVRA)) {
      if (NOMES_DE_COR.has(palavra[0].toLowerCase())) {
        achados.push({ indice: inicioValor + palavra.index, trecho: palavra[0] });
      }
    }
  }
  return achados;
}

function paraLinhaEColuna(fonte: string, ocorrencias: Ocorrencia[]): CorLiteral[] {
  const iniciosDeLinha = [0];
  for (let i = 0; i < fonte.length; i++) if (fonte[i] === '\n') iniciosDeLinha.push(i + 1);
  return ocorrencias
    .sort((a, b) => a.indice - b.indice)
    .map(({ indice, trecho }) => {
      let linha = 0;
      while (linha + 1 < iniciosDeLinha.length && (iniciosDeLinha[linha + 1] ?? 0) <= indice)
        linha++;
      return { linha: linha + 1, coluna: indice - (iniciosDeLinha[linha] ?? 0) + 1, trecho };
    });
}

/**
 * As cores literais de um arquivo. Com `nomes` falso, o nome de cor numa string de TS/JS não
 * conta, como fora do código das telas; no CSS ele sempre conta.
 */
export function encontrarCoresLiterais(
  fonte: string,
  tipo: TipoDeArquivo,
  { nomes = true }: { nomes?: boolean } = {},
): CorLiteral[] {
  const ocorrencias = tipo === 'css' ? ocorrenciasCss(fonte) : ocorrenciasTs(fonte, nomes);
  return paraLinhaEColuna(fonte, ocorrencias);
}

/** O código que desenha as telas, onde um nome de cor numa string é uma cor da tela. */
const CODIGO_DAS_TELAS = ['apps/web/', 'apps/painel/', 'packages/ui/'];

const DIRETORIOS_IGNORADOS = new Set([
  '.git',
  '.turbo',
  '.claude',
  'node_modules',
  'dist',
  'coverage',
  'storybook-static',
  'playwright-report',
  'test-results',
  'docs',
  'openspec',
]);
const CAMINHOS_IGNORADOS = ['packages/ui/src/tokens'];
const TIPO_POR_EXTENSAO: Record<string, TipoDeArquivo> = {
  '.ts': 'ts',
  '.mts': 'ts',
  '.tsx': 'tsx',
  '.js': 'js',
  '.mjs': 'js',
  '.jsx': 'jsx',
  '.css': 'css',
};
const ARQUIVO_DE_TESTE = /\.(test|spec)\.[cm]?[jt]sx?$/;

async function* arquivos(raiz: string, diretorio: string): AsyncGenerator<string> {
  for (const entrada of await readdir(diretorio, { withFileTypes: true })) {
    const completo = join(diretorio, entrada.name);
    const relativo = relative(raiz, completo).split(sep).join('/');
    if (entrada.isDirectory()) {
      if (DIRETORIOS_IGNORADOS.has(entrada.name)) continue;
      if (CAMINHOS_IGNORADOS.some((c) => relativo === c || relativo.startsWith(`${c}/`))) continue;
      yield* arquivos(raiz, completo);
    } else if (entrada.isFile()) {
      yield relativo;
    }
  }
}

export async function verificarRepositorio(raiz: string): Promise<Achado[]> {
  const achados: Achado[] = [];
  for await (const arquivo of arquivos(raiz, raiz)) {
    const tipo = TIPO_POR_EXTENSAO[extname(arquivo)];
    if (!tipo || ARQUIVO_DE_TESTE.test(arquivo)) continue;
    const fonte = await readFile(join(raiz, arquivo), 'utf8');
    const nomes = CODIGO_DAS_TELAS.some((prefixo) => arquivo.startsWith(prefixo));
    for (const cor of encontrarCoresLiterais(fonte, tipo, { nomes })) {
      achados.push({ arquivo, ...cor });
    }
  }
  return achados.sort(
    (a, b) => a.arquivo.localeCompare(b.arquivo) || a.linha - b.linha || a.coluna - b.coluna,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const achados = await verificarRepositorio(resolve(process.argv[2] ?? process.cwd()));
  for (const a of achados) console.log(`${a.arquivo}:${a.linha}:${a.coluna}  ${a.trecho}`);
  if (achados.length > 0) {
    console.log(
      `\n${achados.length} cor(es) literal(is) fora dos tokens. Use as variáveis de packages/ui/src/tokens.`,
    );
    process.exitCode = 1;
  }
}
