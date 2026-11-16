// A conta de quem atende um tipo por padrão como ela está agora (spec tipos-de-chamado, "Prazo e
// atendimento do tipo"; change chamados-da-ti, design, decisão 7): ativa, com a pessoa ativa, e o
// alcance de `chamados.atender` pelo acesso dela. A conta de outra organização não aparece, pelo
// RLS, e volta nula.
import { contas, pessoas, type Transacao } from '@grafite/db';
import { type ArvoreDeLocais, alcance, type ContaQueAtendePorPadrao } from '@grafite/domain';
import { and, eq } from 'drizzle-orm';
import { carregarAcesso } from '../acesso/acesso.ts';

export async function lerContaQueAtende(
  tx: Transacao,
  contaId: string,
  arvore: Pick<ArvoreDeLocais, 'ramo'>,
): Promise<ContaQueAtendePorPadrao | null> {
  const [conta] = await tx
    .select({ conta: contas.situacao, pessoa: pessoas.situacao })
    .from(contas)
    .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
    .where(eq(contas.id, contaId));
  if (!conta) return null;
  const ativa = conta.conta === 'ativa' && conta.pessoa === 'ativa';
  return {
    id: contaId,
    ativa,
    alcance: ativa ? alcance(await carregarAcesso(tx, contaId), 'chamados.atender', arvore) : null,
  };
}
