// A tarefa periódica que acorda os agentes das distribuições agendadas (change software-por-pacote,
// design, decisão 8a), numa volta só, para os testes de integração: o chamado é simulado, e a volta
// devolve as máquinas da organização do teste que ficaram com o chamado do momento.

import { agentes, maquinasDasDistribuicoes, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { TAREFA_DOS_AGENDADOS, tarefasDoSoftware } from '../src/software/acordar.ts';
import type { ApiDeTeste } from './integracao.ts';

/**
 * Uma volta da tarefa dos agendados, com o chamado simulado: os IPs de `semResposta` não respondem,
 * e os outros respondem. O banco é o de todos os arquivos dos testes, e a tarefa passa por todas as
 * organizações dele: a volta devolve, em ordem, só os IPs das máquinas de `org` que ficaram com o
 * chamado do momento, lidos do banco pela organização, e confere que o agente de cada uma recebeu o
 * chamado.
 */
export async function chamarOsAgendados(
  api: ApiDeTeste,
  org: string,
  { semResposta = [] }: { semResposta?: readonly string[] } = {},
): Promise<string[]> {
  const chamados: string[] = [];
  const [tarefa] = tarefasDoSoftware({
    banco: api.banco,
    armazenamento: api.armazenamento,
    agora: api.relogio.agora,
    log: { info: () => {}, warn: () => {}, error: () => {} },
    enviar: async () => null,
    acordar: async (ip) => {
      chamados.push(ip);
      return !semResposta.includes(ip);
    },
  }).filter(({ nome }) => nome === TAREFA_DOS_AGENDADOS);
  if (!tarefa) throw new Error('A tarefa dos agendados não está no catálogo.');
  await tarefa.trabalho(undefined, {
    tarefaId: 'teste',
    tentativa: 0,
    sinal: new AbortController().signal,
  });
  const momento = api.relogio.agora();
  const marcadas = await naOrganizacao(api.banco, org, (tx) =>
    tx
      .select({ ip: agentes.ip })
      .from(maquinasDasDistribuicoes)
      .innerJoin(agentes, eq(agentes.id, maquinasDasDistribuicoes.agenteId))
      .where(eq(maquinasDasDistribuicoes.chamadaEm, momento)),
  );
  const ips = marcadas.map(({ ip }) => ip ?? '').sort();
  // Contém, e não igual: os agentes das outras organizações do banco também são chamados.
  expect(chamados).toEqual(expect.arrayContaining(ips));
  return ips;
}
