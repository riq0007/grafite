// A sessão da aba (spec aba-dos-colaboradores, "Sessão da aba" e "Pessoa pelo usuário do Windows";
// design, decisões 3 e 4): uma aberta por conta e aparelho, com o token de 1 hora, que o banco guarda
// só pelo hash. A entrada encerra a aberta da mesma conta no mesmo aparelho antes de incluir a nova,
// na mesma transação. O teto do aparelho conta as contas diferentes das sessões das últimas 24 horas.
import { randomBytes } from 'node:crypto';
import { auditoria, contas, sessoesDaAba, type Transacao } from '@grafite/db';
import type { MotivoSemConexao } from '@grafite/domain';
import { and, desc, eq, gt, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { hashDoToken } from '../acesso/sessoes.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import type { AparelhoDaRequisicao, EntradaDaAba } from './escopo.ts';

/** A validade da sessão da aba, que o serviço renova antes de vencer. */
export const VALIDADE_DA_SESSAO_DA_ABA = 60 * 60_000;
/** A janela do teto de contas do aparelho. */
export const JANELA_DO_TETO = 24 * 60 * 60_000;

export interface OrigemDaAba {
  ip: string;
  codigoDeRastreio: string;
}

const novoToken = () => randomBytes(32).toString('base64url');

/**
 * O teto do aparelho: as contas diferentes desta que abriram sessão nele nas últimas 24 horas já
 * chegam ao teto. A conta que ainda não existe também conta como outra.
 */
export async function passouDoTeto(
  tx: Transacao,
  {
    aparelho,
    usuario,
    momento,
  }: { aparelho: AparelhoDaRequisicao; usuario: string; momento: Date },
): Promise<boolean> {
  const desde = new Date(momento.getTime() - JANELA_DO_TETO);
  const [linha] = await tx
    .select({ outras: sql<number>`count(distinct ${sessoesDaAba.contaId})::int` })
    .from(sessoesDaAba)
    .innerJoin(
      contas,
      and(eq(contas.orgId, sessoesDaAba.orgId), eq(contas.id, sessoesDaAba.contaId)),
    )
    .where(
      and(
        eq(sessoesDaAba.aparelhoId, aparelho.id),
        gt(sessoesDaAba.criadaEm, desde),
        or(isNull(contas.usuario), ne(contas.usuario, usuario)),
      ),
    );
  return (linha?.outras ?? 0) >= aparelho.tetoDeContas;
}

/**
 * A recusa da pessoa na auditoria, sem repetir: a aba tenta de novo a cada 10 minutos, e a recusa
 * pelo mesmo motivo, da mesma pessoa no mesmo aparelho, desde a última sessão aberta nele, já está lá.
 */
export async function auditarPessoaRecusada(
  tx: Transacao,
  {
    aparelho,
    motivo,
    pessoa,
    dados,
    origem,
    momento,
  }: {
    aparelho: AparelhoDaRequisicao;
    motivo: MotivoSemConexao;
    /** O que identifica a pessoa pedida: o SID ou o usuário digitado. */
    pessoa: string;
    dados?: Record<string, unknown>;
    origem: OrigemDaAba;
    momento: Date;
  },
) {
  const [ultima] = await tx
    .select({ acao: auditoria.acao, dados: auditoria.dados })
    .from(auditoria)
    .where(
      and(
        eq(auditoria.alvoTipo, 'aparelho-da-aba'),
        eq(auditoria.alvoId, aparelho.id),
        inArray(auditoria.acao, ['sessao-da-aba.recusada', 'sessao-da-aba.aberta']),
      ),
    )
    .orderBy(desc(auditoria.momento), desc(auditoria.id))
    .limit(1);
  const anteriores = ultima?.dados as { motivo?: unknown; pessoa?: unknown } | null | undefined;
  if (
    ultima?.acao === 'sessao-da-aba.recusada' &&
    anteriores?.motivo === motivo &&
    anteriores?.pessoa === pessoa
  ) {
    return;
  }
  await registrarNaAuditoria(tx, {
    acao: 'sessao-da-aba.recusada',
    ator: { tipo: 'anonimo' },
    alvo: { tipo: 'aparelho-da-aba', id: aparelho.id },
    dados: {
      computador: aparelho.nome,
      identificador: aparelho.identificadorCurto,
      motivo,
      pessoa,
      ...dados,
    },
    origem,
    momento,
  });
}

/**
 * Abre a sessão da conta no aparelho, já ativa, encerrando a aberta da mesma conta nele: a vencida
 * com 'sem-uso', a que segue valendo com 'outra-sessao-no-aparelho'. Devolve o token.
 */
export async function abrirSessaoDaAba(
  tx: Transacao,
  {
    contaId,
    aparelho,
    entrada,
    dados,
    origem,
    momento,
  }: {
    contaId: string;
    aparelho: AparelhoDaRequisicao;
    entrada: EntradaDaAba;
    dados?: Record<string, unknown>;
    origem: OrigemDaAba;
    momento: Date;
  },
): Promise<{ token: string; sessaoId: string; expiraEm: Date }> {
  const daConta = and(
    eq(sessoesDaAba.contaId, contaId),
    eq(sessoesDaAba.aparelhoId, aparelho.id),
    isNull(sessoesDaAba.encerradaEm),
  );
  await tx
    .update(sessoesDaAba)
    .set({ encerradaEm: momento, motivoDoFim: 'sem-uso' })
    .where(and(daConta, lte(sessoesDaAba.expiraEm, momento)));
  await tx
    .update(sessoesDaAba)
    .set({ encerradaEm: momento, motivoDoFim: 'outra-sessao-no-aparelho' })
    .where(daConta);
  const token = novoToken();
  const expiraEm = new Date(momento.getTime() + VALIDADE_DA_SESSAO_DA_ABA);
  const [sessao] = await tx
    .insert(sessoesDaAba)
    .values({
      orgId: sql`app.current_org()`,
      contaId,
      aparelhoId: aparelho.id,
      entrada,
      tokenHash: hashDoToken(token),
      criadaEm: momento,
      ativadaEm: momento,
      ultimoUsoEm: momento,
      expiraEm,
      ip: origem.ip,
    })
    .returning({ id: sessoesDaAba.id });
  if (!sessao) throw new Error('A sessão da aba não foi gravada.');
  await registrarNaAuditoria(tx, {
    acao: 'sessao-da-aba.aberta',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'aparelho-da-aba', id: aparelho.id },
    dados: {
      computador: aparelho.nome,
      identificador: aparelho.identificadorCurto,
      entrada,
      ...dados,
    },
    origem,
    momento,
  });
  return { token, sessaoId: sessao.id, expiraEm };
}

/** A renovação: a mesma sessão, com a validade contada de agora, sem a auditoria. */
export async function estenderSessaoDaAba(
  tx: Transacao,
  { sessaoId, momento }: { sessaoId: string; momento: Date },
): Promise<Date> {
  const expiraEm = new Date(momento.getTime() + VALIDADE_DA_SESSAO_DA_ABA);
  await tx
    .update(sessoesDaAba)
    .set({ expiraEm })
    .where(and(eq(sessoesDaAba.id, sessaoId), isNull(sessoesDaAba.encerradaEm)));
  return expiraEm;
}

/** Encerra a sessão da aba com o motivo, com a auditoria. */
export async function encerrarSessaoDaAba(
  tx: Transacao,
  {
    sessaoId,
    contaId,
    aparelho,
    motivo,
    dados,
    origem,
    momento,
  }: {
    sessaoId: string;
    contaId: string;
    aparelho: AparelhoDaRequisicao;
    motivo: 'pessoa-recusada';
    dados?: Record<string, unknown>;
    origem: OrigemDaAba;
    momento: Date;
  },
) {
  const encerradas = await tx
    .update(sessoesDaAba)
    .set({ encerradaEm: momento, motivoDoFim: motivo })
    .where(and(eq(sessoesDaAba.id, sessaoId), isNull(sessoesDaAba.encerradaEm)))
    .returning({ id: sessoesDaAba.id });
  if (encerradas.length === 0) return;
  await registrarNaAuditoria(tx, {
    acao: 'sessao-da-aba.encerrada',
    ator: { tipo: 'sistema', descricao: 'Aba' },
    alvo: { tipo: 'aparelho-da-aba', id: aparelho.id },
    dados: {
      computador: aparelho.nome,
      identificador: aparelho.identificadorCurto,
      conta: contaId,
      motivo,
      ...dados,
    },
    origem,
    momento,
  });
}
