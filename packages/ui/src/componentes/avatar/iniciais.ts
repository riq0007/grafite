/** Partículas que não entram nas iniciais ("Ana dos Santos" → "AS"). */
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/** Iniciais do primeiro e do último nome, em maiúsculas, preservando acentos. */
export function iniciais(nome: string): string {
  const partes = nome
    .normalize('NFC')
    .trim()
    .split(/\s+/)
    .filter((parte) => parte && !PARTICULAS.has(parte.toLocaleLowerCase('pt-BR')));
  const primeira = partes[0];
  if (!primeira) return '';
  const ultima = partes.length > 1 ? partes[partes.length - 1] : undefined;
  return [primeira, ultima]
    .filter((parte): parte is string => Boolean(parte))
    .map((parte) => (Array.from(parte)[0] ?? '').toLocaleUpperCase('pt-BR'))
    .join('');
}
