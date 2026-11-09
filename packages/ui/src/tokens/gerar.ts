// Gerador dos tokens (spec design-tokens): a partir das definições em TypeScript, produz
// - tokens.css: variáveis CSS por atributo no <html> (data-theme, data-accent,
//   data-density, data-motion, data-transparency);
// - variaveis.ts: os nomes das variáveis, para tipar o uso em TypeScript;
// - tokens.dtcg.json: formato DTCG com os modos em $extensions, legível por outras ferramentas.
// Primitivos nunca viram variável CSS: componentes só enxergam semânticos. No DTCG, a paleta vai
// junto, como referência.
// Uso: node packages/ui/src/tokens/gerar.ts escrever | verificar
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  coresDaSituacao,
  coresDoDestaque,
  coresDosDados,
  coresDoTema,
  type Declaracoes,
  kebab,
} from './declaracoes.ts';
import { destaqueDoTema, destaques, type IdDoDestaque, nomesDosDestaques } from './destaques.ts';
import {
  casca,
  cursor,
  densidades,
  espacos,
  fatoresDeRaio,
  LARGURA_MAXIMA_DE_FORMULARIO,
  margemLateral,
  material,
  movimento,
  nomesDasDensidades,
  OPACIDADE_DESABILITADO,
  previa,
  RAIO_BASE_PADRAO,
  TINTA_DO_ROTULO,
  tipografia,
} from './escalas.ts';
import { primitivos } from './primitivos.ts';
import {
  type CoresDoTema,
  camadasDeEstado,
  coresDoCursor,
  type IdDoTema,
  SOMBRA_DO_CURSOR,
  type Tema,
  temas,
} from './temas.ts';

const CABECALHO = '/* Gerado por packages/ui/src/tokens/gerar.ts. Não edite à mão. */\n\n';

function regra(seletor: string, declaracoes: Declaracoes, recuo = ''): string {
  const linhas = declaracoes.map(([nome, valor]) => `${recuo}  ${nome}: ${valor};`).join('\n');
  return `${recuo}${seletor} {\n${linhas}\n${recuo}}\n`;
}

/** O destaque de fábrica do CSS, até o tema e o destaque escolhidos chegarem ao <html>. */
const DESTAQUE_PADRAO: IdDoDestaque = 'grafite';

function medidasDaDensidade(d: {
  linha: number;
  miniatura: number;
  controle: number;
}): Declaracoes {
  return [
    ['--altura-linha', `${d.linha}px`],
    ['--tamanho-miniatura', `${d.miniatura}px`],
    ['--altura-controle', `${d.controle}px`],
  ];
}

function escalasFixas(): Declaracoes {
  const raios: Declaracoes = Object.entries(fatoresDeRaio).map(([elemento, fator]) => [
    `--raio-${kebab(elemento)}`,
    elemento === 'controle'
      ? `min(calc(var(--raio-base) * ${fator}), calc(var(--altura-controle) / 2 - 1px))`
      : `calc(var(--raio-base) * ${fator})`,
  ]);
  return [
    ['--fonte-interface', tipografia.familias.interface],
    ['--fonte-mono', tipografia.familias.mono],
    ...Object.entries(tipografia.tamanhos).map(([nome, px]): [string, string] => [
      `--texto-${kebab(nome)}`,
      `${px}px`,
    ]),
    ...Object.entries(tipografia.pesos).map(([nome, peso]): [string, string] => [
      `--peso-${nome}`,
      String(peso),
    ]),
    ...Object.entries(tipografia.alturasDeLinha).map(([nome, valor]): [string, string] => [
      `--entrelinha-${nome}`,
      String(valor),
    ]),
    ...Object.entries(espacos).map(([passo, px]): [string, string] => [
      `--esp-${passo}`,
      `${px}px`,
    ]),
    ['--margem-lateral', margemLateral],
    ['--largura-formulario', `${LARGURA_MAXIMA_DE_FORMULARIO}px`],
    ['--raio-base', `${RAIO_BASE_PADRAO}px`],
    ['--opacidade-desabilitado', String(OPACIDADE_DESABILITADO)],
    ['--tinta-rotulo', `${Math.round(TINTA_DO_ROTULO.situacao * 100)}%`],
    ['--tinta-rotulo-neutro', `${Math.round(TINTA_DO_ROTULO.neutra * 100)}%`],
    ...raios,
    ...Object.entries(movimento.duracoes).map(([nome, ms]): [string, string] => [
      `--dur-${kebab(nome)}`,
      `${ms}ms`,
    ]),
    ...Object.entries(movimento.atrasos).map(([nome, ms]): [string, string] => [
      `--atraso-${kebab(nome)}`,
      `${ms}ms`,
    ]),
    ['--dur-deslocamento', 'var(--dur-media)'],
    ['--dur-opacidade', 'var(--dur-rapida)'],
    ['--dur-escala-menu', 'var(--dur-menu)'],
    ['--dur-escala-busca', 'var(--dur-busca)'],
    ...Object.entries(movimento.curvas).map(([nome, curva]): [string, string] => [
      `--curva-${kebab(nome)}`,
      curva,
    ]),
    ['--filtro-material', `blur(${material.desfoque}px) saturate(${material.saturacao})`],
    ['--altura-barra-superior', `${casca.alturaBarraSuperior}px`],
    ['--tamanho-item-dock', `${casca.tamanhoItemDock}px`],
    ['--faixa-revelar-dock', `${casca.faixaRevelarDock}px`],
    ['--alvo-toque', `${casca.alvoDeToque}px`],
    ['--sombra-cursor', SOMBRA_DO_CURSOR],
    ['--tamanho-ponto-cursor', `${cursor.ponto}px`],
    ['--tamanho-anel-cursor', `${cursor.anel}px`],
    ['--folga-abraco-cursor', `${cursor.folgaDoAbraco}px`],
    ['--largura-previa', `${previa.largura}px`],
    ['--tamanho-imagem-previa', `${previa.imagem}px`],
    ['--cor-neutro', 'var(--cor-texto-2)'],
    // O código QR é lido por câmera: módulos pretos sobre branco em qualquer tema.
    ['--cor-qr-fundo', primitivos.branco],
    ['--cor-qr-modulo', primitivos.preto],
    // A etiqueta do ativo sai no papel: texto preto sobre branco em qualquer tema, também na prévia.
    ['--cor-etiqueta-fundo', primitivos.branco],
    ['--cor-etiqueta-texto', primitivos.preto],
    ['--cor-foco', 'var(--cor-destaque)'],
  ];
}

const MOVIMENTO_REDUZIDO: Declaracoes = [
  ['--dur-deslocamento', '0ms'],
  ['--dur-mola-aviso', '0ms'],
  ['--dur-giro', '0ms'],
  ['--dur-ciclo', '0ms'],
  ['--dur-escala-menu', '0ms'],
  ['--dur-escala-busca', '0ms'],
  ['--dur-ocultar-dock', '0ms'],
  // Boas-vindas e montagem: o "olá" nasce escrito, e a casca aparece sem deslocamento.
  ['--dur-traco-ola', '0ms'],
  ['--dur-preenchimento-ola', '0ms'],
  ['--atraso-preenchimento-ola', '0ms'],
  ['--atraso-subtitulo-boas-vindas', '0ms'],
  ['--dur-montagem-barra', '0ms'],
  ['--dur-montagem-dock', '0ms'],
  ['--atraso-montagem-janela', '0ms'],
  ['--atraso-montagem-dock', '0ms'],
];

const TRANSPARENCIA_REDUZIDA: Declaracoes = [
  ['--cor-material', 'var(--cor-material-solido)'],
  ['--cor-barra', 'var(--cor-superficie)'],
  ['--filtro-material', 'none'],
];

export function gerarCss(): string {
  const padrao = temas.grafite;
  let css = CABECALHO;
  css += regra(':root', [
    ...escalasFixas(),
    ...coresDoTema(padrao),
    ...coresDaSituacao(padrao),
    ...coresDosDados(padrao),
    ...coresDoDestaque(destaqueDoTema('grafite', DESTAQUE_PADRAO)),
    ...medidasDaDensidade(densidades.normal),
  ]);
  for (const [id, tema] of Object.entries(temas) as Array<[IdDoTema, Tema]>) {
    css += `\n${regra(`[data-theme="${id}"]`, [
      ...coresDoTema(tema),
      ...coresDaSituacao(tema),
      ...coresDosDados(tema),
      ...coresDoDestaque(destaqueDoTema(id, DESTAQUE_PADRAO)),
    ])}`;
  }
  for (const id of Object.keys(temas) as IdDoTema[]) {
    for (const idDestaque of Object.keys(destaques) as IdDoDestaque[]) {
      css += `\n${regra(
        `[data-theme="${id}"][data-accent="${idDestaque}"]`,
        coresDoDestaque(destaqueDoTema(id, idDestaque)),
      )}`;
    }
  }
  for (const [id, medidas] of Object.entries(densidades)) {
    css += `\n${regra(`[data-density="${id}"]`, medidasDaDensidade(medidas))}`;
  }
  css += `\n${regra('[data-motion="reduzido"]', MOVIMENTO_REDUZIDO)}`;
  css += `\n@media (prefers-reduced-motion: reduce) {\n${regra(':root:not([data-motion])', MOVIMENTO_REDUZIDO, '  ')}}\n`;
  css += `\n${regra('[data-transparency="reduzida"]', TRANSPARENCIA_REDUZIDA)}`;
  css += `\n@media (prefers-reduced-transparency: reduce) {\n${regra(':root:not([data-transparency])', TRANSPARENCIA_REDUZIDA, '  ')}}\n`;
  return css;
}

export function gerarVariaveis(): string[] {
  return [...new Set([...gerarCss().matchAll(/(--[\w-]+):/g)].map((m) => m[1] ?? ''))];
}

/**
 * Token no formato DTCG. Extensões do Grafite:
 * - grafite.modos: valor em cada modo (tema, destaque ou densidade). Um valor entre chaves, como
 *   {destaque.destaque-escuro}, aponta para outro token;
 * - grafite.css: nome da variável no tokens.css, quando o token vira variável CSS.
 */
export interface TokenDtcg {
  $type: string;
  $value: string | number;
  $extensions?: {
    'grafite.modos'?: Record<string, Record<string, string>>;
    'grafite.css'?: string;
  };
}

type GrupoDtcg<T> = { [K in keyof T]: T[K] extends string ? TokenDtcg : GrupoDtcg<T[K]> };

function token(
  $type: string,
  $value: string | number,
  css?: string,
  modos?: Record<string, Record<string, string>>,
): TokenDtcg {
  if (!css && !modos) return { $type, $value };
  return {
    $type,
    $value,
    $extensions: {
      ...(modos ? { 'grafite.modos': modos } : {}),
      ...(css ? { 'grafite.css': css } : {}),
    },
  };
}

/** Paleta bruta em DTCG, com a mesma árvore do primitivos.ts. Não vira variável CSS. */
function paletaEmDtcg<T extends object>(grupo: T): GrupoDtcg<T> {
  return Object.fromEntries(
    Object.entries(grupo).map(([chave, valor]) => [
      chave,
      typeof valor === 'string' ? token('color', valor) : paletaEmDtcg(valor as object),
    ]),
  ) as GrupoDtcg<T>;
}

/** "'Instrument Sans', system-ui, sans-serif" → "Instrument Sans". */
const primeiraFamilia = (pilha: string) => (pilha.split(',')[0] ?? '').trim().replace(/'/g, '');

const PARTES_DO_DESTAQUE = [
  'destaque',
  'destaqueTexto',
  'sobreDestaque',
  'destaqueHover',
  'destaquePressionado',
] as const;

const CSS_DA_DENSIDADE = {
  linha: '--altura-linha',
  miniatura: '--tamanho-miniatura',
  controle: '--altura-controle',
} as const;

/**
 * Tokens em DTCG: cores por tema (as de destaque apontam para o destaque do tom do tema),
 * destaques, densidades, escalas fixas (na base de raio padrão, porque o DTCG não guarda
 * expressões) e a paleta primitiva.
 */
export function gerarDtcg() {
  const idsDeTema = Object.keys(temas) as IdDoTema[];
  const porTema = (valor: (id: IdDoTema) => string) => ({
    tema: Object.fromEntries(idsDeTema.map((id) => [id, valor(id)])),
  });
  const padrao = temas.grafite;

  const cor: Record<string, TokenDtcg> = {};
  for (const nome of Object.keys(padrao.cores) as Array<keyof CoresDoTema>) {
    cor[kebab(nome)] = token(
      'color',
      padrao.cores[nome],
      `--cor-${kebab(nome)}`,
      porTema((id) => temas[id].cores[nome]),
    );
  }
  for (const nome of ['hover', 'pressionado'] as const) {
    cor[nome] = token(
      'color',
      camadasDeEstado(padrao.cores)[nome],
      `--cor-${nome}`,
      porTema((id) => camadasDeEstado(temas[id].cores)[nome]),
    );
  }
  for (const nome of ['cursorPonto', 'cursorAnel', 'cursorAbraco'] as const) {
    cor[kebab(nome)] = token(
      'color',
      coresDoCursor(padrao)[nome],
      `--cor-${kebab(nome)}`,
      porTema((id) => coresDoCursor(temas[id])[nome]),
    );
  }
  for (const nome of Object.keys(padrao.situacoes) as Array<keyof Tema['situacoes']>) {
    const id = kebab(nome);
    const partes = [
      [id, 'cor'],
      [`${id}-fundo`, 'fundo'],
      [`${id}-borda`, 'borda'],
      [`${id}-forte`, 'forte'],
      [`sobre-${id}`, 'sobre'],
    ] as const;
    for (const [chave, parte] of partes) {
      cor[chave] = token(
        'color',
        padrao.situacoes[nome][parte],
        `--cor-${chave}`,
        porTema((idDoTema) => temas[idDoTema].situacoes[nome][parte]),
      );
    }
  }
  padrao.dados.series.forEach((serie, indice) => {
    cor[`serie-${indice + 1}`] = token(
      'color',
      serie,
      `--cor-serie-${indice + 1}`,
      porTema((id) => temas[id].dados.series[indice] ?? ''),
    );
  });
  for (const tinta of Object.keys(padrao.dados.tintas) as Array<keyof Tema['dados']['tintas']>) {
    cor[`tinta-${tinta}`] = token(
      'color',
      padrao.dados.tintas[tinta],
      `--cor-tinta-${tinta}`,
      porTema((id) => temas[id].dados.tintas[tinta]),
    );
  }
  cor.neutro = token('color', '{cor.texto-2}', '--cor-neutro');
  for (const nome of PARTES_DO_DESTAQUE) {
    cor[kebab(nome)] = token(
      'color',
      `{destaque.${kebab(nome)}-grafite}`,
      `--cor-${kebab(nome)}`,
      porTema((id) => `{destaque.${kebab(nome)}-${id}}`),
    );
  }
  cor.foco = token('color', '{cor.destaque}', '--cor-foco');

  // O destaque é gerado para cada tema: um token por parte e por tema, com os destaques como modos.
  const destaque: Record<string, TokenDtcg> = {};
  for (const idDoTema of idsDeTema) {
    for (const nome of PARTES_DO_DESTAQUE) {
      destaque[`${kebab(nome)}-${idDoTema}`] = token(
        'color',
        destaqueDoTema(idDoTema, DESTAQUE_PADRAO)[nome],
        undefined,
        {
          destaque: Object.fromEntries(
            (Object.keys(destaques) as IdDoDestaque[]).map((id) => [
              id,
              destaqueDoTema(idDoTema, id)[nome],
            ]),
          ),
        },
      );
    }
  }

  const densidade: Record<string, TokenDtcg> = {};
  for (const medida of ['linha', 'miniatura', 'controle'] as const) {
    densidade[medida] = token(
      'dimension',
      `${densidades.normal[medida]}px`,
      CSS_DA_DENSIDADE[medida],
      {
        densidade: Object.fromEntries(
          Object.entries(densidades).map(([id, d]) => [id, `${d[medida]}px`]),
        ),
      },
    );
  }

  const raio: Record<string, TokenDtcg> = {
    base: token('dimension', `${RAIO_BASE_PADRAO}px`, '--raio-base'),
    ...Object.fromEntries(
      Object.entries(fatoresDeRaio).map(([elemento, fator]) => [
        kebab(elemento),
        token(
          'dimension',
          `${Math.round(RAIO_BASE_PADRAO * fator * 100) / 100}px`,
          `--raio-${kebab(elemento)}`,
        ),
      ]),
    ),
  };

  const esp = Object.fromEntries(
    Object.entries(espacos).map(([passo, px]) => [
      passo,
      token('dimension', `${px}px`, `--esp-${passo}`),
    ]),
  );
  const texto = Object.fromEntries(
    Object.entries(tipografia.tamanhos).map(([nome, px]) => [
      kebab(nome),
      token('dimension', `${px}px`, `--texto-${kebab(nome)}`),
    ]),
  );
  const peso = Object.fromEntries(
    Object.entries(tipografia.pesos).map(([nome, valor]) => [
      nome,
      token('fontWeight', valor, `--peso-${nome}`),
    ]),
  );
  const fonte = Object.fromEntries(
    Object.entries(tipografia.familias).map(([nome, pilha]) => [
      nome,
      token('fontFamily', primeiraFamilia(pilha), `--fonte-${nome}`),
    ]),
  );
  const entrelinha = Object.fromEntries(
    Object.entries(tipografia.alturasDeLinha).map(([nome, valor]) => [
      nome,
      token('number', valor, `--entrelinha-${nome}`),
    ]),
  );

  return {
    $extensions: {
      'grafite.modos': {
        tema: Object.fromEntries(idsDeTema.map((id) => [id, temas[id].nome])),
        destaque: nomesDosDestaques,
        densidade: nomesDasDensidades,
      },
    },
    cor,
    destaque,
    densidade,
    raio,
    esp,
    texto,
    peso,
    fonte,
    entrelinha,
    opacidade: {
      desabilitado: token('number', OPACIDADE_DESABILITADO, '--opacidade-desabilitado'),
    },
    tinta: {
      rotulo: token('number', TINTA_DO_ROTULO.situacao, '--tinta-rotulo'),
      'rotulo-neutro': token('number', TINTA_DO_ROTULO.neutra, '--tinta-rotulo-neutro'),
    },
    casca: {
      'altura-barra-superior': token(
        'dimension',
        `${casca.alturaBarraSuperior}px`,
        '--altura-barra-superior',
      ),
      'tamanho-item-dock': token('dimension', `${casca.tamanhoItemDock}px`, '--tamanho-item-dock'),
      'faixa-revelar-dock': token(
        'dimension',
        `${casca.faixaRevelarDock}px`,
        '--faixa-revelar-dock',
      ),
      'alvo-toque': token('dimension', `${casca.alvoDeToque}px`, '--alvo-toque'),
    },
    cursor: {
      ponto: token('dimension', `${cursor.ponto}px`, '--tamanho-ponto-cursor'),
      anel: token('dimension', `${cursor.anel}px`, '--tamanho-anel-cursor'),
      'folga-abraco': token('dimension', `${cursor.folgaDoAbraco}px`, '--folga-abraco-cursor'),
    },
    previa: {
      largura: token('dimension', `${previa.largura}px`, '--largura-previa'),
      imagem: token('dimension', `${previa.imagem}px`, '--tamanho-imagem-previa'),
    },
    material: { desfoque: token('dimension', `${material.desfoque}px`) },
    sombra: {
      elevada: token(
        'shadow',
        padrao.sombraElevada,
        '--sombra-elevada',
        porTema((id) => temas[id].sombraElevada),
      ),
      sobreposta: token(
        'shadow',
        padrao.sombraMaterial,
        '--sombra-sobreposta',
        porTema((id) => temas[id].sombraMaterial),
      ),
    },
    primitivos: paletaEmDtcg(primitivos),
  };
}

const pastaGerada = join(dirname(fileURLToPath(import.meta.url)), 'gerado');

export async function arquivosGerados(): Promise<Map<string, string>> {
  const variaveis = gerarVariaveis();
  const ts = `// Gerado por packages/ui/src/tokens/gerar.ts. Não edite à mão.\n\nexport const variaveis = [\n${variaveis.map((v) => `  '${v}',`).join('\n')}\n] as const;\n\nexport type Variavel = (typeof variaveis)[number];\n`;
  return new Map([
    ['tokens.css', gerarCss()],
    ['variaveis.ts', ts],
    ['tokens.dtcg.json', `${JSON.stringify(gerarDtcg(), null, 2)}\n`],
  ]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const modo = process.argv[2];
  const arquivos = await arquivosGerados();
  if (modo === 'escrever') {
    await mkdir(pastaGerada, { recursive: true });
    for (const [nome, conteudo] of arquivos) await writeFile(join(pastaGerada, nome), conteudo);
    console.log(`Tokens gerados em ${pastaGerada}.`);
  } else if (modo === 'verificar') {
    const diferentes: string[] = [];
    for (const [nome, conteudo] of arquivos) {
      const atual = await readFile(join(pastaGerada, nome), 'utf8').catch(() => null);
      if (atual !== conteudo) diferentes.push(nome);
    }
    if (diferentes.length > 0) {
      console.error(
        `Tokens gerados desatualizados: ${diferentes.join(', ')}. Rode: pnpm tokens:gerar`,
      );
      process.exitCode = 1;
    } else {
      console.log('Tokens gerados em dia.');
    }
  } else {
    console.error('Uso: node packages/ui/src/tokens/gerar.ts escrever | verificar');
    process.exitCode = 2;
  }
}
