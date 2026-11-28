// O bilhete do chat da aba (spec aba-dos-colaboradores, "Chat dentro da aba"; design, decisão 8): a
// aba pede, com o token da sessão dela, um bilhete de uso único, de 60 s, com o destino fechado (o
// chat ou um chamado pelo número), e o chat da aba o troca pela sessão do chat na aba, ligada à
// sessão da aba. O banco guarda só o hash. A troca marca o bilhete como usado antes de tudo, e o
// usado, o vencido e o desconhecido dão o mesmo `null`, como a sessão da aba que já não vale, o
// aparelho bloqueado e a conta que não está ativa. A pendência da conta é calculada de novo. A
// página de entrada do chat com a marca da aba acha aqui a sessão da aba da conta no aparelho.
import { randomBytes } from 'node:crypto';
import {
  aparelhosDaAba,
  bilhetesDaAba,
  contas,
  doisPassos,
  pessoas,
  sessoesDaAba,
  type Transacao,
} from '@grafite/db';
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { carregarAcesso, exigeDoisPassos } from '../acesso/acesso.ts';
import { pendenciaDa } from '../acesso/pendencia.ts';
import { abaValendo, criarSessao, hashDoToken } from '../acesso/sessoes.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import type { OrigemDaAba } from './sessao.ts';

/** A validade do bilhete. */
export const VALIDADE_DO_BILHETE = 60_000;

/** Para onde o bilhete leva o chat da aba: o chat, ou um chamado pelo número, e nada mais. */
export const DestinoDoBilhete = z
  .discriminatedUnion('destino', [
    z.object({ destino: z.literal('chat') }).strict(),
    z.object({ destino: z.literal('chamado'), numero: z.number().int().min(1) }).strict(),
  ])
  .meta({ id: 'DestinoDoBilhete' });
export type DestinoDoBilhete = z.infer<typeof DestinoDoBilhete>;

/** O bilhete novo da sessão da aba, que só existe na resposta. */
export async function emitirBilhete(
  tx: Transacao,
  {
    sessaoDaAbaId,
    destino,
    momento,
  }: { sessaoDaAbaId: string; destino: DestinoDoBilhete; momento: Date },
): Promise<{ bilhete: string; expiraEm: Date }> {
  const bilhete = randomBytes(32).toString('base64url');
  const expiraEm = new Date(momento.getTime() + VALIDADE_DO_BILHETE);
  await tx.insert(bilhetesDaAba).values({
    orgId: sql`app.current_org()`,
    hash: hashDoToken(bilhete),
    sessaoDaAbaId,
    destino: destino.destino,
    chamadoNumero: destino.destino === 'chamado' ? destino.numero : null,
    criadoEm: momento,
    expiraEm,
  });
  return { bilhete, expiraEm };
}

/**
 * Na entrada pelo Windows, a conta que exige os dois passos, ou que os tem, não recebe o bilhete: a
 * sessão da aba não passou pelo código. Na entrada pela senha, a sessão da aba já passou por ele.
 */
export async function precisaDaEntradaDoChat(
  tx: Transacao,
  { contaId, entrada }: { contaId: string; entrada: 'windows' | 'senha' },
): Promise<boolean> {
  if (entrada !== 'windows') return false;
  const [linha] = await tx
    .select({ exigeDoisPassos: contas.exigeDoisPassos, ativadoEm: doisPassos.ativadoEm })
    .from(contas)
    .leftJoin(doisPassos, eq(doisPassos.contaId, contas.id))
    .where(eq(contas.id, contaId));
  if (!linha) return true;
  return linha.ativadoEm !== null || exigeDoisPassos(linha, await carregarAcesso(tx, contaId));
}

/** A sessão da aba que vale, com o aparelho dela fora do bloqueio. */
async function abaQueVale(tx: Transacao, momento: Date, filtro: ReturnType<typeof and>) {
  const [aba] = await tx
    .select({
      id: sessoesDaAba.id,
      contaId: sessoesDaAba.contaId,
      entrada: sessoesDaAba.entrada,
      ativadaEm: sessoesDaAba.ativadaEm,
      computador: aparelhosDaAba.nome,
      identificador: aparelhosDaAba.identificadorCurto,
    })
    .from(sessoesDaAba)
    .innerJoin(
      aparelhosDaAba,
      and(
        eq(aparelhosDaAba.orgId, sessoesDaAba.orgId),
        eq(aparelhosDaAba.id, sessoesDaAba.aparelhoId),
      ),
    )
    .where(and(filtro, abaValendo(momento), isNull(aparelhosDaAba.bloqueadoEm)))
    .limit(1);
  return aba ?? null;
}

/**
 * A sessão da aba da conta no aparelho da marca, para a entrada do chat pela página com a marca da
 * aba. A marca é o identificador curto do aparelho; a falsa não acha nada.
 */
export function sessaoDaAbaPelaMarca(
  tx: Transacao,
  { contaId, marca, momento }: { contaId: string; marca: string; momento: Date },
) {
  return abaQueVale(
    tx,
    momento,
    and(
      eq(sessoesDaAba.contaId, contaId),
      eq(aparelhosDaAba.identificadorCurto, marca.trim().toUpperCase()),
    ),
  );
}

/** O que a sessão do chat na aba leva da sessão da aba: o código, quando ela passou por ele. */
export const daSessaoDaAba = (aba: {
  id: string;
  entrada: 'windows' | 'senha';
  ativadaEm: Date | null;
}) => ({
  sessaoDaAbaId: aba.id,
  // Na entrada pela senha, a conta com os dois passos só tem a sessão da aba depois do código, e
  // ativá-los depois encerra a sessão da aba. Na pelo Windows, o código não foi pedido.
  segundoPassoEm: aba.entrada === 'senha' ? aba.ativadaEm : null,
});

/**
 * Troca o bilhete pela sessão do chat na aba. Devolve `null` para o usado, o vencido, o desconhecido,
 * a sessão da aba que já não vale, o aparelho bloqueado e a conta fora do ar; o bilhete fica usado.
 */
export async function trocarBilhete(
  tx: Transacao,
  {
    bilhete,
    momento,
    ip,
    agente,
    origem,
  }: {
    bilhete: string;
    momento: Date;
    ip: string;
    agente: string | null;
    origem: OrigemDaAba;
  },
) {
  const [usado] = await tx
    .update(bilhetesDaAba)
    .set({ usadoEm: momento })
    .where(
      and(
        eq(bilhetesDaAba.hash, hashDoToken(bilhete)),
        isNull(bilhetesDaAba.usadoEm),
        gt(bilhetesDaAba.expiraEm, momento),
      ),
    )
    .returning({
      sessaoDaAbaId: bilhetesDaAba.sessaoDaAbaId,
      destino: bilhetesDaAba.destino,
      chamadoNumero: bilhetesDaAba.chamadoNumero,
    });
  if (!usado) return null;
  const aba = await abaQueVale(tx, momento, and(eq(sessoesDaAba.id, usado.sessaoDaAbaId)));
  if (!aba) return null;
  const [conta] = await tx
    .select({
      usuario: contas.usuario,
      situacao: contas.situacao,
      senhaTemporaria: contas.senhaTemporaria,
      exigeDoisPassos: contas.exigeDoisPassos,
      nome: pessoas.nome,
      doisPassosAtivadoEm: doisPassos.ativadoEm,
    })
    .from(contas)
    .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
    .leftJoin(doisPassos, eq(doisPassos.contaId, contas.id))
    .where(eq(contas.id, aba.contaId));
  if (!conta?.usuario || conta.situacao !== 'ativa') return null;
  const acesso = await carregarAcesso(tx, aba.contaId);
  const chatDaAba = daSessaoDaAba(aba);
  const pendencia = pendenciaDa({
    conta: { ...conta, exigeDoisPassos: exigeDoisPassos(conta, acesso) },
    doisPassosAtivos: conta.doisPassosAtivadoEm !== null,
    segundoPassoEm: chatDaAba.segundoPassoEm,
  });
  const sessao = await criarSessao(tx, {
    contaId: aba.contaId,
    momento,
    ip,
    agente,
    pendente: pendencia !== null,
    chatDaAba,
  });
  await registrarNaAuditoria(tx, {
    acao: 'sessao-do-chat-da-aba.aberta',
    ator: { tipo: 'conta', contaId: aba.contaId },
    alvo: { tipo: 'sessao', id: sessao.id },
    dados: {
      pelo: 'bilhete',
      computador: aba.computador,
      identificador: aba.identificador,
      pendencia,
    },
    origem,
    momento,
  });
  const destino: DestinoDoBilhete =
    usado.destino === 'chamado' && usado.chamadoNumero !== null
      ? { destino: 'chamado', numero: usado.chamadoNumero }
      : { destino: 'chat' };
  return {
    sessao,
    contaId: aba.contaId,
    usuario: conta.usuario,
    nome: conta.nome,
    pendencia,
    acesso,
    destino,
  };
}

/** Apaga os bilhetes vencidos há mais de 24 horas, na manutenção diária. */
export async function apagarBilhetesVencidos(tx: Transacao, momento: Date): Promise<number> {
  const limite = new Date(momento.getTime() - 24 * 60 * 60_000);
  const apagados = await tx
    .delete(bilhetesDaAba)
    .where(lt(bilhetesDaAba.expiraEm, limite))
    .returning({ id: bilhetesDaAba.id });
  return apagados.length;
}
