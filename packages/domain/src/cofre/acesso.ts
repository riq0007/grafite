// O acesso a um segredo do cofre (spec cofre-de-segredos, "Acesso ao segredo" e "Liberação do cofre
// por 5 minutos"; design do P6, decisões 3 e 4): dado segredo a segredo a contas, grupos e perfis. A
// API faz a mesma conta numa subconsulta; esta é a regra que os testes conferem.

/** O titular de um acesso ao segredo. */
export type TipoDeTitular = 'conta' | 'grupo' | 'perfil';

export const TIPOS_DE_TITULAR = [
  'conta',
  'grupo',
  'perfil',
] as const satisfies readonly TipoDeTitular[];

export interface AcessoAoSegredo {
  tipo: TipoDeTitular;
  id: string;
}

/**
 * Os titulares de uma conta: ela mesma, os grupos ativos de que participa, com a participação em
 * vigor, e os perfis ativos das atribuições em vigor dela, diretas e pelos grupos, em qualquer
 * escopo.
 */
export interface TitularesDaConta {
  contaId: string;
  grupos: readonly string[];
  perfis: readonly string[];
}

/** Se a conta alcança o segredo por algum dos acessos dele. */
export function alcancaOSegredo(
  acessos: readonly AcessoAoSegredo[],
  { contaId, grupos, perfis }: TitularesDaConta,
): boolean {
  return acessos.some(
    ({ tipo, id }) =>
      (tipo === 'conta' && id === contaId) ||
      (tipo === 'grupo' && grupos.includes(id)) ||
      (tipo === 'perfil' && perfis.includes(id)),
  );
}

/** Quanto tempo o código do app libera revelar e copiar na sessão, em ms. */
export const DURACAO_DA_LIBERACAO_DO_COFRE = 5 * 60_000;
