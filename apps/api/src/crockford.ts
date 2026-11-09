// O alfabeto de Crockford: base32 sem I, L, O e U, que se confundem ao ler e ao copiar. Os códigos
// que alguém lê ou digita (rastreio, recuperação e senha temporária) saem dele.
import { randomBytes } from 'node:crypto';

export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Caracteres aleatórios do alfabeto: 32 letras, então cada byte dá uma sem viés (256 = 8 × 32). */
export function aleatoriosCrockford(quantos: number): string {
  return Array.from(randomBytes(quantos), (byte) => CROCKFORD[byte & 31]).join('');
}
