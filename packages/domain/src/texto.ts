/** Texto comparável: sem acento, em minúsculas, com espaços simples e sem bordas. */
export function normalizarTexto(valor: string): string {
  return valor.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
