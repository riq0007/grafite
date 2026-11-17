// A verificação do prazo (spec chamados, "Prazo estourado"; change chamados-da-ti, design, decisão 12,
// "A tarefa do prazo (tarefa 4.19)"): a cada minuto, em cada organização com o módulo Chamados
// ligado, o chamado com o relógio contando que passou do vencimento avisa quem o atende, ou quem
// atende os locais dele, uma vez, e ganha a marca do aviso. A marca não sobe a versão nem grava na
// conversa, na auditoria ou no tempo real: o estouro não muda o chamado, só avisa dele.
import { type Banco, chamados, naOrganizacao } from '@grafite/db';
import { lerPrazoDoChamado, notificacoesDoEstouro, prazoEstourado } from '@grafite/domain';
import { and, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ligadoNaTransacao } from '../acesso/modulos.ts';
import { lerArvore } from '../arvore.ts';
import { FILA_DAS_FALHAS } from '../fila/falhas.ts';
import type { ContextoDasTarefas, DefinicaoDeTarefa, EnviarTarefa } from '../fila/tarefas.ts';
import { notificar } from '../notificacoes/notificar.ts';
import { lerHorarioDaTi } from './horario.ts';
import { contasDaTriagem } from './quem-atende.ts';

export const TAREFA_DO_PRAZO = 'chamados.prazo';

/**
 * Avisa os chamados da organização que passaram do prazo e ainda não foram avisados. O chamado de
 * prazo estragado fica de fora, sem a marca, sem derrubar os outros. Com o módulo Chamados
 * desligado, nada é avisado nem marcado: ao religar, quem passou do prazo nesse tempo é avisado.
 */
export async function avisarPrazosEstourados(
  banco: Banco,
  orgId: string,
  { agora, enviar }: { agora: Date; enviar?: EnviarTarefa },
): Promise<{ avisados: number }> {
  return naOrganizacao(banco, orgId, async (tx) => {
    if (!(await ligadoNaTransacao(tx, 'chamados'))) return { avisados: 0 };
    // O relógio só conta na triagem e em atendimento (`chamados_relogio_coerente`), e a situação,
    // pelo `chamados_situacao_idx`, deixa de fora os parados e os resolvidos.
    const semAviso = and(
      inArray(chamados.situacao, ['triagem', 'em-atendimento']),
      isNull(chamados.estouroAvisadoEm),
    );
    const lerChamados = (onde: SQL | undefined) =>
      tx
        .select({
          id: chamados.id,
          numero: chamados.numero,
          titulo: chamados.titulo,
          responsavelId: chamados.responsavelId,
          locais: chamados.locais,
          semLocal: chamados.semLocal,
          prazo: chamados.prazo,
          contadoS: chamados.contadoS,
          relogioDesde: chamados.relogioDesde,
          primeiraRespostaEm: chamados.primeiraRespostaEm,
        })
        .from(chamados)
        .where(onde)
        .orderBy(chamados.numero);
    type Lido = Awaited<ReturnType<typeof lerChamados>>[number];

    // A leitura sem trava: no minuto em que nada estourou, que é quase sempre, nenhuma linha fica
    // travada, e nenhuma ação espera a verificação.
    const contando = await lerChamados(semAviso);
    if (contando.length === 0) return { avisados: 0 };
    const horario = await lerHorarioDaTi(tx);
    const estouradosEntre = (lidos: Lido[]) =>
      lidos.filter((linha) => {
        const prazo = lerPrazoDoChamado(linha.prazo);
        return prazo !== null && prazoEstourado({ ...linha, prazo }, horario, agora);
      });
    const candidatos = estouradosEntre(contando);
    if (candidatos.length === 0) return { avisados: 0 };

    // Só os estourados ficam travados, e lidos de novo: a ação que os mudou entre as duas leituras
    // conta, e a linha travada por uma ação em curso fica para o minuto seguinte, sem esperar por ela.
    const estourados = estouradosEntre(
      await lerChamados(
        and(
          semAviso,
          inArray(
            chamados.id,
            candidatos.map(({ id }) => id),
          ),
        ),
      ).for('update', { skipLocked: true }),
    );
    if (estourados.length === 0) return { avisados: 0 };

    const contas = await contasDaTriagem(tx, await lerArvore(tx));
    const novas = estourados.flatMap((linha) =>
      notificacoesDoEstouro(
        { ...linha, locais: { locais: linha.locais, semLocal: linha.semLocal } },
        contas,
      ),
    );
    // A marca vale mesmo sem ninguém a avisar: o chamado não é lido de novo a cada minuto.
    await tx
      .update(chamados)
      .set({ estouroAvisadoEm: agora })
      .where(
        inArray(
          chamados.id,
          estourados.map(({ id }) => id),
        ),
      );
    await notificar(tx, novas, agora, enviar ? { enviar } : {});
    return { avisados: estourados.length };
  });
}

/** As organizações ativas, pela consulta que atravessa organizações só para as tarefas. */
async function organizacoesAtivas(banco: Banco): Promise<string[]> {
  const { rows } = await banco.execute<{ id: string }>(
    sql`select id from app.organizacoes_para_tarefas() as t(id)`,
  );
  return rows.map((linha) => linha.id);
}

/**
 * A verificação a cada minuto, na tela das rotinas. Cada organização roda na transação dela, e a
 * falha de uma fica no log sem segurar as outras: a do minuto seguinte tenta de novo.
 */
export function tarefaDoPrazo({
  banco,
  agora,
  log,
  enviar,
}: ContextoDasTarefas): DefinicaoDeTarefa<unknown> {
  return {
    nome: TAREFA_DO_PRAZO,
    rotulo: 'Prazo dos chamados',
    rotina: {
      nome: 'Prazo dos chamados',
      descricao: 'Avisa quem atende quando um chamado passa do prazo, uma vez por chamado.',
    },
    dados: z.unknown(),
    agenda: { cron: '* * * * *', fuso: 'America/Sao_Paulo' },
    opcoes: { deadLetter: FILA_DAS_FALHAS },
    async trabalho() {
      const momento = agora();
      for (const orgId of await organizacoesAtivas(banco)) {
        try {
          const { avisados } = await avisarPrazosEstourados(banco, orgId, {
            agora: momento,
            enviar,
          });
          if (avisados > 0) log.info({ orgId, avisados }, 'prazos estourados avisados');
        } catch (erro) {
          log.error({ err: erro, orgId }, 'a verificação do prazo dos chamados falhou');
        }
      }
    },
  };
}
