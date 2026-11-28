// O identificador curto do aparelho da aba (change aba-dos-colaboradores, design, decisão 11): 6
// caracteres do alfabeto do Crockford, sem I, L, O e U, que o comando no servidor aceita para
// escolher o aparelho quando o nome se repete. Quem digita pode trocar o I e o L pelo 1 e o O pelo
// 0, e escrever em minúsculas.

export const ALFABETO_DO_CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const TAMANHO_DO_IDENTIFICADOR_CURTO = 6;

/** Um identificador curto a partir de bytes aleatórios, um caractere por byte. */
export function identificadorCurto(bytes: Uint8Array): string {
  if (bytes.length < TAMANHO_DO_IDENTIFICADOR_CURTO) {
    throw new Error(`O identificador curto pede ${TAMANHO_DO_IDENTIFICADOR_CURTO} bytes.`);
  }
  return Array.from(
    bytes.subarray(0, TAMANHO_DO_IDENTIFICADOR_CURTO),
    (byte) => ALFABETO_DO_CROCKFORD[byte % ALFABETO_DO_CROCKFORD.length],
  ).join('');
}

/**
 * O identificador curto como foi gravado, a partir do que a pessoa digitou, ou `null` quando o
 * texto não é um: maiúsculas, o I e o L viram 1, o O vira 0, e o hífen e os espaços saem.
 */
export function lerIdentificadorCurto(texto: string): string | null {
  const limpo = texto
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  if (limpo.length !== TAMANHO_DO_IDENTIFICADOR_CURTO) return null;
  return [...limpo].every((caractere) => ALFABETO_DO_CROCKFORD.includes(caractere)) ? limpo : null;
}
