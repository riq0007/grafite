// A sessão da aba (spec aba-dos-colaboradores, "Sessão da aba" e "Pessoa pelo usuário do Windows";
// design, decisões 3 e 4): uma aberta por conta e aparelho, com o token de 1 hora, que o banco guarda
// só pelo hash. A entrada encerra a aberta da mesma conta no mesmo aparelho antes de incluir a nova,
// na mesma transação. O teto do aparelho conta as contas diferentes das sessões das últimas 24 horas.
import { randomBytes } from 'node:crypto';
import {
  auditoria,
  contas,
  type MOTIVOS_DO_FIM_DA_SESSAO_DA_ABA,
  sessoesDaAba,
  type Transacao,
} from '@grafite/db';
import type { MotivoSemConexao } from '@grafite/domain';
import { and, desc, eq, gt, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { encerrarChatsDaAba } from '../acesso/encerramento.ts';
import { hashDoToken } from '../acesso/sessoes.ts';
import { type Ator, registrarNaAuditoria } from '../auditoria.ts';
import {
  type AparelhoDaRequisicao,
  type EntradaDaAba,
  INTERVALO_DA_RECUSA_NA_AUDITORIA,
} from './escopo.ts';

/** A validade da sessão da aba, que o serviço renova antes de vencer. */
export const VALIDADE_DA_SESSAO_DA_ABA = 60 * 60_000;
/** A validade da sessão pendente da entrada pela senha, à espera do código do app. */
export const VALIDADE_DA_PENDENTE_DA_ABA = 5 * 60_000;
/** Quanto a sessão da entrada pela senha fica sem uso antes de terminar, contado no servidor. */
export const SEM_USO_DA_SENHA = 30 * 60_000;
/** Quantos códigos errados a sessão pendente aceita, como a pendente da web. */
export const TENTATIVAS_DO_CODIGO_DA_ABA = 5;

type MotivoDoFim = (typeof MOTIVOS_DO_FIM_DA_SESSAO_DA_ABA)[number];

/**
 * A sessão aberta que já não vale: a vencida, e a da entrada pela senha sem uso há 30 minutos (decisão
 * 2). O `momento` é o da conferência.
 */
export const semValer = (momento: Date) =>
  or(
    lte(sessoesDaAba.expiraEm, momento),
    and(
      eq(sessoesDaAba.entrada, 'senha'),
      lte(sessoesDaAba.ultimoUsoEm, new Date(momento.getTime() - SEM_USO_DA_SENHA)),
    ),
  );
/** A janela do teto de contas do aparelho. */
export const JANELA_DO_TETO = 24 * 60 * 60_000;
/** Quantas pessoas recusadas um aparelho põe na auditoria a cada 10 minutos, no máximo. */
const RECUSAS_DO_APARELHO_NA_AUDITORIA = 20;

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
        // Só as pelo Windows: o aparelho que mudou da senha no mesmo dia não chega ao teto.
        eq(sessoesDaAba.entrada, 'windows'),
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
  const doAparelho = and(
    eq(auditoria.alvoTipo, 'aparelho-da-aba'),
    eq(auditoria.alvoId, aparelho.id),
  );
  // Primeiro o teto por aparelho, para os pedidos que nunca repetem a pessoa: lê só 10 minutos, e a
  // busca pela pessoa, que anda o histórico do aparelho, fica para quando ainda cabe registro.
  const desde = new Date(momento.getTime() - INTERVALO_DA_RECUSA_NA_AUDITORIA);
  const [recentes] = await tx
    .select({ quantas: sql<number>`count(*)::int` })
    .from(auditoria)
    .where(
      and(doAparelho, eq(auditoria.acao, 'sessao-da-aba.recusada'), gt(auditoria.momento, desde)),
    );
  if ((recentes?.quantas ?? 0) >= RECUSAS_DO_APARELHO_NA_AUDITORIA) return;
  // O último registro desta pessoa no aparelho, a recusa ou a sessão aberta dela.
  const [ultima] = await tx
    .select({ acao: auditoria.acao, dados: auditoria.dados })
    .from(auditoria)
    .where(
      and(
        doAparelho,
        inArray(auditoria.acao, ['sessao-da-aba.recusada', 'sessao-da-aba.aberta']),
        sql`${auditoria.dados}->>'pessoa' = ${pessoa}`,
      ),
    )
    .orderBy(desc(auditoria.momento), desc(auditoria.id))
    .limit(1);
  const anteriores = ultima?.dados as { motivo?: unknown } | null | undefined;
  if (ultima?.acao === 'sessao-da-aba.recusada' && anteriores?.motivo === motivo) return;
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
 * Abre a sessão da conta no aparelho, encerrando a aberta da mesma conta nele: a que já não vale
 * com 'sem-uso', a que segue valendo com 'outra-sessao-no-aparelho'. Devolve o token. A pendente,
 * da entrada pela senha à espera do código, vale 5 minutos e só vai à auditoria ao ser ativada.
 */
export async function abrirSessaoDaAba(
  tx: Transacao,
  {
    contaId,
    aparelho,
    entrada,
    pendente = false,
    dados,
    origem,
    momento,
  }: {
    contaId: string;
    aparelho: AparelhoDaRequisicao;
    entrada: EntradaDaAba;
    pendente?: boolean;
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
  const paradas = await tx
    .update(sessoesDaAba)
    .set({ encerradaEm: momento, motivoDoFim: 'sem-uso' })
    .where(and(daConta, semValer(momento)))
    .returning({ id: sessoesDaAba.id });
  const trocadas = await tx
    .update(sessoesDaAba)
    .set({ encerradaEm: momento, motivoDoFim: 'outra-sessao-no-aparelho' })
    .where(daConta)
    .returning({ id: sessoesDaAba.id });
  await encerrarChatsDaAba(
    tx,
    [...paradas, ...trocadas].map((sessao) => sessao.id),
    momento,
  );
  const token = novoToken();
  const expiraEm = new Date(
    momento.getTime() + (pendente ? VALIDADE_DA_PENDENTE_DA_ABA : VALIDADE_DA_SESSAO_DA_ABA),
  );
  const [sessao] = await tx
    .insert(sessoesDaAba)
    .values({
      orgId: sql`app.current_org()`,
      contaId,
      aparelhoId: aparelho.id,
      entrada,
      tokenHash: hashDoToken(token),
      criadaEm: momento,
      ativadaEm: pendente ? null : momento,
      ultimoUsoEm: momento,
      expiraEm,
      ip: origem.ip,
    })
    .returning({ id: sessoesDaAba.id });
  if (!sessao) throw new Error('A sessão da aba não foi gravada.');
  if (!pendente) {
    await auditarAberta(tx, { contaId, aparelho, entrada, dados, origem, momento });
  }
  return { token, sessaoId: sessao.id, expiraEm };
}

async function auditarAberta(
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
) {
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
}

/** A pendente da entrada pela senha no aparelho, pelo token dela, enquanto vale, ou `null`. */
export async function pendenteDaAba(
  tx: Transacao,
  { token, aparelho, momento }: { token: string; aparelho: AparelhoDaRequisicao; momento: Date },
) {
  const [pendente] = await tx
    .select({ id: sessoesDaAba.id, contaId: sessoesDaAba.contaId })
    .from(sessoesDaAba)
    .where(
      and(
        eq(sessoesDaAba.tokenHash, hashDoToken(token)),
        eq(sessoesDaAba.aparelhoId, aparelho.id),
        eq(sessoesDaAba.entrada, 'senha'),
        isNull(sessoesDaAba.ativadaEm),
        isNull(sessoesDaAba.encerradaEm),
        gt(sessoesDaAba.expiraEm, momento),
      ),
    );
  return pendente ?? null;
}

/** Soma um código errado na pendente e devolve quantos já foram. */
export async function somarCodigoErrado(tx: Transacao, sessaoId: string): Promise<number> {
  const [atualizada] = await tx
    .update(sessoesDaAba)
    .set({ tentativasDeCodigo: sql`${sessoesDaAba.tentativasDeCodigo} + 1` })
    .where(eq(sessoesDaAba.id, sessaoId))
    .returning({ tentativas: sessoesDaAba.tentativasDeCodigo });
  return atualizada?.tentativas ?? TENTATIVAS_DO_CODIGO_DA_ABA;
}

/**
 * Ativa a pendente com o código certo: o token novo, que substitui o da pendente, a validade de 1
 * hora e o último uso no agora, com a auditoria da abertura.
 */
export async function ativarPendenteDaAba(
  tx: Transacao,
  {
    sessaoId,
    contaId,
    aparelho,
    dados,
    origem,
    momento,
  }: {
    sessaoId: string;
    contaId: string;
    aparelho: AparelhoDaRequisicao;
    dados?: Record<string, unknown>;
    origem: OrigemDaAba;
    momento: Date;
  },
): Promise<{ token: string; expiraEm: Date }> {
  const token = novoToken();
  const expiraEm = new Date(momento.getTime() + VALIDADE_DA_SESSAO_DA_ABA);
  await tx
    .update(sessoesDaAba)
    .set({ tokenHash: hashDoToken(token), ativadaEm: momento, ultimoUsoEm: momento, expiraEm })
    .where(eq(sessoesDaAba.id, sessaoId));
  await auditarAberta(tx, { contaId, aparelho, entrada: 'senha', dados, origem, momento });
  return { token, expiraEm };
}

/** O uso da aba ou da tela maior com o foco, que conta os 30 minutos da entrada pela senha. */
export async function registrarUsoDaAba(
  tx: Transacao,
  { sessaoId, momento }: { sessaoId: string; momento: Date },
) {
  await tx
    .update(sessoesDaAba)
    .set({ ultimoUsoEm: momento })
    .where(and(eq(sessoesDaAba.id, sessaoId), isNull(sessoesDaAba.encerradaEm)));
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
    usuario,
    aparelho,
    motivo,
    ator = { tipo: 'sistema', descricao: 'Aba' },
    dados,
    origem,
    momento,
  }: {
    sessaoId: string;
    contaId: string;
    usuario: string | null;
    aparelho: AparelhoDaRequisicao;
    motivo: Extract<MotivoDoFim, 'pessoa-recusada' | 'saida' | 'tentativas-esgotadas'>;
    /** Quem encerrou: a aba, ou a pessoa no "Sair". */
    ator?: Ator;
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
  await encerrarChatsDaAba(tx, [sessaoId], momento);
  await registrarNaAuditoria(tx, {
    acao: 'sessao-da-aba.encerrada',
    ator,
    alvo: { tipo: 'aparelho-da-aba', id: aparelho.id },
    dados: {
      computador: aparelho.nome,
      identificador: aparelho.identificadorCurto,
      contaId,
      usuario,
      motivo,
      ...dados,
    },
    origem,
    momento,
  });
}
