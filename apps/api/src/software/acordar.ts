// O acordar dos agentes (spec distribuicao-de-software, "Acordar os agentes"; change
// software-por-pacote, design, decisão 8a): o chamado pela porta 62354 do agente do GLPI e a tarefa
// da fila que chama na hora as máquinas da distribuição de agora, ou a do "Tentar de novo". Só são
// chamadas as que aguardam, com o pedido que pode seguir, o agente em contato e o IP, até 20 ao
// mesmo tempo; cada chamado fica na máquina e no log dela.
import {
  agentes,
  type Banco,
  distribuicoes,
  maquinasDasDistribuicoes,
  naOrganizacao,
  type Transacao,
} from '@grafite/db';
import { comALinha, linhaDoChamado, podeSeguir, semContato } from '@grafite/domain';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { lerCadastroDosAgentes } from '../agentes/cadastro.ts';
import { FILA_DAS_FALHAS } from '../fila/falhas.ts';
import type { ContextoDasTarefas, DefinicaoDeTarefa } from '../fila/tarefas.ts';

/** Acorda o agente pelo IP: `true` quando ele respondeu. */
export type AcordarAgente = (ip: string) => Promise<boolean>;

/** O `/now` do agente do GLPI, na porta 62354, com 5 s de prazo. */
export const acordarPeloHttp: AcordarAgente = async (ip) => {
  try {
    const resposta = await fetch(`http://${ip}:62354/now`, { signal: AbortSignal.timeout(5000) });
    return resposta.ok;
  } catch {
    return false;
  }
};

/** A tarefa que acorda, na hora, os agentes de uma distribuição ou de uma máquina dela. */
export const TAREFA_DE_ACORDAR = 'software.acordar';

export const DadosDeAcordar = z.object({
  orgId: z.uuid(),
  distribuicaoId: z.uuid(),
  /** Só esta máquina da distribuição, no "Tentar de novo". */
  maquinaId: z.uuid().optional(),
});

/** Quantos agentes são chamados ao mesmo tempo. */
const CHAMADOS_POR_VEZ = 20;

/** A máquina a chamar: o IP do agente e o fuso de quem enviou, para a hora do log. */
export interface MaquinaParaChamar {
  id: string;
  ip: string;
  fuso: string | null;
}

/**
 * As máquinas da distribuição (ou só a pedida) que aguardam, com o pedido que pode seguir no
 * momento, o agente em contato pelo prazo da organização e o IP.
 */
export async function maquinasParaChamar(
  tx: Transacao,
  {
    momento,
    distribuicaoId,
    maquinaId,
  }: { momento: Date; distribuicaoId: string; maquinaId?: string | undefined },
): Promise<MaquinaParaChamar[]> {
  const { diasSemContato } = await lerCadastroDosAgentes(tx);
  const linhas = await tx
    .select({
      id: maquinasDasDistribuicoes.id,
      ip: agentes.ip,
      ultimoContato: agentes.ultimoContato,
      quando: distribuicoes.quando,
      aPartirDe: distribuicoes.aPartirDe,
      fuso: distribuicoes.fuso,
    })
    .from(maquinasDasDistribuicoes)
    .innerJoin(agentes, eq(agentes.id, maquinasDasDistribuicoes.agenteId))
    .innerJoin(distribuicoes, eq(distribuicoes.id, maquinasDasDistribuicoes.distribuicaoId))
    .where(
      and(
        eq(maquinasDasDistribuicoes.distribuicaoId, distribuicaoId),
        maquinaId ? eq(maquinasDasDistribuicoes.id, maquinaId) : undefined,
        eq(maquinasDasDistribuicoes.situacao, 'aguardando'),
        isNotNull(agentes.ip),
      ),
    );
  return linhas.flatMap((linha) =>
    linha.ip &&
    podeSeguir(linha, momento) &&
    !semContato(linha.ultimoContato, momento, diasSemContato).semContato
      ? [{ id: linha.id, ip: linha.ip, fuso: linha.fuso }]
      : [],
  );
}

/**
 * Chama os agentes, até 20 ao mesmo tempo, cada um com os 5 s do chamado, e grava em cada máquina o
 * momento do chamado, se o agente respondeu e a linha do log ("Chamado às 22:00, sem resposta").
 */
export async function chamarAgentes(
  banco: Banco,
  orgId: string,
  maquinas: readonly MaquinaParaChamar[],
  { acordar, momento }: { acordar: AcordarAgente; momento: Date },
): Promise<{ chamados: number; responderam: number }> {
  if (maquinas.length === 0) return { chamados: 0, responderam: 0 };
  const respostas = new Map<string, boolean>();
  let proxima = 0;
  const chamar = async () => {
    while (proxima < maquinas.length) {
      const maquina = maquinas[proxima++];
      if (maquina) respostas.set(maquina.id, await acordar(maquina.ip));
    }
  };
  await Promise.all(Array.from({ length: Math.min(CHAMADOS_POR_VEZ, maquinas.length) }, chamar));
  await naOrganizacao(banco, orgId, async (tx) => {
    // O log é relido com a linha travada: o agente pode ter mandado um passo durante o chamado.
    const atuais = await tx
      .select({ id: maquinasDasDistribuicoes.id, log: maquinasDasDistribuicoes.log })
      .from(maquinasDasDistribuicoes)
      .where(
        inArray(
          maquinasDasDistribuicoes.id,
          maquinas.map(({ id }) => id),
        ),
      )
      .for('update');
    for (const maquina of maquinas) {
      const atual = atuais.find(({ id }) => id === maquina.id);
      if (!atual) continue;
      const respondeu = respostas.get(maquina.id) ?? false;
      await tx
        .update(maquinasDasDistribuicoes)
        .set({
          chamadaEm: momento,
          chamadaRespondeu: respondeu,
          log: comALinha(atual.log, linhaDoChamado(momento, maquina.fuso, respondeu)),
        })
        .where(eq(maquinasDasDistribuicoes.id, maquina.id));
    }
  });
  return {
    chamados: maquinas.length,
    responderam: [...respostas.values()].filter(Boolean).length,
  };
}

/** As tarefas do software: o acordar na hora. */
export function tarefasDoSoftware({
  banco,
  agora,
  log,
  acordar = acordarPeloHttp,
}: ContextoDasTarefas): DefinicaoDeTarefa[] {
  const deAcordar: DefinicaoDeTarefa<z.infer<typeof DadosDeAcordar>> = {
    nome: TAREFA_DE_ACORDAR,
    rotulo: 'Acordar os agentes da distribuição',
    dados: DadosDeAcordar,
    opcoes: { deadLetter: FILA_DAS_FALHAS },
    async trabalho({ orgId, distribuicaoId, maquinaId }) {
      const momento = agora();
      const maquinas = await naOrganizacao(banco, orgId, (tx) =>
        maquinasParaChamar(tx, { momento, distribuicaoId, maquinaId }),
      );
      const feito = await chamarAgentes(banco, orgId, maquinas, { acordar, momento });
      if (feito.chamados > 0) log.info({ orgId, distribuicaoId, ...feito }, 'agentes chamados');
    },
  };
  return [deAcordar as DefinicaoDeTarefa];
}
