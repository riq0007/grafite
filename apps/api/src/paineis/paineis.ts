// Os painéis na API (spec painel-de-dashboards; change painel-de-dashboards, design, decisões 1, 2 e
// 7): o painel como a tela o vê, a verificação de um endereço com o fetch e o prazo de 5 s, a
// verificação dos painéis ativos de uma organização, que só grava o evento quando a situação muda, a
// tarefa a cada minuto e a camada do mapa.
import { type Banco, naOrganizacao, organizacoes, paineis } from '@grafite/db';
import {
  type ArvoreDeLocais,
  PRAZO_DA_VERIFICACAO,
  pode,
  type RespostaDaVerificacao,
  SITUACOES_DO_PAINEL_NA_TELA,
  situacaoDaResposta,
} from '@grafite/domain';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { registrarEvento } from '../eventos/saida.ts';
import { FILA_DAS_FALHAS } from '../fila/falhas.ts';
import type { ContextoDasTarefas, DefinicaoDeTarefa } from '../fila/tarefas.ts';
import type { FornecedorDoMapa } from '../mapa/mapa.ts';

export type LinhaDoPainel = typeof paineis.$inferSelect;

/** O painel como a tela o vê. */
export const painelLido = (linha: LinhaDoPainel, arvore: ArvoreDeLocais) => ({
  id: linha.id,
  nome: linha.nome,
  endereco: linha.endereco,
  local: linha.localId ? { id: linha.localId, caminho: arvore.caminho(linha.localId) } : null,
  ordem: linha.ordem,
  situacao: linha.situacao,
  verificacao: {
    situacao: linha.verificacao,
    momento: linha.verificadoEm?.toISOString() ?? null,
    tempoDaResposta: linha.tempoDaResposta,
    motivo: linha.motivo,
  },
});

/** Quem pede o endereço: o `fetch` de verdade, ou o do teste. */
export type VerificarEndereco = (endereco: string) => Promise<{
  resposta: RespostaDaVerificacao;
  tempo: number;
}>;

/** Pede o endereço com o prazo e descarta o corpo; a falha vira prazo ou conexão. */
export const verificarEndereco: VerificarEndereco = async (endereco) => {
  const inicio = performance.now();
  try {
    const resposta = await fetch(endereco, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(PRAZO_DA_VERIFICACAO),
    });
    await resposta.body?.cancel();
    return { resposta: { status: resposta.status }, tempo: Math.round(performance.now() - inicio) };
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : '';
    return {
      resposta: { falha: nome === 'TimeoutError' || nome === 'AbortError' ? 'prazo' : 'conexao' },
      tempo: Math.round(performance.now() - inicio),
    };
  }
};

/** Quantos pedidos da verificação saem ao mesmo tempo. */
const DE_UMA_VEZ = 10;

/**
 * Verifica os painéis dados, ou os ativos da organização, e grava o resultado. Os pedidos saem fora
 * da transação, de 10 em 10, para ela não esperar a rede. A mudança de situação grava o evento
 * `paineis.mudaram`, uma vez só; a mesma situação grava só o momento e o tempo.
 */
export async function verificarPaineis(
  banco: Banco,
  orgId: string,
  { agora, verificar, ids }: { agora: Date; verificar: VerificarEndereco; ids?: string[] },
): Promise<{ verificados: number; mudaram: number }> {
  const alvos = await naOrganizacao(banco, orgId, (tx) =>
    tx
      .select({ id: paineis.id, endereco: paineis.endereco })
      .from(paineis)
      .where(
        and(
          eq(paineis.situacao, 'ativo'),
          ...(ids && ids.length > 0 ? [inArray(paineis.id, ids)] : []),
        ),
      ),
  );
  const resultados: Awaited<ReturnType<VerificarEndereco>>[] = [];
  for (let inicio = 0; inicio < alvos.length; inicio += DE_UMA_VEZ) {
    const lote = alvos.slice(inicio, inicio + DE_UMA_VEZ);
    resultados.push(...(await Promise.all(lote.map((painel) => verificar(painel.endereco)))));
  }
  return naOrganizacao(banco, orgId, async (tx) => {
    let mudaram = 0;
    for (const [posicao, alvo] of alvos.entries()) {
      const resultado = resultados[posicao];
      if (!resultado) continue;
      const { situacao, motivo } = situacaoDaResposta(resultado.resposta);
      const [antes] = await tx
        .select({ verificacao: paineis.verificacao, motivo: paineis.motivo })
        .from(paineis)
        .where(eq(paineis.id, alvo.id));
      if (!antes) continue;
      if (situacao !== antes.verificacao || motivo !== antes.motivo) mudaram += 1;
      await tx
        .update(paineis)
        .set({
          verificacao: situacao,
          motivo,
          verificadoEm: agora,
          tempoDaResposta: resultado.tempo,
        })
        .where(eq(paineis.id, alvo.id));
    }
    if (mudaram > 0) {
      await registrarEvento(tx, {
        tipo: 'paineis.mudaram',
        alvo: null,
        publico: { permissao: 'paineis.ver' },
      });
    }
    return { verificados: alvos.length, mudaram };
  });
}

export const TAREFA_DOS_PAINEIS = 'verificacao-dos-paineis';

/** As organizações ativas, pela consulta que atravessa organizações só para as tarefas. */
async function organizacoesAtivas(banco: Banco): Promise<string[]> {
  const { rows } = await banco.execute<{ id: string }>(
    sql`select id from app.organizacoes_para_tarefas() as t(id)`,
  );
  return rows.map((linha) => linha.id);
}

/** A verificação a cada minuto, nas organizações com o Painéis ligado. */
export function tarefasDosPaineis(
  { banco, agora, log }: ContextoDasTarefas,
  verificar: VerificarEndereco = verificarEndereco,
): DefinicaoDeTarefa[] {
  const rotina: DefinicaoDeTarefa<unknown> = {
    nome: TAREFA_DOS_PAINEIS,
    rotulo: 'Verificação dos painéis',
    rotina: {
      nome: 'Verificação dos painéis',
      descricao: 'Confere se cada painel responde no endereço dele, com 5 segundos de prazo.',
    },
    dados: z.unknown(),
    agenda: { cron: '* * * * *', fuso: 'America/Sao_Paulo' },
    opcoes: { deadLetter: FILA_DAS_FALHAS },
    async trabalho() {
      const momento = agora();
      for (const orgId of await organizacoesAtivas(banco)) {
        const desligado = await naOrganizacao(banco, orgId, async (tx) => {
          const [organizacao] = await tx
            .select({ desligados: organizacoes.modulosDesligados })
            .from(organizacoes);
          return organizacao?.desligados.includes('paineis') ?? true;
        });
        if (desligado) continue;
        const feito = await verificarPaineis(banco, orgId, { agora: momento, verificar });
        if (feito.mudaram > 0) log.info({ orgId, ...feito }, 'painéis verificados');
      }
    },
  };
  return [rotina];
}

/** Os painéis no mapa, com a situação da última verificação e a ação de vê-lo expandido. */
export const fornecedorDosPaineis: FornecedorDoMapa = {
  alvoTipo: 'painel',
  camada: 'Painéis',
  permissao: 'paineis.ver',
  async marcadores(tx, posicoes, { acesso }) {
    if (posicoes.length === 0 || !pode(acesso, 'paineis.ver')) return [];
    const linhas = await tx
      .select()
      .from(paineis)
      .where(
        and(
          inArray(
            paineis.id,
            posicoes.map((posicao) => posicao.alvoId),
          ),
          eq(paineis.situacao, 'ativo'),
        ),
      );
    const porId = new Map(linhas.map((linha) => [linha.id, linha]));
    return posicoes.flatMap((posicao) => {
      const painel = porId.get(posicao.alvoId);
      if (!painel) return [];
      const situacao = SITUACOES_DO_PAINEL_NA_TELA[painel.verificacao];
      return [
        {
          alvo: { tipo: 'painel', id: painel.id },
          camada: 'Painéis',
          rotulo: painel.nome,
          detalhe: painel.motivo,
          x: posicao.x,
          z: posicao.z,
          situacao: { texto: situacao.texto, tom: situacao.tom },
          acoes: [{ rotulo: 'Ver o painel', destino: `/paineis?expandido=${painel.id}` }],
        },
      ];
    });
  },
  async ve(tx, alvoId, { acesso }) {
    if (!pode(acesso, 'paineis.ver')) return false;
    const [painel] = await tx
      .select({ id: paineis.id })
      .from(paineis)
      .where(eq(paineis.id, alvoId));
    return painel !== undefined;
  },
};
