// Utilitário de teste do catálogo: como dois elementos estão arranjados na tela, pelas caixas.

export type Arranjo = 'lado a lado' | 'um abaixo do outro' | 'outro';

/**
 * "Lado a lado": o segundo começa à direita do primeiro, na mesma altura. "Um abaixo do outro":
 * o segundo começa depois do fim do primeiro.
 */
export function arranjoDe(primeiro: Element, segundo: Element): Arranjo {
  const a = primeiro.getBoundingClientRect();
  const b = segundo.getBoundingClientRect();
  if (b.top >= a.bottom) return 'um abaixo do outro';
  if (b.left >= a.right && Math.abs(b.top - a.top) < 1) return 'lado a lado';
  return 'outro';
}
