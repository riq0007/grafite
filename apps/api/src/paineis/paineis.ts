// Os painéis na API (spec painel-de-dashboards; change painel-de-dashboards, design, decisões 1, 2 e
// 7): o painel como a tela o vê, a verificação de um endereço com o fetch e o prazo de 5 s, a
// verificação dos painéis ativos de uma organização, que só grava o evento quando a situação muda, a
// tarefa a cada minuto e a camada do mapa. A verificação lê também a exibição do painel no ar
// (change diagnostico-dos-paineis, design, decisão 3): se o navegador consegue mostrá-lo dentro do
// Grafite, pelos cabeçalhos e pelo endereço em que a resposta terminou.
import { type Banco, enderecosDeAcesso, naOrganizacao, organizacoes, paineis } from '@grafite/db';
import {
  type ArvoreDeLocais,
  exibicaoDaResposta,
  PRAZO_DA_VERIFICACAO,
  pode,
  type RespostaComCabecalhos,
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
  // A exibição que a última verificação leu do painel no ar; sem ela, `null`.
  exibicao: linha.exibicao ? { situacao: linha.exibicao, motivo: linha.motivoDaExibicao } : null,
});

/** Quem pede o endereço: o `fetch` de verdade, ou o do teste. */
export type VerificarEndereco = (endereco: string) => Promise<{
  /** A resposta, com o que a exibição lê dela, ou a falha antes da resposta. */
  resposta: RespostaComCabecalhos | { falha: 'prazo' | 'conexao' };
  tempo: number;
}>;

/** Quantos redirecionamentos a verificação segue; a resposta seguinte vale como a do painel. */
const REDIRECIONAMENTOS = 3;

/**
 * Pede o endereço com o prazo, seguindo até 3 redirecionamentos, e descarta o corpo; a falha vira
 * prazo ou conexão. Da resposta ficam o código, os cabeçalhos que barram a exibição e o endereço
 * em que ela terminou.
 */
export const verificarEndereco: VerificarEndereco = async (endereco) => {
  const inicio = performance.now();
  const tempo = () => Math.round(performance.now() - inicio);
  try {
    // O prazo é um só, do pedido com os redirecionamentos dele.
    const signal = AbortSignal.timeout(PRAZO_DA_VERIFICACAO);
    let atual = endereco;
    for (let seguidos = 0; ; seguidos += 1) {
      const resposta = await fetch(atual, { method: 'GET', redirect: 'manual', signal });
      await resposta.body?.cancel();
      const destino = resposta.headers.get('location');
      const redireciona =
        resposta.status >= 300 &&
        resposta.status < 400 &&
        destino !== null &&
        URL.canParse(destino, atual);
      if (!redireciona || seguidos === REDIRECIONAMENTOS) {
        return {
          resposta: {
            status: resposta.status,
            xFrameOptions: resposta.headers.get('x-frame-options'),
            contentSecurityPolicy: resposta.headers.get('content-security-policy'),
            enderecoFinal: atual,
          },
          tempo: tempo(),
        };
      }
      atual = new URL(destino, atual).href;
    }
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : '';
    return {
      resposta: { falha: nome === 'TimeoutError' || nome === 'AbortError' ? 'prazo' : 'conexao' },
      tempo: tempo(),
    };
  }
};

/** Quantos pedidos da verificação saem ao mesmo tempo. */
const DE_UMA_VEZ = 10;

/**
 * Verifica os painéis dados, ou os ativos da organização, e grava o resultado. Os pedidos saem fora
 * da transação, de 10 em 10, para ela não esperar a rede. A mudança da situação, do motivo ou da
 * exibição grava o evento `paineis.mudaram`, uma vez só; sem mudança, só o momento e o tempo são
 * gravados.
 */
export async function verificarPaineis(
  banco: Banco,
  orgId: string,
  { agora, verificar, ids }: { agora: Date; verificar: VerificarEndereco; ids?: string[] },
): Promise<{ verificados: number; mudaram: number }> {
  const { alvos, acessos } = await naOrganizacao(banco, orgId, async (tx) => ({
    alvos: await tx
      .select({ id: paineis.id, endereco: paineis.endereco })
      .from(paineis)
      .where(
        and(
          eq(paineis.situacao, 'ativo'),
          ...(ids && ids.length > 0 ? [inArray(paineis.id, ids)] : []),
        ),
      ),
    // Os endereços de acesso da organização, lidos uma vez por rodada: é com eles que o
    // `frame-ancestors` da ferramenta é comparado.
    acessos: (
      await tx.select({ endereco: enderecosDeAcesso.endereco }).from(enderecosDeAcesso)
    ).map((linha) => linha.endereco),
  }));
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
      // Só o painel no ar tem exibição: fora do ar, não há o que o navegador mostrar.
      const lida =
        situacao === 'no-ar' && 'status' in resultado.resposta
          ? exibicaoDaResposta(resultado.resposta, {
              endereco: alvo.endereco,
              enderecosDeAcesso: acessos,
            })
          : { exibicao: null, motivo: null };
      const [antes] = await tx
        .select({
          verificacao: paineis.verificacao,
          motivo: paineis.motivo,
          exibicao: paineis.exibicao,
          motivoDaExibicao: paineis.motivoDaExibicao,
        })
        .from(paineis)
        .where(eq(paineis.id, alvo.id));
      if (!antes) continue;
      if (
        situacao !== antes.verificacao ||
        motivo !== antes.motivo ||
        lida.exibicao !== antes.exibicao ||
        lida.motivo !== antes.motivoDaExibicao
      ) {
        mudaram += 1;
      }
      await tx
        .update(paineis)
        .set({
          verificacao: situacao,
          motivo,
          exibicao: lida.exibicao,
          motivoDaExibicao: lida.motivo,
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
