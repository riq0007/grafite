// Símbolo do Grafite (conceito C, "traço", escolhido em 25/09/2026): o g num traço só, com a
// descida virando um risco reto, como um sublinhado a lápis. Grade de 32, centralizada.
import type { CoresDoTema } from '../tokens/temas.ts';

/** Nome do produto num lugar só: títulos dos SVG, manifesto da PWA e nome acessível da marca. */
export const NOME_DO_PRODUTO = 'Grafite';

/** Cor com que a marca é desenhada na interface (contraste verificado nos seis temas). */
export const COR_DA_MARCA: keyof CoresDoTema = 'texto';

export const GRADE_DO_SIMBOLO = 32;
export const TRACO_DO_SIMBOLO = 3;

/** Bojo e haste com o risco, desenhados só com traço (sem preenchimento). */
export const BOJO = { cx: 17.9, cy: 12.1, r: 6.25 } as const;
export const HASTE = 'M24.15 5.85V22.1a4 4 0 0 1-4 4H7.9';

export const DESENHO_DO_SIMBOLO = [
  `<circle cx="${BOJO.cx}" cy="${BOJO.cy}" r="${BOJO.r}"/>`,
  `<path d="${HASTE}"/>`,
].join('');

/** Limites visíveis do desenho na grade (o traço de 3 passa 1,5 além de cada linha). */
export const LIMITES_DO_SIMBOLO = { esquerda: 6.4, direita: 25.65, topo: 4.35, base: 27.6 };

/** Grupo SVG do símbolo, na cor de onde for usado. */
export function grupoDoSimbolo(transformacao = ''): string {
  const transform = transformacao ? ` transform="${transformacao}"` : '';
  return `<g fill="none" stroke="currentColor" stroke-width="${TRACO_DO_SIMBOLO}" stroke-linecap="round" stroke-linejoin="round"${transform}>${DESENHO_DO_SIMBOLO}</g>`;
}
