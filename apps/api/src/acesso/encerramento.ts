// O fim das sessões de uma conta por uma ação (spec entrada-e-sessoes): a troca da senha, a
// ativação dos dois passos ou a redefinição pelo comando no servidor. Cada sessão encerrada fica na
// auditoria, com o motivo; a que já tinha expirado não conta. As sessões da aba e as do chat na aba
// contam como as outras (change aba-dos-colaboradores), e o fim da sessão da aba leva junto o chat
// na aba dela.
import {
  aparelhosDaAba,
  contas,
  type MOTIVOS_DO_FIM_DA_SESSAO,
  type MOTIVOS_DO_FIM_DA_SESSAO_DA_ABA,
  sessoes,
  sessoesDaAba,
  type Transacao,
} from '@grafite/db';
import { and, eq, gt, inArray, isNull, ne, type SQL } from 'drizzle-orm';
import { type Ator, type EventoDeAuditoria, registrarNaAuditoria } from '../auditoria.ts';
import { registrarEvento } from '../eventos/saida.ts';

export type MotivoDoFim = (typeof MOTIVOS_DO_FIM_DA_SESSAO)[number];
export type MotivoDoFimDaAba = (typeof MOTIVOS_DO_FIM_DA_SESSAO_DA_ABA)[number];

export interface EncerramentoDeSessoes {
  contaId: string;
  motivo: MotivoDoFim;
  momento: Date;
  ator: Ator;
  origem?: EventoDeAuditoria['origem'];
  /** A sessão que continua, como a de quem trocou a senha. */
  exceto?: string;
}

/**
 * O que segue o fim das sessões da aba dadas: as sessões do chat na aba delas terminam junto, e o
 * `sessao.encerrada` vai à aba e ao chat da aba de cada uma (design, decisão 6), que fecham a
 * conexão de eventos. Sem a auditoria: a do fim da sessão da aba já diz.
 */
export async function fimDasSessoesDaAba(
  tx: Transacao,
  sessoesDaAbaIds: string[],
  momento: Date,
): Promise<void> {
  if (sessoesDaAbaIds.length === 0) return;
  const chats = await tx
    .update(sessoes)
    .set({ encerradaEm: momento, motivoDoFim: 'sessao-da-aba-encerrada' })
    .where(and(inArray(sessoes.sessaoDaAbaId, sessoesDaAbaIds), isNull(sessoes.encerradaEm)))
    .returning({ id: sessoes.id });
  await registrarEvento(tx, {
    tipo: 'sessao.encerrada',
    alvo: null,
    publico: { sessoesDaAba: sessoesDaAbaIds, sessoes: chats.map((chat) => chat.id) },
  });
}

/**
 * Encerra as sessões abertas da aba que o filtro escolhe, com as do chat na aba delas, e põe cada
 * uma na auditoria, com o computador e o motivo. Devolve quantas foram.
 */
export async function encerrarSessoesDaAba(
  tx: Transacao,
  {
    onde,
    motivo,
    momento,
    ator,
    origem,
  }: {
    onde: SQL | undefined;
    motivo: MotivoDoFimDaAba;
    momento: Date;
    ator: Ator;
    origem?: EventoDeAuditoria['origem'];
  },
): Promise<number> {
  const encerradas = await tx
    .update(sessoesDaAba)
    .set({ encerradaEm: momento, motivoDoFim: motivo })
    .where(and(onde, isNull(sessoesDaAba.encerradaEm)))
    .returning({
      id: sessoesDaAba.id,
      contaId: sessoesDaAba.contaId,
      aparelhoId: sessoesDaAba.aparelhoId,
    });
  if (encerradas.length === 0) return 0;
  await fimDasSessoesDaAba(
    tx,
    encerradas.map((sessao) => sessao.id),
    momento,
  );
  const aparelhos = await tx
    .select({
      id: aparelhosDaAba.id,
      nome: aparelhosDaAba.nome,
      identificadorCurto: aparelhosDaAba.identificadorCurto,
    })
    .from(aparelhosDaAba)
    .where(
      inArray(
        aparelhosDaAba.id,
        encerradas.map((sessao) => sessao.aparelhoId),
      ),
    );
  const donos = await tx
    .select({ id: contas.id, usuario: contas.usuario })
    .from(contas)
    .where(
      inArray(
        contas.id,
        encerradas.map((sessao) => sessao.contaId),
      ),
    );
  for (const sessao of encerradas) {
    const aparelho = aparelhos.find((linha) => linha.id === sessao.aparelhoId);
    await registrarNaAuditoria(tx, {
      acao: 'sessao-da-aba.encerrada',
      ator,
      alvo: { tipo: 'aparelho-da-aba', id: sessao.aparelhoId },
      dados: {
        computador: aparelho?.nome ?? null,
        identificador: aparelho?.identificadorCurto ?? null,
        contaId: sessao.contaId,
        usuario: donos.find((dono) => dono.id === sessao.contaId)?.usuario ?? null,
        motivo,
      },
      origem,
      momento,
    });
  }
  return encerradas.length;
}

/**
 * Encerra as sessões abertas da conta, com as da aba e as do chat na aba, e devolve quantas foram.
 */
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
  const daAba = await encerrarSessoesDaAba(tx, {
    onde: and(eq(sessoesDaAba.contaId, contaId), gt(sessoesDaAba.expiraEm, momento)),
    motivo,
    momento,
    ator,
    origem,
  });
  return encerradas.length + daAba;
}

/**
 * Encerra uma sessão da conta, se ela ainda estiver aberta; diz se encerrou. A sessão da aba da
 * conta também vale, com o chat na aba dela.
 */
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
  if (!encerrada) {
    const daAba = await encerrarSessoesDaAba(tx, {
      onde: and(eq(sessoesDaAba.id, sessaoId), eq(sessoesDaAba.contaId, contaId)),
      motivo,
      momento,
      ator,
      origem,
    });
    return daAba > 0;
  }
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
