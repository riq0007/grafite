// As tarefas dos alertas (spec alertas, "Avaliação a cada minuto"; change p3a-regras-e-alertas,
// design, decisão 5). A `alertas-a-cada-minuto`, que a partida do servidor agenda pelo cron, põe uma
// `avaliar-alertas` para cada organização, com a chave do minuto; cada uma avalia a organização
// dela, que pula a avaliação com o módulo Alertas desligado. A falha de uma avaliação só vai para o
// log: a do minuto seguinte tenta de novo, sem encher a lista das tarefas com falha.
import { type Banco, naOrganizacao, type Transacao } from '@grafite/db';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { FilaDeTarefas } from '../fila/fila.ts';
import type { ContextoDasTarefas, DefinicaoDeTarefa } from '../fila/tarefas.ts';
import { avaliarOrganizacao } from './avaliacao.ts';

/** O fuso do cron da distribuição, o mesmo das outras tarefas agendadas. */
export const FUSO_DOS_ALERTAS = 'America/Sao_Paulo';

/** A distribuição roda a cada minuto. */
export const CRON_DOS_ALERTAS = '* * * * *';

/** As organizações, pela consulta que atravessa organizações só para as tarefas. */
async function organizacoes(banco: Banco): Promise<string[]> {
  const { rows } = await banco.execute<{ id: string }>(
    sql`select id from app.organizacoes_para_tarefas() as t(id)`,
  );
  return rows.map((linha) => linha.id);
}

export function tarefasDosAlertas(contexto: ContextoDasTarefas): DefinicaoDeTarefa[] {
  const { banco, agora, log, enviar } = contexto;

  const distribuicao: DefinicaoDeTarefa<unknown> = {
    nome: 'alertas-a-cada-minuto',
    rotulo: 'Distribuição da avaliação dos alertas',
    rotina: {
      nome: 'Avaliação dos alertas',
      descricao: 'Confere as regras de alerta de cada organização e abre e fecha os alertas.',
    },
    dados: z.unknown(),
    opcoes: { retryLimit: 0 },
    async trabalho() {
      const minuto = agora().toISOString().slice(0, 16);
      for (const orgId of await organizacoes(banco)) {
        await enviar(
          'avaliar-alertas',
          { orgId },
          { chaveUnica: `${orgId}:${minuto}`, unicaPor: 60 },
        );
      }
    },
  };

  const avaliacao: DefinicaoDeTarefa<{ orgId: string }> = {
    nome: 'avaliar-alertas',
    rotulo: 'Avaliação dos alertas',
    dados: z.object({ orgId: z.uuid() }),
    opcoes: { retryLimit: 0 },
    async trabalho({ orgId }) {
      try {
        await naOrganizacao(banco, orgId, (tx) =>
          avaliarOrganizacao(tx, { agora: agora(), enviar }),
        );
      } catch (erro) {
        log.error({ err: erro, orgId }, 'falha na avaliação dos alertas');
      }
    },
  };

  return [distribuicao, avaliacao as DefinicaoDeTarefa];
}

/**
 * Põe a avaliação da organização do contexto na fila, na transação da mudança de uma regra, para a
 * mudança valer logo. Sem a fila no ar, como nos testes que não tratam dela, a do minuto basta.
 */
export async function pedirAvaliacao(
  fila: FilaDeTarefas | undefined,
  orgId: string,
  tx: Transacao,
): Promise<void> {
  if (!fila?.rodando()) return;
  await fila.enviar(
    'avaliar-alertas',
    { orgId },
    { tx, chaveUnica: `${orgId}:regras`, unicaPor: 5 },
  );
}
