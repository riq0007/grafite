// O fechamento do chamado (spec chamados, "Fechamento do chamado"; change chat-com-chamados, design,
// decisão 7, e tarefa 3.11): a cada minuto, em cada organização com o módulo Chamados ligado, o
// resolvido vencido, o de antes do começo do dia de 7 dias atrás no fuso do horário da TI, ganha o
// `fechado_em` e o evento `fechou` na conversa, os dois na meia-noite do `momentoDoFechamento`, e o
// `chamados.mudaram` a quem vê o chamado e a quem participa dele pelo chat, com o `chat.mudou` da
// conversa de origem, onde o chip passa a "Fechado" (tarefa 3.12), sem auditoria e sem notificação.
// A versão não sobe: o fechamento não é uma ação, e o fechado já era recusado antes dele pelo
// `estaFechado`.
import {
  type Banco,
  chamados,
  mensagensDosChamados,
  naOrganizacao,
  type Transacao,
} from '@grafite/db';
import { type EventoDoFechamento, limiteDoFechamento, momentoDoFechamento } from '@grafite/domain';
import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ligadoNaTransacao } from '../acesso/modulos.ts';
import { avisarAsConversasDeOrigem } from '../chat/conversa.ts';
import { registrarEvento } from '../eventos/saida.ts';
import { FILA_DAS_FALHAS } from '../fila/falhas.ts';
import type { ContextoDasTarefas, DefinicaoDeTarefa } from '../fila/tarefas.ts';
import { publicoDoChamado } from './alcance.ts';
import { lerHorarioDaTi } from './horario.ts';
import { comQuemParticipa, contasQueParticipamDos } from './quem-participa.ts';

export const TAREFA_DO_FECHAMENTO = 'chamados.fechamento';

/** Os chamados de cada transação: o primeiro minuto depois desta versão fecha os antigos aos poucos. */
export const LOTE_DO_FECHAMENTO = 500;

const FECHOU: EventoDoFechamento = { evento: 'fechou', dados: {} };

/**
 * Fecha um lote dos vencidos da organização, travados sem esperar: o que uma ação trava agora fica
 * para o minuto seguinte. Devolve quantos fechou, ou nulo com o módulo Chamados desligado.
 */
async function fecharUmLote(tx: Transacao, agora: Date, lote: number): Promise<number | null> {
  if (!(await ligadoNaTransacao(tx, 'chamados'))) return null;
  const { fuso } = await lerHorarioDaTi(tx);
  const vencidos = await tx
    .select({
      id: chamados.id,
      resolvidoEm: chamados.resolvidoEm,
      locais: chamados.locais,
      semLocal: chamados.semLocal,
      pessoaId: chamados.pessoaId,
      origem: chamados.origem,
      abertoPor: chamados.abertoPor,
      origemConversaId: chamados.origemConversaId,
    })
    .from(chamados)
    .where(
      and(
        eq(chamados.situacao, 'resolvido'),
        isNull(chamados.fechadoEm),
        lt(chamados.resolvidoEm, limiteDoFechamento(agora, fuso)),
      ),
    )
    .orderBy(asc(chamados.resolvidoEm), asc(chamados.id))
    .limit(lote)
    .for('update', { skipLocked: true });
  if (vencidos.length === 0) return 0;

  const fechamentos = vencidos.map((linha) => {
    // O `chamados_resolucao_coerente` garante a data no resolvido.
    if (linha.resolvidoEm === null) throw new Error(`O resolvido ${linha.id} sem a resolução.`);
    return { ...linha, momento: momentoDoFechamento(linha.resolvidoEm, fuso) };
  });
  for (const { id, momento } of fechamentos) {
    await tx.update(chamados).set({ fechadoEm: momento }).where(eq(chamados.id, id));
  }
  await tx.insert(mensagensDosChamados).values(
    fechamentos.map(({ id, momento }) => ({
      orgId: sql`app.current_org()`,
      chamadoId: id,
      especie: 'evento' as const,
      evento: FECHOU.evento,
      dados: FECHOU.dados,
      criadaEm: momento,
    })),
  );
  const participam = await contasQueParticipamDos(tx, fechamentos);
  for (const fechado of fechamentos) {
    await registrarEvento(tx, {
      tipo: 'chamados.mudaram',
      alvo: { tipo: 'chamado', id: fechado.id },
      publico: comQuemParticipa(publicoDoChamado(fechado), participam.get(fechado) ?? []),
    });
  }
  await avisarAsConversasDeOrigem(
    tx,
    fechamentos.map(({ origemConversaId }) => origemConversaId),
  );
  return fechamentos.length;
}

/**
 * Fecha os vencidos da organização, de lote em lote, cada um na sua transação. Com o módulo Chamados
 * desligado, nada fecha: ao religar, o vencido fecha com a data dele.
 */
export async function fecharOsVencidos(
  banco: Banco,
  orgId: string,
  { agora, lote = LOTE_DO_FECHAMENTO }: { agora: Date; lote?: number },
): Promise<{ fechados: number }> {
  let fechados = 0;
  for (;;) {
    const noLote = await naOrganizacao(banco, orgId, (tx) => fecharUmLote(tx, agora, lote));
    if (noLote === null) return { fechados };
    fechados += noLote;
    if (noLote < lote) return { fechados };
  }
}

/** As organizações ativas, pela consulta que atravessa organizações só para as tarefas. */
async function organizacoesAtivas(banco: Banco): Promise<string[]> {
  const { rows } = await banco.execute<{ id: string }>(
    sql`select id from app.organizacoes_para_tarefas() as t(id)`,
  );
  return rows.map((linha) => linha.id);
}

/**
 * O fechamento a cada minuto, na tela das rotinas, como a tarefa do prazo. A falha de uma
 * organização fica no log sem segurar as outras: a do minuto seguinte tenta de novo.
 */
export function tarefaDoFechamento({
  banco,
  agora,
  log,
}: ContextoDasTarefas): DefinicaoDeTarefa<unknown> {
  return {
    nome: TAREFA_DO_FECHAMENTO,
    rotulo: 'Fechamento dos chamados',
    rotina: {
      nome: 'Fechamento dos chamados',
      descricao:
        'Fecha o chamado resolvido no fim do sétimo dia depois da resolução, quando ele não se reabre mais.',
    },
    dados: z.unknown(),
    agenda: { cron: '* * * * *', fuso: 'America/Sao_Paulo' },
    opcoes: { deadLetter: FILA_DAS_FALHAS },
    async trabalho() {
      const momento = agora();
      for (const orgId of await organizacoesAtivas(banco)) {
        try {
          const { fechados } = await fecharOsVencidos(banco, orgId, { agora: momento });
          if (fechados > 0) log.info({ orgId, fechados }, 'chamados fechados');
        } catch (erro) {
          log.error({ err: erro, orgId }, 'o fechamento dos chamados falhou');
        }
      }
    },
  };
}
