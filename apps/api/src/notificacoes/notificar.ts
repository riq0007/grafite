// Notificar (spec notificacoes, "Notificar"; change p3b-notificacoes-no-servidor, design, decisão
// 6): qualquer módulo grava as notificações das contas na transação dele, em lotes, com um evento
// `notificacoes.mudaram` só para as contas notificadas, que atualiza o sino e os avisos delas. Com
// a fila, a entrega pelo e-mail e pelo push entra na mesma transação (change p3c-email-e-push,
// design, decisão 2): ela só roda se a notificação for gravada.
import { notificacoes, type Transacao } from '@grafite/db';
import { LIMITES_DA_NOTIFICACAO, type NovaNotificacao } from '@grafite/domain';
import { sql } from 'drizzle-orm';
import { registrarEvento } from '../eventos/saida.ts';
import type { EnviarTarefa } from '../fila/tarefas.ts';
import { pedirEntrega } from './entrega.ts';

const LOTE_DE_ESCRITA = 500;

/**
 * Grava as notificações no momento dado e avisa as sessões das contas delas. Com a fila, põe nela a
 * entrega pelos canais de fora; sem ela, como nos testes que não tratam da fila, nada sai.
 */
export async function notificar(
  tx: Transacao,
  novas: readonly NovaNotificacao[],
  momento: Date,
  { enviar }: { enviar?: EnviarTarefa } = {},
): Promise<void> {
  if (novas.length === 0) return;
  const gravadas: Array<{ id: string; orgId: string }> = [];
  for (let inicio = 0; inicio < novas.length; inicio += LOTE_DE_ESCRITA) {
    const lote = await tx
      .insert(notificacoes)
      .values(
        novas.slice(inicio, inicio + LOTE_DE_ESCRITA).map((nova) => ({
          orgId: sql`app.current_org()`,
          contaId: nova.contaId,
          severidade: nova.severidade,
          titulo: nova.titulo.slice(0, LIMITES_DA_NOTIFICACAO.titulo),
          descricao: nova.descricao
            ? nova.descricao.slice(0, LIMITES_DA_NOTIFICACAO.descricao)
            : null,
          origem: nova.origem.slice(0, LIMITES_DA_NOTIFICACAO.origem),
          destino: nova.destino,
          alertaId: nova.alertaId,
          criadaEm: momento,
        })),
      )
      .returning({ id: notificacoes.id, orgId: notificacoes.orgId });
    gravadas.push(...lote);
  }
  await registrarEvento(tx, {
    tipo: 'notificacoes.mudaram',
    alvo: null,
    publico: { contas: [...new Set(novas.map(({ contaId }) => contaId))] },
  });
  const [primeira] = gravadas;
  if (enviar && primeira) {
    await pedirEntrega(
      tx,
      enviar,
      primeira.orgId,
      gravadas.map(({ id }) => id),
    );
  }
}
