// As contas que atendem os chamados como estão agora (spec tipos-de-chamado, "Prazo e atendimento
// do tipo"; spec chamados, "Ações do atendimento" e "Notificações dos chamados"; change
// chamados-da-ti, design, decisões 4, 7 e 12): a conta de quem atende um tipo por padrão, a escolhida
// do passar e a de antes do assumir, ativa, com a pessoa ativa, e o alcance de `chamados.atender`
// pelo acesso dela; o nome de quem atende; as contas que a triagem avisa; e as que o editor do tipo
// oferece em quem atende por padrão. A conta de outra
// organização não aparece, pelo RLS.
import { contas, pessoas, type Transacao } from '@grafite/db';
import {
  type ArvoreDeLocais,
  alcance,
  type ContaQueRecebe,
  type ContaQueRecebeATriagem,
} from '@grafite/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { carregarAcesso, carregarAcessosDaOrganizacao } from '../acesso/acesso.ts';

/** A conta, com o nome de agora da pessoa dela, ou nula, quando não existe. */
export async function lerContaQueAtende(
  tx: Transacao,
  contaId: string,
  arvore: Pick<ArvoreDeLocais, 'ramo'>,
): Promise<ContaQueRecebe | null> {
  const [conta] = await tx
    .select({ conta: contas.situacao, pessoa: pessoas.situacao, nome: pessoas.nome })
    .from(contas)
    .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
    .where(eq(contas.id, contaId));
  if (!conta) return null;
  const ativa = conta.conta === 'ativa' && conta.pessoa === 'ativa';
  return {
    id: contaId,
    nome: conta.nome,
    ativa,
    alcance: ativa ? alcance(await carregarAcesso(tx, contaId), 'chamados.atender', arvore) : null,
  };
}

/** O nome de agora da pessoa da conta que atende. */
export async function nomeDaConta(tx: Transacao, contaId: string): Promise<string> {
  const [linha] = await tx
    .select({ nome: pessoas.nome })
    .from(contas)
    .innerJoin(pessoas, eq(pessoas.id, contas.pessoaId))
    .where(eq(contas.id, contaId));
  return linha?.nome ?? '';
}

/** As contas ativas da organização com o alcance de `chamados.atender`, para avisar a triagem. */
export async function contasDaTriagem(
  tx: Transacao,
  arvore: Pick<ArvoreDeLocais, 'ramo'>,
): Promise<ContaQueRecebeATriagem[]> {
  return (await carregarAcessosDaOrganizacao(tx)).map((conta) => ({
    id: conta.id,
    alcance: alcance(conta.acesso, 'chamados.atender', arvore),
  }));
}

/**
 * As contas ativas, com a pessoa ativa, que atendem os chamados em algum local, com o nome da pessoa,
 * pelo nome: as que o editor do tipo oferece em quem atende por padrão.
 */
export async function contasQueAtendem(
  tx: Transacao,
  arvore: Pick<ArvoreDeLocais, 'ramo'>,
): Promise<{ id: string; nome: string }[]> {
  const ids = (await carregarAcessosDaOrganizacao(tx))
    .filter((conta) => alcance(conta.acesso, 'chamados.atender', arvore) !== null)
    .map((conta) => conta.id);
  if (ids.length === 0) return [];
  const lidas = await tx
    .select({ id: contas.id, nome: pessoas.nome })
    .from(contas)
    .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
    .where(inArray(contas.id, ids));
  return lidas.sort(
    (uma, outra) => uma.nome.localeCompare(outra.nome, 'pt-BR') || uma.id.localeCompare(outra.id),
  );
}
