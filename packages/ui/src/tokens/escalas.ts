// Escalas não cromáticas: raio, densidade, espaço, tipografia, movimento e material.

/** Fatores de raio por elemento, aplicados sobre a base ajustável (Apêndice A.4). */
export const fatoresDeRaio = {
  janela: 1,
  controle: 0.58,
  dock: 1.45,
  itemDock: 0.85,
  menu: 0.85,
  miniatura: 0.58,
  rotulo: 0.42,
  aviso: 1,
} as const;

export type ElementoComRaio = keyof typeof fatoresDeRaio;

export const RAIO_BASE_PADRAO = 10;
export const RAIO_BASE_MAXIMO = 24;

const duasCasas = (valor: number) => Math.round(valor * 100) / 100;

/**
 * Raio de cada elemento para uma base. O raio do controle nunca passa de metade
 * da altura do menor controle menos 1 px, para nenhum botão virar cápsula.
 */
export function escalaDeRaio(
  base: number,
  alturaMinimaDeControle: number,
): Record<ElementoComRaio, number> {
  const raios = Object.fromEntries(
    Object.entries(fatoresDeRaio).map(([elemento, fator]) => [elemento, duasCasas(base * fator)]),
  ) as Record<ElementoComRaio, number>;
  raios.controle = Math.min(raios.controle, alturaMinimaDeControle / 2 - 1);
  return raios;
}

/** Altura da linha de tabela, lado da miniatura e altura do controle, em px. */
export const densidades = {
  compacta: { linha: 36, miniatura: 24, controle: 32 },
  normal: { linha: 44, miniatura: 30, controle: 36 },
  confortavel: { linha: 52, miniatura: 36, controle: 40 },
} as const;

export type Densidade = keyof typeof densidades;

/** Nome de cada densidade como aparece para o usuário (Ajustes e DTCG). */
export const nomesDasDensidades: Record<Densidade, string> = {
  compacta: 'Compacta',
  normal: 'Normal',
  confortavel: 'Confortável',
};

/** Escala de espaço em px (múltiplos de 4). */
export const espacos = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;

/**
 * Margem lateral fluida: 16 px mais 1% da largura, até 40 px. Em px, e não em rem, porque a raiz
 * usa o corpo de texto (14 px).
 */
export const margemLateral = 'clamp(16px, 16px + 1vw, 40px)';

export const LARGURA_MAXIMA_DE_FORMULARIO = 960;

/**
 * Intensidade do fundo tingido do rótulo de situação. O neutro é mais leve: com 15%, o texto
 * secundário cai abaixo de 4,5:1 sobre a superfície 2 do Meia-noite.
 */
export const TINTA_DO_ROTULO = { situacao: 0.15, neutra: 0.1 } as const;

/** Controle desabilitado: fica visível, mas recua (a WCAG isenta o desabilitado de contraste). */
export const OPACIDADE_DESABILITADO = 0.45;

export const tipografia = {
  familias: {
    interface: "'Instrument Sans', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
  },
  /** Tamanhos em px. */
  tamanhos: {
    legenda: 11,
    rotulo: 12,
    dado: 13,
    corpo: 14,
    subtitulo: 16,
    titulo: 20,
    tituloGrande: 26,
    numeral: 28,
  },
  pesos: { normal: 400, medio: 500, forte: 600 },
  alturasDeLinha: { justa: 1.25, normal: 1.4 },
} as const;

export const movimento = {
  /**
   * Durações em ms. A mola do aviso e a sequência de boas-vindas, com a montagem da casca que a
   * segue, são as exceções nomeadas no ANTISLOP v2; as boas-vindas acontecem uma vez só.
   */
  duracoes: {
    rapida: 120,
    media: 200,
    lenta: 300,
    molaAviso: 550,
    giro: 900,
    menu: 170,
    ciclo: 1400,
    /** Esconder e revelar o dock (Apêndice B). */
    ocultarDock: 280,
    /** Abrir e fechar a busca (Apêndice B). */
    busca: 180,
    /** Boas-vindas (seção 7.5 e Apêndice B): o traço do "olá", o preenchimento e o subtítulo. */
    tracoOla: 2100,
    preenchimentoOla: 700,
    subtituloBoasVindas: 500,
    /** "Bem-vindo ao Grafite" fica à vista este tempo antes da saída, também sem movimento. */
    permanenciaBoasVindas: 850,
    saidaBoasVindas: 380,
    /** Montagem da casca depois das boas-vindas: a barra desce, a janela aparece e o dock sobe. */
    montagemBarra: 420,
    montagemJanela: 500,
    montagemDock: 620,
  },
  /** Atrasos em ms, contados do começo da etapa: boas-vindas e montagem (Apêndice B). */
  atrasos: {
    preenchimentoOla: 1750,
    subtituloBoasVindas: 2100,
    montagemJanela: 80,
    montagemDock: 160,
  },
  curvas: {
    padrao: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    saida: 'cubic-bezier(0.4, 0, 1, 1)',
    mola: 'cubic-bezier(0.2, 1.25, 0.3, 1)',
    molaSuave: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)',
    /** A escrita do "olá" das boas-vindas: começa devagar, acelera e assenta no fim. */
    escrita: 'cubic-bezier(0.45, 0.05, 0.3, 1)',
  },
} as const;

/** Vidro fosco das camadas sobrepostas. */
export const material = { desfoque: 22, saturacao: 1.7 } as const;

/** Medidas da casca OS, em px. O item do dock é ajustável de 28 a 64 px (48 px de fábrica). */
export const casca = {
  alturaBarraSuperior: 28,
  tamanhoItemDock: 48,
  tamanhoItemDockMinimo: 28,
  tamanhoItemDockMaximo: 64,
  /** Faixa na borda do dock escondido que o revela quando o ponteiro chega. */
  faixaRevelarDock: 18,
  /** Menor área de toque de um alvo da casca no tablet e no celular. */
  alvoDeToque: 44,
} as const;

/** Ampliação do dock sob o ponteiro: até +55%, gaussiana com σ = 1,3 × o tamanho do item. */
export const ampliacaoDoDock = { maxima: 0.55, sigma: 1.3 } as const;

/**
 * Cursor suavizado (Apêndice B), em px. O anel segue o ponto com o fator
 * `k = base − alcance × suavização/100` por quadro de 60 Hz; o abraço envolve elementos compactos,
 * com a folga de cada lado.
 */
export const cursor = {
  ponto: 6,
  anel: 26,
  folgaDoAbraco: 4,
  abracoMaximo: { largura: 320, altura: 128 },
  fator: { base: 0.65, alcance: 0.55 },
  /** Duração do quadro para o qual o fator foi definido (60 Hz), em ms. */
  quadroDeReferencia: 1000 / 60,
} as const;

/** Prévia do registro (Quick Look), em px: largura máxima e o lado máximo da imagem. */
export const previa = { largura: 720, imagem: 256 } as const;

/**
 * Larguras que mudam a postura da casca, em px: abaixo de `celular` a casca vira celular; abaixo
 * de `barraCompleta` a barra superior reúne os menus do módulo num só. O CSS repete os valores
 * nas media queries (media query não aceita variável), e um teste confere que batem.
 */
export const LIMITES_DE_POSTURA = { celular: 768, barraCompleta: 1024 } as const;
