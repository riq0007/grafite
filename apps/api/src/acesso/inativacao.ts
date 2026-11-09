// A inativação de uma conta (specs administracao-de-pessoas e entrada-e-sessoes), pela própria conta
// ou pela pessoa dela: todas as sessões terminam com `conta-inativada`, e as atribuições continuam
// registradas. Os aparelhos do push da conta saem (change p3c-email-e-push). Quem chama roda na
// trava `acessos`, porque a conta pode ser de quem administra.
import { contas, inscricoesDePush, type Transacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import {
  type Ator,
  type EventoDeAuditoria,
  registrarNaAuditoria,
  visaoDaConta,
} from '../auditoria.ts';
import { saidaDaConta } from '../eventos/pessoas.ts';
import { encerrarSessoesDaConta } from './encerramento.ts';

export async function inativarConta(
  tx: Transacao,
  {
    contaId,
    ator,
    origem,
    momento,
  }: { contaId: string; ator: Ator; origem?: EventoDeAuditoria['origem']; momento: Date },
) {
  const [antes] = await tx.select().from(contas).where(eq(contas.id, contaId));
  if (!antes) throw new Error('A conta não existe.');
  const [depois] = await tx
    .update(contas)
    .set({ situacao: 'inativa', atualizadaEm: momento })
    .where(eq(contas.id, contaId))
    .returning();
  if (!depois) throw new Error('A conta não foi inativada.');
  await registrarNaAuditoria(tx, {
    acao: 'conta.inativada',
    ator,
    alvo: { tipo: 'conta', id: contaId },
    antes: visaoDaConta(antes),
    depois: visaoDaConta(depois),
    origem,
    momento,
    saida: await saidaDaConta(tx, contaId),
  });
  await tx.delete(inscricoesDePush).where(eq(inscricoesDePush.contaId, contaId));
  const sessoesEncerradas = await encerrarSessoesDaConta(tx, {
    contaId,
    motivo: 'conta-inativada',
    momento,
    ator,
    origem,
  });
  return { conta: depois, sessoesEncerradas };
}
