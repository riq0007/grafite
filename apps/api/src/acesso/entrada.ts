// A entrada concluída (spec entrada-e-sessoes): a sessão passa a valer sem nenhum passo pendente. É
// o momento da "última entrada" da conta e o evento que a auditoria chama de entrada concluída.
import { contas, doisPassos, sessoes, type Transacao } from '@grafite/db';
import { and, eq } from 'drizzle-orm';
import { type EventoDeAuditoria, registrarNaAuditoria } from '../auditoria.ts';
import { carregarAcesso, exigeDoisPassos } from './acesso.ts';
import { pendenciaDa } from './pendencia.ts';
import { ativarSessao, type SessaoDaRequisicao } from './sessoes.ts';

export async function concluirEntrada(
  tx: Transacao,
  {
    sessaoId,
    contaId,
    momento,
    origem,
  }: { sessaoId: string; contaId: string; momento: Date; origem: EventoDeAuditoria['origem'] },
) {
  await tx.update(contas).set({ ultimaEntradaEm: momento }).where(eq(contas.id, contaId));
  await registrarNaAuditoria(tx, {
    acao: 'entrada.concluida',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'sessao', id: sessaoId },
    origem,
    momento,
  });
}

/**
 * Depois de um passo resolvido, a pendência da vez, lida de novo do banco. Se não sobrou nenhuma e
 * a sessão ainda estava pendente, ela passa a valer: token novo e a entrada concluída.
 */
export async function seguirEntrada(
  tx: Transacao,
  {
    sessao,
    momento,
    origem,
  }: {
    sessao: Pick<SessaoDaRequisicao, 'id' | 'contaId' | 'tokenCsrf' | 'expiraEm'>;
    momento: Date;
    origem: EventoDeAuditoria['origem'];
  },
) {
  const [linha] = await tx
    .select({
      senhaTemporaria: contas.senhaTemporaria,
      exigeDoisPassos: contas.exigeDoisPassos,
      doisPassosAtivadoEm: doisPassos.ativadoEm,
      segundoPassoEm: sessoes.segundoPassoEm,
      ativadaEm: sessoes.ativadaEm,
    })
    .from(sessoes)
    .innerJoin(contas, and(eq(contas.orgId, sessoes.orgId), eq(contas.id, sessoes.contaId)))
    .leftJoin(doisPassos, eq(doisPassos.contaId, contas.id))
    .where(eq(sessoes.id, sessao.id));
  if (!linha) throw new Error('A sessão da entrada sumiu.');
  const acesso = await carregarAcesso(tx, sessao.contaId);
  const pendencia = pendenciaDa({
    conta: { ...linha, exigeDoisPassos: exigeDoisPassos(linha, acesso) },
    doisPassosAtivos: linha.doisPassosAtivadoEm !== null,
    segundoPassoEm: linha.segundoPassoEm,
  });
  if (pendencia === null && linha.ativadaEm === null) {
    const ativa = await ativarSessao(tx, sessao.id, momento);
    await concluirEntrada(tx, { sessaoId: sessao.id, contaId: sessao.contaId, momento, origem });
    return { pendencia, token: ativa.token, tokenCsrf: ativa.tokenCsrf, expiraEm: ativa.expiraEm };
  }
  return { pendencia, token: null, tokenCsrf: sessao.tokenCsrf, expiraEm: sessao.expiraEm };
}
