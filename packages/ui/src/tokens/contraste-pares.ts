// Contraste por uso real (spec design-tokens, "Contraste verificado automaticamente"):
// cada par é uma cor usada sobre um fundo, com o mínimo WCAG 2.2 AA do uso.
// Fundos translúcidos (material, barra, tintas) são medidos já compostos.
import { comAlfa, compor, contraste } from './contraste.ts';
import { destaqueDoTema, destaques } from './destaques.ts';
import { TINTA_DO_ROTULO_NEUTRO } from './escalas.ts';
import { gerarAbaFlutuante, type TemaDoWindows } from './gerador.ts';
import { camadasDeEstado, coresDoCursor, temas } from './temas.ts';

export type Cores = Record<string, string>;
export type Fundo = string | { camada: string; sobre: string };

export interface Par {
  uso: string;
  frente: (c: Cores) => string;
  fundo: (c: Cores) => Fundo;
  minimo: number;
}

export interface Resultado {
  uso: string;
  razao: number;
  minimo: number;
  passou: boolean;
}

const TEXTO = 4.5;
/** O texto de exemplo dos campos, o secundário sobre a afundada: o nível AAA. */
const TEXTO_DE_EXEMPLO = 7;
const COMPONENTE = 3;

const sobre = (camada: string, base: string): Fundo => ({ camada, sobre: base });

const NOMES_DAS_SITUACOES: Record<string, string> = {
  ok: 'de sucesso',
  atencao: 'de atenção',
  critico: 'crítico',
  info: 'de informação',
};

export const PARES: Par[] = [
  {
    uso: 'texto sobre o fundo',
    frente: (c) => c.texto ?? '',
    fundo: (c) => c.fundo ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre a superfície',
    frente: (c) => c.texto ?? '',
    fundo: (c) => c.superficie ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre a superfície 2',
    frente: (c) => c.texto ?? '',
    fundo: (c) => c.superficie2 ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre a superfície afundada',
    frente: (c) => c.texto ?? '',
    fundo: (c) => c.superficieAfundada ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto secundário sobre o fundo',
    frente: (c) => c.texto2 ?? '',
    fundo: (c) => c.fundo ?? '',
    minimo: TEXTO,
  },
  {
    // O texto de exemplo dos campos fica na afundada (change ajustes-dos-tokens, design, decisão 1).
    uso: 'texto secundário sobre a superfície afundada',
    frente: (c) => c.texto2 ?? '',
    fundo: (c) => c.superficieAfundada ?? '',
    minimo: TEXTO_DE_EXEMPLO,
  },
  {
    uso: 'texto secundário sobre a superfície',
    frente: (c) => c.texto2 ?? '',
    fundo: (c) => c.superficie ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto secundário sobre a superfície 2',
    frente: (c) => c.texto2 ?? '',
    fundo: (c) => c.superficie2 ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre o material',
    frente: (c) => c.texto ?? '',
    fundo: (c) => sobre(c.material ?? '', c.fundo ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto secundário sobre o material',
    frente: (c) => c.texto2 ?? '',
    fundo: (c) => sobre(c.material ?? '', c.fundo ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre a barra superior',
    frente: (c) => c.texto ?? '',
    fundo: (c) => sobre(c.barra ?? '', c.fundo ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto secundário sobre a barra superior',
    frente: (c) => c.texto2 ?? '',
    fundo: (c) => sobre(c.barra ?? '', c.fundo ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre linha alternada',
    frente: (c) => c.texto ?? '',
    fundo: (c) => sobre(c.zebra ?? '', c.superficie ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto do destaque sobre o fundo',
    frente: (c) => c.destaqueTexto ?? '',
    fundo: (c) => c.fundo ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto do destaque sobre a superfície',
    frente: (c) => c.destaqueTexto ?? '',
    fundo: (c) => c.superficie ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto do destaque sobre a superfície 2',
    frente: (c) => c.destaqueTexto ?? '',
    fundo: (c) => c.superficie2 ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto do destaque sobre o material',
    frente: (c) => c.destaqueTexto ?? '',
    fundo: (c) => sobre(c.material ?? '', c.fundo ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre o destaque (botão primário)',
    frente: (c) => c.sobreDestaque ?? '',
    fundo: (c) => c.destaque ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre o destaque em hover (botão primário)',
    frente: (c) => c.sobreDestaque ?? '',
    fundo: (c) => c.destaqueHover ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre o destaque pressionado (botão primário)',
    frente: (c) => c.sobreDestaque ?? '',
    fundo: (c) => c.destaquePressionado ?? '',
    minimo: TEXTO,
  },
  // A camada de pressionado é a mais forte: se ela passa, o hover (mais leve) também passa.
  {
    uso: 'texto sobre a superfície 2 pressionada (botão secundário)',
    frente: (c) => c.texto ?? '',
    fundo: (c) => sobre(c.pressionado ?? '', c.superficie2 ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre o fundo pressionado (botão terciário)',
    frente: (c) => c.texto ?? '',
    fundo: (c) => sobre(c.pressionado ?? '', c.fundo ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto crítico sobre a superfície 2 pressionada (botão destrutivo)',
    frente: (c) => c.critico ?? '',
    fundo: (c) => sobre(c.pressionado ?? '', c.superficie2 ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto crítico sobre o fundo pressionado (botão destrutivo)',
    frente: (c) => c.critico ?? '',
    fundo: (c) => sobre(c.pressionado ?? '', c.fundo ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre a linha selecionada',
    frente: (c) => c.texto ?? '',
    fundo: (c) => sobre(comAlfa(c.destaque ?? '', 0.13), c.superficie ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'destaque contra a superfície (seleção)',
    frente: (c) => c.destaque ?? '',
    fundo: (c) => c.superficie ?? '',
    minimo: COMPONENTE,
  },
  {
    uso: 'anel de foco contra o fundo',
    frente: (c) => c.destaque ?? '',
    fundo: (c) => c.fundo ?? '',
    minimo: COMPONENTE,
  },
  {
    uso: 'anel de foco contra a superfície 2',
    frente: (c) => c.destaque ?? '',
    fundo: (c) => c.superficie2 ?? '',
    minimo: COMPONENTE,
  },
  {
    uso: 'borda de controle contra a superfície',
    frente: (c) => c.bordaControle ?? '',
    fundo: (c) => c.superficie ?? '',
    minimo: COMPONENTE,
  },
  // O anel do cursor é translúcido: medido já composto sobre cada fundo por onde o ponteiro passa.
  ...(
    [
      ['fundo', 'o fundo'],
      ['superficie', 'a superfície'],
      ['superficie2', 'a superfície 2'],
    ] as const
  ).map(
    ([fundo, nome]): Par => ({
      uso: `anel do cursor contra ${nome}`,
      frente: (c) => compor(c.cursorAnel ?? '', c[fundo] ?? ''),
      fundo: (c) => c[fundo] ?? '',
      minimo: COMPONENTE,
    }),
  ),
  {
    uso: 'borda de controle contra a superfície 2',
    frente: (c) => c.bordaControle ?? '',
    fundo: (c) => c.superficie2 ?? '',
    minimo: COMPONENTE,
  },
  // O rótulo fica sobre o fundo gerado da situação, com a tinta dela (change ajustes-dos-tokens).
  ...Object.entries(NOMES_DAS_SITUACOES).flatMap(([id, nome]): Par[] => [
    {
      uso: `rótulo ${nome} sobre a superfície tingida`,
      frente: (c) => c[id] ?? '',
      fundo: (c) => sobre(c[`${id}Fundo`] ?? '', c.superficie ?? ''),
      minimo: TEXTO,
    },
    {
      uso: `rótulo ${nome} sobre a superfície 2 tingida`,
      frente: (c) => c[id] ?? '',
      fundo: (c) => sobre(c[`${id}Fundo`] ?? '', c.superficie2 ?? ''),
      minimo: TEXTO,
    },
    {
      // Nome da situação no aviso; o crítico também é o texto do item destrutivo do menu.
      uso: `texto ${nome} sobre o material (aviso e menu)`,
      frente: (c) => c[id] ?? '',
      fundo: (c) => sobre(c.material ?? '', c.fundo ?? ''),
      minimo: TEXTO,
    },
  ]),
  {
    uso: 'rótulo neutro sobre a superfície tingida',
    frente: (c) => c.texto2 ?? '',
    fundo: (c) => sobre(comAlfa(c.texto2 ?? '', TINTA_DO_ROTULO_NEUTRO), c.superficie ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'rótulo neutro sobre a superfície 2 tingida',
    frente: (c) => c.texto2 ?? '',
    fundo: (c) => sobre(comAlfa(c.texto2 ?? '', TINTA_DO_ROTULO_NEUTRO), c.superficie2 ?? ''),
    minimo: TEXTO,
  },
  // As cores da aba dos chamados (spec design-tokens, "Cores da aba").
  {
    uso: 'texto da aba sobre o fundo da aba (faixa, número e escolhido)',
    frente: (c) => c.abaTexto ?? '',
    fundo: (c) => c.abaFundo ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto da aba sobre o fundo da aba pressionado (tipo, cartão e chip escolhidos)',
    frente: (c) => c.abaTexto ?? '',
    fundo: (c) => sobre(c.pressionado ?? '', c.abaFundo ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto da aba sobre o fundo 2 da aba (pílula da trilha)',
    frente: (c) => c.abaTexto ?? '',
    fundo: (c) => c.abaFundo2 ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto da aba sobre o bloco da aba (quem pede)',
    frente: (c) => c.abaTexto ?? '',
    fundo: (c) => c.abaBloco ?? '',
    minimo: TEXTO,
  },
  // O "Trocar" fica dentro do bloco de quem pede, e o hover dele escurece ou clareia o bloco.
  {
    uso: 'texto da aba sobre o bloco da aba pressionado (Trocar)',
    frente: (c) => c.abaTexto ?? '',
    fundo: (c) => sobre(c.pressionado ?? '', c.abaBloco ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre a atenção da aba (selo)',
    frente: (c) => c.abaSobreAtencao ?? '',
    fundo: (c) => c.abaAtencao ?? '',
    minimo: TEXTO,
  },
  ...(
    [
      ['superficie', 'a superfície'],
      ['superficie2', 'a superfície 2 (ícone do tipo e "Nenhum")'],
      ['superficieElevada', 'a superfície elevada (moldura)'],
    ] as const
  ).map(
    ([fundo, nome]): Par => ({
      uso: `contorno da aba contra ${nome}`,
      frente: (c) => c.abaContorno ?? '',
      fundo: (c) => c[fundo] ?? '',
      minimo: COMPONENTE,
    }),
  ),
];

export function avaliar(cores: Cores, pares: Par[]): Resultado[] {
  return pares.map((par) => {
    const f = par.fundo(cores);
    const fundo = typeof f === 'string' ? f : compor(f.camada, f.sobre);
    const exata = contraste(par.frente(cores), fundo);
    return {
      uso: par.uso,
      razao: Math.floor(exata * 100) / 100,
      minimo: par.minimo,
      passou: exata >= par.minimo,
    };
  });
}

export function coresDaCombinacao(
  idTema: keyof typeof temas,
  idDestaque: keyof typeof destaques,
): Cores {
  const tema = temas[idTema];
  const situacoes = Object.fromEntries(
    Object.entries(tema.situacoes).flatMap(([id, situacao]) => [
      [id, situacao.cor],
      [`${id}Fundo`, situacao.fundo],
    ]),
  );
  const aba = Object.fromEntries(
    Object.entries(tema.aba).map(([nome, cor]) => [
      `aba${nome.charAt(0).toUpperCase()}${nome.slice(1)}`,
      cor,
    ]),
  );
  return {
    ...tema.cores,
    ...camadasDeEstado(tema.cores),
    ...coresDoCursor(tema),
    ...situacoes,
    ...aba,
    ...destaqueDoTema(idTema, idDestaque),
  };
}

export function avaliarTudo(): Array<Resultado & { tema: string; destaque: string }> {
  return (Object.keys(temas) as Array<keyof typeof temas>).flatMap((tema) =>
    (Object.keys(destaques) as Array<keyof typeof destaques>).flatMap((destaque) =>
      avaliar(coresDaCombinacao(tema, destaque), PARES).map((r) => ({ ...r, tema, destaque })),
    ),
  );
}

/**
 * A aba do Windows (change aba-dos-colaboradores, design, decisão 9), medida nos três temas do
 * Windows, fora das 24 combinações. A área é o fundo das janelas do Windows 11 no tema; no alto
 * contraste, as cores do sistema são as do Alto Contraste Preto.
 */
export const AREA_DO_WINDOWS: Record<TemaDoWindows, string> = {
  escuro: '#202020',
  claro: '#f3f3f3',
  altoContraste: '#000000',
};

export const CORES_DO_SISTEMA_DE_REFERENCIA: Record<string, string> = {
  Canvas: '#000000',
  CanvasText: '#ffffff',
  Highlight: '#1aebff',
  HighlightText: '#000000',
  LinkText: '#ffff00',
  GrayText: '#3ff23f',
  transparent: 'rgba(0, 0, 0, 0)',
};

export const NOMES_DOS_TEMAS_DO_WINDOWS: Record<TemaDoWindows, string> = {
  escuro: 'Escuro',
  claro: 'Claro',
  altoContraste: 'Alto contraste',
};

export interface ParDaAba extends Par {
  /** Os temas do Windows em que o par existe; sem a lista, nos três. */
  temas?: TemaDoWindows[];
}

const daAba = (
  uso: string,
  frente: string,
  fundo: string,
  minimo: number,
  temas?: TemaDoWindows[],
): ParDaAba => ({
  uso,
  frente: (c) => c[frente] ?? '',
  fundo: (c) => c[fundo] ?? '',
  minimo,
  ...(temas ? { temas } : {}),
});

/**
 * Onde a forma encontra a área: no escuro, o fio claro e o anel do foco a separam; no claro, o
 * azul, com o fio escuro por fora. O azul sozinho sobre a área escura e o fio claro sobre a área
 * clara não precisam passar, e não entram.
 */
export const PARES_DA_ABA_FLUTUANTE: ParDaAba[] = [
  daAba('texto sobre o azul', 'texto', 'fundo', TEXTO),
  daAba(
    'texto sobre o fundo 2 (a linha da resposta, a pílula pressionada)',
    'texto',
    'fundo2',
    TEXTO,
  ),
  daAba('texto sobre a opção', 'texto', 'bloco', TEXTO),
  daAba('texto sobre a opção sob o mouse', 'texto', 'blocoSobMouse', TEXTO),
  daAba('segundo tom sobre o azul (quem respondeu)', 'segundoTom', 'fundo', TEXTO),
  daAba(
    'segundo tom sobre o fundo 2 (o título e a hora da resposta)',
    'segundoTom',
    'fundo2',
    TEXTO,
  ),
  daAba('texto da opção larga ("Abrir chamado")', 'sobreOpcaoLarga', 'opcaoLarga', TEXTO),
  daAba('texto sobre o âmbar (selo)', 'sobreAtencao', 'atencao', TEXTO),
  daAba('ponto do aviso sobre o azul', 'atencao', 'fundo', COMPONENTE),
  daAba('fio sobre o azul', 'contorno', 'fundo', COMPONENTE),
  daAba('anel do foco sobre a folga (fundo 2)', 'foco', 'fundo2', COMPONENTE),
  daAba('texto sobre o neutro (sem conexão)', 'texto', 'neutro', TEXTO),
  daAba('texto sobre a opção neutra', 'texto', 'neutroBloco', TEXTO),
  daAba('segundo tom sobre o neutro', 'segundoTom', 'neutro', TEXTO),
  daAba('indisponível sobre a opção desligada (neutro 2)', 'textoIndisponivel', 'neutro2', TEXTO),
  daAba('fio neutro sobre o neutro', 'neutroContorno', 'neutro', COMPONENTE),
  daAba('fio claro sobre a área', 'contorno', 'area', COMPONENTE, ['escuro', 'altoContraste']),
  daAba('fio neutro sobre a área', 'neutroContorno', 'area', COMPONENTE, [
    'escuro',
    'altoContraste',
  ]),
  daAba('anel do foco sobre a área', 'foco', 'area', COMPONENTE, ['escuro', 'altoContraste']),
  daAba('azul sobre a área', 'fundo', 'area', COMPONENTE, ['claro']),
  daAba('neutro sobre a área', 'neutro', 'area', COMPONENTE, ['claro']),
  {
    uso: 'fio escuro por fora sobre a área',
    frente: (c) => c.fioEscuro ?? '',
    fundo: (c) => c.area ?? '',
    minimo: COMPONENTE,
    temas: ['claro'],
  },
  {
    uso: 'anel do foco contra o fio escuro por fora',
    frente: (c) => c.foco ?? '',
    fundo: (c) => sobre(c.fioEscuro ?? '', c.area ?? ''),
    minimo: COMPONENTE,
    temas: ['escuro', 'claro'],
  },
];

/** As cores da aba num tema do Windows, com as do sistema trocadas pelas de referência. */
export function coresDaAbaNoWindows(tema: TemaDoWindows): Cores {
  const cores = Object.fromEntries(
    Object.entries(gerarAbaFlutuante(tema)).map(([nome, cor]) => [
      nome,
      CORES_DO_SISTEMA_DE_REFERENCIA[cor] ?? cor,
    ]),
  );
  return { ...cores, area: AREA_DO_WINDOWS[tema] };
}

export function avaliarAbaFlutuante(): Array<Resultado & { tema: TemaDoWindows }> {
  return (Object.keys(AREA_DO_WINDOWS) as TemaDoWindows[]).flatMap((tema) =>
    avaliar(
      coresDaAbaNoWindows(tema),
      PARES_DA_ABA_FLUTUANTE.filter((par) => !par.temas || par.temas.includes(tema)),
    ).map((r) => ({ ...r, tema })),
  );
}
