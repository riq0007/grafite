import { normalizarTexto } from '@grafite/domain';

/** Os grupos já usados pelos campos, sem repetir, pela ordem alfabética. */
export function gruposUsados(campos: readonly { grupo: string | null }[]): string[] {
  const porForma = new Map<string, string>();
  for (const { grupo } of campos) {
    if (grupo && !porForma.has(normalizarTexto(grupo))) porForma.set(normalizarTexto(grupo), grupo);
  }
  return [...porForma.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, grupo]) => grupo);
}
