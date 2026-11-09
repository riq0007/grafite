// A conta que entra no sistema (design do F2b, decisão 9): só a conta anonimizada fica sem usuário e
// sem senha, e o banco confere isso. Quem lê uma conta pelo usuário ou pela sessão sempre recebe uma
// conta com as credenciais; esta função só passa isso ao TypeScript.
import type { contas } from '@grafite/db';

type Conta = typeof contas.$inferSelect;
export type ContaComCredenciais = Conta & { usuario: string; hashSenha: string };

export function comCredenciais(conta: Conta): ContaComCredenciais {
  if (conta.usuario === null || conta.hashSenha === null) {
    throw new Error('A conta anonimizada não entra no sistema.');
  }
  return conta as ContaComCredenciais;
}
