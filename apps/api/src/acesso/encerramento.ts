// O fim das sessões de uma conta por uma ação (spec entrada-e-sessoes): a troca da senha, a
// ativação dos dois passos ou a redefinição pelo comando no servidor. Cada sessão encerrada fica na
// auditoria, com o motivo; a que já tinha expirado não conta.
import { type MOTIVOS_DO_FIM_DA_SESSAO, sessoes, type Transacao } from '@grafite/db';
import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import { type Ator, type EventoDeAuditoria, registrarNaAuditoria } from '../auditoria.ts';

export type MotivoDoFim = (typeof MOTIVOS_DO_FIM_DA_SESSAO)[number];

export interface EncerramentoDeSessoes {
  contaId: string;
  motivo: MotivoDoFim;
  momento: Date;
  ator: Ator;
  origem?: EventoDeAuditoria['origem'];
  /** A sessão que continua, como a de quem trocou a senha. */
  exceto?: string;
}

/** Encerra as sessões abertas da conta e devolve quantas foram. */
export async function encerrarSessoesDaConta(
  tx: Transacao,
  { contaId, motivo, momento, ator, origem, exceto }: EncerramentoDeSessoes,
): Promise<number> {
  const encerradas = await tx
    .update(sessoes)
    .set({ encerradaEm: momento, motivoDoFim: motivo })
    .where(
      and(
        eq(sessoes.contaId, contaId),
        isNull(sessoes.encerradaEm),
        gt(sessoes.expiraEm, momento),
        exceto ? ne(sessoes.id, exceto) : undefined,
      ),
    )
    .returning({ id: sessoes.id, ip: sessoes.ip, agente: sessoes.agente });
  for (const sessao of encerradas) {
    await registrarNaAuditoria(tx, {
      acao: 'sessao.encerrada',
      ator,
      alvo: { tipo: 'sessao', id: sessao.id },
      dados: { motivo },
      origem,
      momento,
    });
  }
  return encerradas.length;
}

/** Encerra uma sessão da conta, se ela ainda estiver aberta; diz se encerrou. */
export async function encerrarSessao(
  tx: Transacao,
  {
    sessaoId,
    contaId,
    motivo,
    momento,
    ator,
    origem,
  }: Omit<EncerramentoDeSessoes, 'exceto'> & { sessaoId: string },
): Promise<boolean> {
  const [encerrada] = await tx
    .update(sessoes)
    .set({ encerradaEm: momento, motivoDoFim: motivo })
    .where(and(eq(sessoes.id, sessaoId), eq(sessoes.contaId, contaId), isNull(sessoes.encerradaEm)))
    .returning({ id: sessoes.id });
  if (!encerrada) return false;
  await registrarNaAuditoria(tx, {
    acao: 'sessao.encerrada',
    ator,
    alvo: { tipo: 'sessao', id: sessaoId },
    dados: { motivo },
    origem,
    momento,
  });
  return true;
}
