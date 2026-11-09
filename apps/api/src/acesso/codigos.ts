// Os códigos de recuperação e a senha temporária (design do F2a, decisões 4 e 7), no alfabeto de
// Crockford, que deixa de fora I, L, O e U para ninguém confundir 1 com I nem 0 com O ao copiar.
import { createHash } from 'node:crypto';
import { aleatoriosCrockford, CROCKFORD } from '../crockford.ts';

const QUANTOS_CODIGOS = 10;
const TAMANHO_DO_CODIGO = 10;

/** Dez códigos de uso único, como "a7k2m-9qx4t" (cerca de 50 bits cada). */
export function gerarCodigosDeRecuperacao(): string[] {
  const codigos = new Set<string>();
  while (codigos.size < QUANTOS_CODIGOS) {
    const codigo = aleatoriosCrockford(TAMANHO_DO_CODIGO).toLowerCase();
    codigos.add(`${codigo.slice(0, 5)}-${codigo.slice(5)}`);
  }
  return [...codigos];
}

/** O código como ele é comparado: maiúsculas, sem hífen nem espaço, I e L como 1 e O como 0. */
export function normalizarCodigoDeRecuperacao(digitado: string): string {
  return digitado.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
}

/** O código normalizado tem a forma de um código de recuperação, e não de um código do app. */
export function pareceCodigoDeRecuperacao(digitado: string): boolean {
  return new RegExp(`^[${CROCKFORD}]{${TAMANHO_DO_CODIGO}}$`).test(
    normalizarCodigoDeRecuperacao(digitado),
  );
}

/** SHA-256 do código normalizado: com uns 50 bits de acaso, um hash lento não acrescenta nada. */
export function hashDoCodigo(digitado: string): Buffer {
  return createHash('sha256').update(normalizarCodigoDeRecuperacao(digitado)).digest();
}

/** Senha temporária do comando no servidor: 16 caracteres em grupos de 4 (cerca de 80 bits). */
export function gerarSenhaTemporaria(): string {
  return aleatoriosCrockford(16).replace(/(.{4})(?=.)/g, '$1-');
}
