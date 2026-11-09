// O usuário da conta (spec contas-de-acesso): único na organização, comparado sem diferenciar
// maiúsculas e sem os espaços das pontas. A mesma forma é conferida pelo banco
// (contas_usuario_normalizado).

/** O usuário como a entrada e o banco o comparam: sem os espaços das pontas e em minúsculas. */
export function normalizarUsuario(digitado: string): string {
  return digitado.trim().toLowerCase();
}

const TAMANHO = { minimo: 3, maximo: 64 };
const ACEITOS = /^[a-z0-9._-]+$/;
const PRIMEIRO = /^[a-z0-9]/;

/** Por que o usuário não serve para uma conta nova, em pt-BR, ou `null` se ele serve. */
export function validarUsuario(digitado: string): string | null {
  const usuario = normalizarUsuario(digitado);
  if (usuario.length < TAMANHO.minimo || usuario.length > TAMANHO.maximo) {
    return `Use de ${TAMANHO.minimo} a ${TAMANHO.maximo} caracteres.`;
  }
  if (!ACEITOS.test(usuario)) {
    return 'Use só letras sem acento, números, ponto (.), hífen (-) e sublinhado (_).';
  }
  if (!PRIMEIRO.test(usuario)) return 'Comece por uma letra ou um número.';
  return null;
}
