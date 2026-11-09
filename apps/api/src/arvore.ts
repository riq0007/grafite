// A árvore de locais da organização (design do F2b, decisão 3): lida inteira, de uma vez, e
// resolvida pelo domínio. Quem altera a árvore a lê dentro da trava `locais`.
import { locais, type Transacao } from '@grafite/db';
import { type ArvoreDeLocais, type LocalDaArvore, montarArvore } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { conflito, naoEncontrado } from './problemas.ts';

export const COLUNAS_DO_LOCAL = {
  id: locais.id,
  paiId: locais.paiId,
  nome: locais.nome,
  tipo: locais.tipo,
  situacao: locais.situacao,
};

/** Todos os locais da organização, ativos e inativos, em ordem de nome. */
export function lerLocais(tx: Transacao): Promise<LocalDaArvore[]> {
  return tx.select(COLUNAS_DO_LOCAL).from(locais).orderBy(locais.nome, locais.id);
}

export async function lerArvore(tx: Transacao): Promise<ArvoreDeLocais> {
  return montarArvore(await lerLocais(tx));
}

export const LOCAL_INATIVO = 'O local escolhido está inativo. Escolha um local ativo.';

/**
 * O local escolhido para uma pessoa ou uma atribuição existe e está ativo. A linha fica travada
 * para leitura até o fim da transação: a inativação do local, que a trava para alterar, espera.
 */
export async function exigirLocalAtivo(tx: Transacao, localId: string, campo: string) {
  const [local] = await tx
    .select({ situacao: locais.situacao })
    .from(locais)
    .where(eq(locais.id, localId))
    .for('share');
  if (!local) throw naoEncontrado('Local não encontrado.');
  if (local.situacao !== 'ativo') throw conflito(LOCAL_INATIVO, { [campo]: LOCAL_INATIVO });
}
