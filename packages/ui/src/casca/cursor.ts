// Regras do cursor suavizado (spec cursor-suavizado; design do F1b, decisão 5), em funções puras:
// o componente só lê o ponteiro e escreve a posição.
import { cursor } from '../tokens/escalas.ts';
import type { Postura } from './postura.ts';

/** Fator do Apêndice B para um quadro de 60 Hz: k = 0,65 − 0,55 × suavização/100. */
export function fatorPorQuadro(suavizacao: number): number {
  return cursor.fator.base - cursor.fator.alcance * (suavizacao / 100);
}

/**
 * O fator de 60 Hz convertido para a duração real do quadro, para a suavização ser a mesma em
 * qualquer taxa de quadros: dois quadros de 120 Hz andam o mesmo que um de 60 Hz.
 */
export function fatorNoTempo(fator60: number, duracao: number): number {
  if (duracao <= 0) return 0;
  return 1 - (1 - fator60) ** (duracao / cursor.quadroDeReferencia);
}

/** Um passo do anel em direção ao alvo. */
export function aproximar(atual: number, alvo: number, fator: number): number {
  return atual + (alvo - atual) * fator;
}

export interface Retangulo {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Forma do anel, pelo centro: redonda, seguindo o ponto, ou o contorno do elemento abraçado. */
export interface FormaDoAnel {
  x: number;
  y: number;
  largura: number;
  altura: number;
  raio: number;
}

/** O anel redondo, centrado no ponto. */
export function formaRedonda(x: number, y: number): FormaDoAnel {
  return { x, y, largura: cursor.anel, altura: cursor.anel, raio: cursor.anel / 2 };
}

/** O contorno do elemento com a folga de cada lado, e o raio dele com a mesma folga. */
export function formaDoAbraco(retangulo: Retangulo, raio: number): FormaDoAnel {
  const folga = cursor.folgaDoAbraco;
  const altura = retangulo.height + folga * 2;
  return {
    x: retangulo.left + retangulo.width / 2,
    y: retangulo.top + retangulo.height / 2,
    largura: retangulo.width + folga * 2,
    altura,
    raio: Math.min(raio + folga, altura / 2),
  };
}

/**
 * O que o anel pode abraçar. Itens de menu e opções de lista ficam de fora: eles já se destacam ao
 * passar o ponteiro. Um componente pede o abraço com `data-cursor-abracar`.
 */
const ABRACAVEL =
  'button, a[href], [role="button"], [role="link"], [role="tab"], [data-cursor-abracar]';
const DESABILITADO = ':disabled, [aria-disabled="true"], [data-disabled]';
/** Mesmo desenhados como links, quando têm endereço. */
const ITEM_DE_MENU_OU_OPCAO =
  '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"]';

/** O elemento compacto que o anel abraça, subindo a partir do que está sob o ponteiro. */
export function alvoDoAbraco(elemento: Element | null): HTMLElement | null {
  const alvo = elemento?.closest<HTMLElement>(ABRACAVEL);
  if (!alvo || alvo.matches(DESABILITADO) || alvo.closest(ITEM_DE_MENU_OU_OPCAO)) return null;
  const { width, height } = alvo.getBoundingClientRect();
  return width <= cursor.abracoMaximo.largura && height <= cursor.abracoMaximo.altura ? alvo : null;
}

/**
 * Onde o cursor do sistema volta: campos de texto e o que um componente marca com
 * `data-cursor-nativo`, como uma alça de redimensionar. O CSS do cursor usa a mesma lista.
 */
export const PEDE_CURSOR_DO_SISTEMA = [
  'input:not([type])',
  'input[type="text"]',
  'input[type="search"]',
  'input[type="email"]',
  'input[type="number"]',
  'input[type="password"]',
  'input[type="tel"]',
  'input[type="url"]',
  'textarea',
  '[contenteditable]:not([contenteditable="false"])',
  '[data-cursor-nativo]',
].join(', ');

export function pedeCursorDoSistema(elemento: Element | null): boolean {
  return elemento?.closest(PEDE_CURSOR_DO_SISTEMA) != null;
}

export interface SituacaoDoCursor {
  tipo: 'suavizado' | 'sistema';
  /** Pedido pelo sistema operacional ou pelos Ajustes. */
  movimentoReduzido: boolean;
  postura: Postura;
  /** O tipo da última entrada de ponteiro; nulo antes do primeiro movimento. */
  ultimoPonteiro: 'mouse' | 'touch' | 'pen' | null;
  dentroDaJanela: boolean;
  /** O ponteiro está sobre um campo de texto ou um elemento que pede o cursor do sistema. */
  pedeCursorDoSistema: boolean;
}

/** Se o ponto e o anel aparecem; em qualquer outro caso, vale o cursor do sistema. */
export function cursorVisivel(situacao: SituacaoDoCursor): boolean {
  return (
    situacao.tipo === 'suavizado' &&
    !situacao.movimentoReduzido &&
    situacao.postura === 'computador' &&
    situacao.ultimoPonteiro === 'mouse' &&
    situacao.dentroDaJanela &&
    !situacao.pedeCursorDoSistema
  );
}
