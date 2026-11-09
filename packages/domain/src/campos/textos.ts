// O texto de um campo: sem espaços nas pontas, com o limite em caracteres, e não em bytes.
import { aceito, type Leitura, recusado, vazio } from './tipos.ts';

const milhares = (numero: number) => String(numero).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** O texto da entrada, com o número de uma célula de planilha virando texto. */
export function lerTexto(entrada: unknown, limite: number): Leitura<string> {
  if (vazio(entrada)) return aceito(null);
  if (typeof entrada !== 'string' && typeof entrada !== 'number') return recusado('Use um texto.');
  const texto = String(entrada).trim();
  if ([...texto].length > limite) return recusado(`Use até ${milhares(limite)} caracteres.`);
  return aceito(texto);
}
