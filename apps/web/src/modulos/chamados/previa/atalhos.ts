// Os atalhos da grade dos tipos (change chamados-da-ti, design, decisão 16): as teclas 1 a 9
// escolhem o tipo da posição, sem modificador e fora de um campo do formulário. A grade da prévia
// e a gaveta da abertura (5.18) usam as mesmas funções.

/** Só os 9 primeiros tipos têm atalho: uma tecla de algarismo cada. */
const ATALHOS = 9;

/** O tipo da posição da tecla, de 1 a 9, ou nenhum. */
export function tipoPeloAtalho(tecla: string, ids: readonly string[]): string | null {
  if (!/^[1-9]$/.test(tecla)) return null;
  return ids[Number(tecla) - 1] ?? null;
}

/** A última tecla que escolhe um tipo: a do último, até o 9; sem tipos, 0. */
export const ultimoAtalho = (quantos: number): number => Math.min(quantos, ATALHOS);

export interface EventoDeTecla {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  target: EventTarget | null;
}

/** Os elementos em que a tecla é deles: os campos e o texto editável. */
const CAMPO = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/**
 * A tecla do atalho, ou nenhuma: com o Ctrl, o Alt ou o Command, o atalho é do sistema; num campo
 * do formulário, a tecla é dele, como o 3 num rádio ou num texto.
 */
export function atalhoDoEvento(evento: EventoDeTecla): string | null {
  if (evento.ctrlKey || evento.altKey || evento.metaKey) return null;
  const alvo = evento.target;
  if (alvo instanceof Element && alvo.closest(CAMPO)) return null;
  return evento.key;
}
