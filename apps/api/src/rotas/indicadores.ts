// Os indicadores dos alertas pela API (spec indicadores; change p3d-indicadores, design, decisão 6):
// os quatro indicadores, calculados com os alertas que a conta vê e as metas da organização, com o
// período e se a conta pode mudar a meta; e a meta nova, por quem administra os alertas, com a
// auditoria e o evento que atualiza as telas. Os valores vão em números, os tempos em minutos e a
// disponibilidade em décimos de ponto percentual; a web os escreve pelas funções do domínio.
import {
  type Banco,
  INDICADORES_NO_BANCO,
  indicadoresDaOrganizacao,
  naOrganizacao,
} from '@grafite/db';
import {
  conferirMeta,
  DEFINICOES_DOS_INDICADORES,
  type Indicador,
  indicadorDosAlertas,
  type Permissao,
  podeEm,
  textoDaMeta,
} from '@grafite/domain';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerIndicadores, metasDaOrganizacao } from '../alertas/indicadores.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { dadosInvalidos, naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const AlvoDoIndicador = z
  .discriminatedUnion('tipo', [
    z.object({
      tipo: z.literal('ativo'),
      id: z.uuid(),
      /** O rótulo do ativo: o nome, o fabricante e o modelo, ou o tipo. */
      nome: z.string(),
      /** O caminho do local na árvore, ou nulo no ativo sem local. */
      local: z.string().nullable(),
    }),
    z.object({ tipo: z.literal('coletor'), id: z.uuid(), nome: z.string() }),
  ])
  .meta({ id: 'AlvoDoIndicador' });

export const SituacaoDoIndicador = z.enum(['dentro', 'fora', 'sem-dado']);

/** O que todo indicador tem, com a lista dele: o dos alertas e o da operação. */
export const indicador = <I extends z.ZodType>(item: I) =>
  z.object({
    /** A meta da organização, na unidade do indicador. */
    meta: z.number().int(),
    metaDeFabrica: z.number().int(),
    /** Os tempos em minutos; a disponibilidade e os alertas que voltam, quantos na lista. */
    valor: z.number().nullable(),
    anterior: z.number().nullable(),
    /** Quantas trocas, alertas ou ativos o valor resume. */
    base: z.number().int(),
    situacao: SituacaoDoIndicador,
    /** Até 20, na ordem da tela. */
    itens: z.array(item),
    /** Quantos ficaram de fora da lista. */
    mais: z.number().int(),
  });

const ItemDeTempo = z
  .object({
    alerta: z.object({ id: z.uuid(), texto: z.string() }),
    alvo: AlvoDoIndicador,
    minutos: z.number(),
    /** O toner ainda sem troca, ou o Crítico ainda sem reconhecimento. */
    esperando: z.boolean(),
    /** Quem reconheceu, pelo nome atual da pessoa. */
    reconhecidoPor: z.string().nullable(),
  })
  .meta({ id: 'ItemDeTempoDoIndicador' });

const ItemDaDisponibilidade = z
  .object({
    alvo: AlvoDoIndicador,
    /** Em décimos de ponto percentual, arredondado para baixo: 975 é 97,5%. */
    porMil: z.number().int(),
    minutosForaDoAr: z.number(),
  })
  .meta({ id: 'ItemDaDisponibilidade' });

const ItemQueVolta = z
  .object({
    alvo: AlvoDoIndicador,
    regra: z.object({ id: z.uuid(), nome: z.string() }),
    vezes: z.number().int(),
    /** ISO 8601. */
    ultimaEm: z.string(),
  })
  .meta({ id: 'ItemQueVolta' });

const IndicadoresDosAlertas = z
  .object({
    /** Os últimos 30 dias até a consulta, em ISO 8601; o anterior são os 30 antes deles. */
    periodo: z.object({ inicio: z.string(), fim: z.string() }),
    permite: z.object({ mudarMeta: z.boolean() }),
    indicadores: z.object({
      toner: indicador(ItemDeTempo),
      critico: indicador(ItemDeTempo),
      disponibilidade: indicador(ItemDaDisponibilidade),
      'que-voltam': indicador(ItemQueVolta),
    }),
  })
  .meta({ id: 'IndicadoresDosAlertas' });

/** O indicador vem como texto, para o desconhecido responder 404, e não 400. */
export const ParametrosDoIndicador = z.object({ indicador: z.string() });

export const PedidoDeMeta = z
  .object({
    /** Na unidade do indicador: minutos, décimos de ponto percentual ou vezes. */
    meta: z.number({ error: 'Informe a meta.' }),
  })
  .meta({ id: 'PedidoDeMeta' });

export const MetaDoIndicador = z
  .object({
    indicador: z.enum(INDICADORES_NO_BANCO),
    meta: z.number().int(),
    metaDeFabrica: z.number().int(),
  })
  .meta({ id: 'MetaDoIndicador' });

export const rotasDosIndicadores: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  app.get(
    '/alertas/indicadores',
    {
      config: { permissao: 'alertas.ver' },
      schema: {
        summary: 'Os indicadores dos alertas que a conta vê, nos últimos 30 dias, com as metas',
        response: { 200: IndicadoresDosAlertas, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const { metas, calculados } = await lerIndicadores(tx, { agora: momento, arvore, acesso });
        const comMeta = <T extends { itens: unknown[] }>(
          chave: keyof typeof metas,
          resultado: T,
        ) => ({
          meta: metas[chave],
          metaDeFabrica: DEFINICOES_DOS_INDICADORES[chave].metaDeFabrica,
          ...resultado,
        });
        const deTempo = (resultado: typeof calculados.toner) => ({
          ...resultado,
          itens: resultado.itens.map(({ id, texto, ...item }) => ({
            alerta: { id, texto },
            ...item,
          })),
        });
        const { toner, critico, disponibilidade } = calculados;
        const queVoltam = calculados['que-voltam'];
        return {
          periodo: {
            inicio: calculados.periodo.inicio.toISOString(),
            fim: calculados.periodo.fim.toISOString(),
          },
          permite: { mudarMeta: podeEm(acesso, 'alertas.administrar', null, arvore) },
          indicadores: {
            toner: comMeta('toner', deTempo(toner)),
            critico: comMeta('critico', deTempo(critico)),
            disponibilidade: comMeta('disponibilidade', disponibilidade),
            'que-voltam': comMeta('que-voltam', {
              ...queVoltam,
              itens: queVoltam.itens.map((item) => ({
                ...item,
                ultimaEm: item.ultimaEm.toISOString(),
              })),
            }),
          },
        };
      });
    },
  );

  app.put(
    '/alertas/indicadores/:indicador/meta',
    {
      config: { permissao: 'alertas.administrar' },
      schema: {
        summary: 'Mudar a meta de um indicador da organização, dentro dos limites dele',
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
      if (!indicadorDosAlertas(indicador)) throw naoEncontrado('Indicador não encontrado.');
      return mudarMeta(banco, requisicao, {
        indicador,
        meta: requisicao.body.meta,
        momento: agora(),
        quemVe: 'alertas.ver',
      });
    },
  );
};

/**
 * Grava a meta nova de um indicador, conferida pelos limites dele, com a auditoria do "antes →
 * depois" e o evento `metas.mudaram` para quem vê o indicador. A mesma meta não grava nada, como a
 * edição sem mudança de uma regra. Mudar a meta não mexe na marca da avaliação diária.
 */
export async function mudarMeta(
  banco: Banco,
  requisicao: FastifyRequest,
  {
    indicador,
    meta,
    momento,
    quemVe,
  }: { indicador: Indicador; meta: unknown; momento: Date; quemVe: Permissao },
) {
  const { contaId } = sessaoDa(requisicao);
  const conferida = conferirMeta(indicador, meta);
  if (!conferida.ok) throw dadosInvalidos({ meta: conferida.erro });
  const resposta = {
    indicador,
    meta: conferida.meta,
    metaDeFabrica: DEFINICOES_DOS_INDICADORES[indicador].metaDeFabrica,
  };
  return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
    const antes = (await metasDaOrganizacao(tx))[indicador];
    if (antes === conferida.meta) return resposta;
    const [linha] = await tx
      .insert(indicadoresDaOrganizacao)
      .values({
        orgId: requisicao.organizacao?.id ?? '',
        indicador,
        meta: conferida.meta,
        metaAlteradaEm: momento,
        metaAlteradaPor: contaId,
      })
      .onConflictDoUpdate({
        target: [indicadoresDaOrganizacao.orgId, indicadoresDaOrganizacao.indicador],
        set: { meta: conferida.meta, metaAlteradaEm: momento, metaAlteradaPor: contaId },
      })
      .returning({ id: indicadoresDaOrganizacao.id });
    const alvo = { tipo: 'indicador', id: linha?.id ?? null };
    await registrarNaAuditoria(tx, {
      acao: 'meta-de-indicador.alterada',
      ator: { tipo: 'conta', contaId },
      alvo,
      antes: { meta: textoDaMeta(indicador, antes) },
      depois: { meta: textoDaMeta(indicador, conferida.meta) },
      dados: { indicador: DEFINICOES_DOS_INDICADORES[indicador].nome },
      origem: origemDa(requisicao),
      momento,
      saida: { publico: { permissao: quemVe }, alvo },
    });
    return resposta;
  });
}
