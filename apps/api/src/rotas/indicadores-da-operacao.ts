// Os indicadores da operação pela API (spec indicadores-da-operacao; change
// p4f-indicadores-da-operacao, design, decisão 9): o tempo de resolução e as OS repetidas, para
// quem vê as OS, e as páginas por toner, para quem vê o estoque, calculados com o que a conta vê e
// as metas da organização, com o período e se a conta pode mudar a meta; e a meta nova, por quem
// administra a operação, com a auditoria e o evento para quem vê o indicador. Os valores vão em
// números, os tempos em minutos e as porcentagens em décimos de ponto percentual; a web os escreve
// pelas funções do domínio.
import { type Banco, naOrganizacao } from '@grafite/db';
import {
  DEFINICOES_DOS_INDICADORES,
  type IndicadorDaOperacao,
  indicadorDaOperacao,
  podeEm,
} from '@grafite/domain';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { RecusaDePermissao, sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { lerIndicadoresDaOperacao } from '../indicadores-da-operacao/leitura.ts';
import { naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import {
  indicador,
  MetaDoIndicador,
  mudarMeta,
  ParametrosDoIndicador,
  PedidoDeMeta,
} from './indicadores.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

const AtivoDoIndicadorDaOperacao = z
  .object({
    id: z.uuid(),
    /** O rótulo do ativo: o nome, o fabricante e o modelo, ou o tipo. */
    nome: z.string(),
    patrimonio: z.string().nullable(),
    /** O caminho do local atual do ativo, ou nulo no ativo sem local. */
    local: z.string().nullable(),
  })
  .meta({ id: 'AtivoDoIndicadorDaOperacao' });

const OrdemDoIndicador = z
  .object({ id: z.uuid(), numero: z.number().int(), problema: z.string() })
  .meta({ id: 'OrdemDoIndicador' });

const ItemDaResolucao = z
  .object({
    ordem: OrdemDoIndicador,
    ativo: AtivoDoIndicadorDaOperacao,
    /** Da abertura à resolução, ou até agora na OS em aberto. */
    minutos: z.number(),
    emAberto: z.boolean(),
    esperaPelaPeca: z.number(),
    esperaPeloFornecedor: z.number(),
  })
  .meta({ id: 'ItemDaResolucaoDasOrdens' });

const ItemDasRepetidas = z
  .object({
    ativo: AtivoDoIndicadorDaOperacao,
    quantas: z.number().int(),
    /** As OS do ativo no período, da mais antiga para a mais nova. */
    ordens: z.array(OrdemDoIndicador),
    /** ISO 8601. */
    ultimaEm: z.string(),
  })
  .meta({ id: 'ItemDasOrdensRepetidas' });

const ItemDasPaginas = z
  .object({
    impressora: AtivoDoIndicadorDaOperacao,
    consumivel: z.object({ id: z.uuid(), codigo: z.string() }),
    paginas: z.number().int(),
    rendimento: z.number().int(),
    /** As páginas sobre o rendimento, em décimos de ponto percentual: 617 é 61,7%. */
    porMil: z.number().int(),
    /** ISO 8601. */
    trocadoEm: z.string(),
  })
  .meta({ id: 'ItemDasPaginasPorToner' });

const IndicadoresDaOperacao = z
  .object({
    /** Os últimos 30 dias até a consulta, em ISO 8601; o anterior são os 30 antes deles. */
    periodo: z.object({ inicio: z.string(), fim: z.string() }),
    permite: z.object({ mudarMeta: z.boolean() }),
    /** Só os que a conta vê: os das OS, com `ordens.ver`, e o das páginas, com `estoque.ver`. */
    indicadores: z.object({
      'resolucao-das-os': indicador(ItemDaResolucao).optional(),
      'os-repetidas': indicador(ItemDasRepetidas).optional(),
      'paginas-por-toner': indicador(ItemDasPaginas).optional(),
    }),
  })
  .meta({ id: 'IndicadoresDaOperacao' });

export const rotasDosIndicadoresDaOperacao: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  app.get(
    '/operacao/indicadores',
    {
      // A tela vale para quem vê as OS ou o estoque: a rota confere as duas permissões, e a conta
      // sem nenhuma é recusada como pela guarda.
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'Os indicadores da operação que a conta vê, nos últimos 30 dias, com as metas',
        response: {
          200: IndicadoresDaOperacao,
          401: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const { metas, calculados, ve } = await lerIndicadoresDaOperacao(tx, {
          agora: momento,
          arvore,
          acesso,
        });
        if (!ve.ordens && !ve.estoque) throw new RecusaDePermissao('ordens.ver');
        const comMeta = <T extends object>(chave: IndicadorDaOperacao, resultado: T) => ({
          meta: metas[chave],
          metaDeFabrica: DEFINICOES_DOS_INDICADORES[chave].metaDeFabrica,
          ...resultado,
        });
        const resolucao = calculados['resolucao-das-os'];
        const repetidas = calculados['os-repetidas'];
        const paginas = calculados['paginas-por-toner'];
        return {
          periodo: {
            inicio: calculados.periodo.inicio.toISOString(),
            fim: calculados.periodo.fim.toISOString(),
          },
          permite: { mudarMeta: podeEm(acesso, 'operacao.administrar', null, arvore) },
          indicadores: {
            ...(ve.ordens
              ? {
                  'resolucao-das-os': comMeta('resolucao-das-os', {
                    ...resolucao,
                    itens: resolucao.itens.map(({ id, numero, problema, ...item }) => ({
                      ordem: { id, numero, problema },
                      ...item,
                    })),
                  }),
                  'os-repetidas': comMeta('os-repetidas', {
                    ...repetidas,
                    itens: repetidas.itens.map((item) => ({
                      ...item,
                      ultimaEm: item.ultimaEm.toISOString(),
                    })),
                  }),
                }
              : {}),
            ...(ve.estoque
              ? {
                  'paginas-por-toner': comMeta('paginas-por-toner', {
                    ...paginas,
                    itens: paginas.itens.map((item) => ({
                      ...item,
                      trocadoEm: item.trocadoEm.toISOString(),
                    })),
                  }),
                }
              : {}),
          },
        };
      });
    },
  );

  app.put(
    '/operacao/indicadores/:indicador/meta',
    {
      config: { permissao: 'operacao.administrar' },
      schema: {
        summary: 'Mudar a meta de um indicador da operação, dentro dos limites dele',
        params: ParametrosDoIndicador,
        body: PedidoDeMeta,
        response: {
          200: MetaDoIndicador,
          401: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao) => {
      const { indicador } = requisicao.params;
      if (!indicadorDaOperacao(indicador)) throw naoEncontrado('Indicador não encontrado.');
      return mudarMeta(banco, requisicao, {
        indicador,
        meta: requisicao.body.meta,
        momento: agora(),
        // O evento vai para quem vê o indicador: as páginas por toner, para quem vê o estoque.
        quemVe: indicador === 'paginas-por-toner' ? 'estoque.ver' : 'ordens.ver',
      });
    },
  );
};
