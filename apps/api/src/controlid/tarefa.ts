// A rotina dos backups do Control iD (spec backup-do-control-id, "Backup na fila" e "Pedido sem
// resposta do coletor"; change p5a-backup-do-control-id, design, decisão 5): de 5 em 5 minutos, no
// fuso de São Paulo, cada organização ativa com o Ativos ligado expira os pedidos que esperaram
// demais o coletor e põe na fila o agendado do dia de cada controle.
import { type Banco, naOrganizacao, organizacoes } from '@grafite/db';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { FILA_DAS_FALHAS } from '../fila/falhas.ts';
import type { ContextoDasTarefas, DefinicaoDeTarefa } from '../fila/tarefas.ts';
import { agendarEExpirar } from './backups.ts';
import { expirarOperacoes } from './operacoes.ts';

export const TAREFA_DOS_BACKUPS_DO_CONTROL_ID = 'backups-do-control-id';

/** As organizações ativas, pela consulta que atravessa organizações só para as tarefas. */
async function organizacoesAtivas(banco: Banco): Promise<string[]> {
  const { rows } = await banco.execute<{ id: string }>(
    sql`select id from app.organizacoes_para_tarefas() as t(id)`,
  );
  return rows.map((linha) => linha.id);
}

export function tarefasDoControlId({ banco, agora, log }: ContextoDasTarefas): DefinicaoDeTarefa[] {
  const rotina: DefinicaoDeTarefa<unknown> = {
    nome: TAREFA_DOS_BACKUPS_DO_CONTROL_ID,
    rotulo: 'Agenda dos backups do Control iD',
    rotina: {
      nome: 'Backups do Control iD',
      descricao:
        'Pede o backup de cada controle no horário do tipo e encerra os pedidos que passaram do prazo.',
    },
    dados: z.unknown(),
    agenda: { cron: '*/5 * * * *', fuso: 'America/Sao_Paulo' },
    opcoes: { deadLetter: FILA_DAS_FALHAS },
    async trabalho() {
      const momento = agora();
      for (const orgId of await organizacoesAtivas(banco)) {
        const feito = await naOrganizacao(banco, orgId, async (tx) => {
          const [organizacao] = await tx
            .select({ desligados: organizacoes.modulosDesligados })
            .from(organizacoes);
          if (organizacao?.desligados.includes('ativos')) return null;
          const feito = await agendarEExpirar(tx, momento);
          return { ...feito, operacoesExpiradas: await expirarOperacoes(tx, momento) };
        });
        if (feito && (feito.agendados > 0 || feito.expirados > 0 || feito.operacoesExpiradas > 0)) {
          log.info({ orgId, ...feito }, 'backups do Control iD agendados e expirados');
        }
      }
    },
  };
  return [rotina];
}
