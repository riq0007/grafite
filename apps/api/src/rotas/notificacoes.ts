// As notificações da conta pela API (spec notificacoes; change p3b-notificacoes-no-servidor,
// design, decisões 5 e 7): a lista da própria conta, com a severidade, "só não lidas", o cursor e a
// contagem das não lidas, e o alerta atual de cada uma, com o que a conta pode tratar; a leitura de
// uma e de todas, com o evento das sessões da conta. Sem permissão própria: cada conta vê só as
// dela, com a sessão valendo.
import {
  alertas,
  ativos,
  type Banco,
  contas,
  naOrganizacao,
  notificacoes,
  pessoas,
  SEVERIDADES_NO_BANCO,
  type Transacao,
} from '@grafite/db';
import { podeEm } from '@grafite/domain';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { exigirAtiva, sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { registrarEvento } from '../eventos/saida.ts';
import { Cursor, decodificarCursor, Limite, pagina } from '../paginacao.ts';
import { naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

const AlertaDaNotificacao = z
  .object({
    id: z.uuid(),
    situacao: z.enum(['aberto', 'resolvido']),
    reconhecido: z.object({ nome: z.string(), em: z.string() }).nullable(),
    /** Só enquanto o adiamento vale. */
    adiado: z.object({ ate: z.string(), nome: z.string() }).nullable(),
    /** Se a conta trata o alerta, pelo local do ativo ou, no coletor, na organização inteira. */
    permite: z.object({ tratar: z.boolean() }),
  })
  .meta({ id: 'AlertaDaNotificacao' });

export const NotificacaoNaLista = z
  .object({
    id: z.uuid(),
    severidade: z.enum(SEVERIDADES_NO_BANCO),
    titulo: z.string(),
    descricao: z.string().nullable(),
    origem: z.string(),
    destino: z.string().nullable(),
    /** ISO 8601. */
    criadaEm: z.string(),
    lida: z.boolean(),
    /** O alerta de que trata, como está agora. */
    alerta: AlertaDaNotificacao.nullable(),
  })
  .meta({ id: 'NotificacaoNaLista' });

const ListaDeNotificacoes = z
  .object({
    itens: z.array(NotificacaoNaLista),
    /** As não lidas da conta, sem os filtros. */
    naoLidas: z.number().int(),
    proximo: z.string().nullable(),
  })
  .meta({ id: 'ListaDeNotificacoes' });

const FiltrosDasNotificacoes = z.object({
  severidade: z
    .enum(SEVERIDADES_NO_BANCO, { error: 'Escolha a severidade: critico, atencao ou info.' })
    .optional(),
  naoLidas: z.enum(['true', 'false']).optional(),
  limite: Limite,
  cursor: Cursor.optional(),
});

const ParametrosDaNotificacao = z.object({ id: z.uuid({ error: 'Notificação não encontrada.' }) });

const LeituraDeTodas = z.object({ lidas: z.number().int() }).meta({ id: 'LeituraDasNotificacoes' });

/** A chave do cursor: o momento, em texto com os microssegundos, e o id. */
const ChaveDoCursor = z.tuple([z.string(), z.uuid()]);

const PROBLEMAS_DAS_NOTIFICACOES = { 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO };

/** Quantas notificações da conta ainda não foram lidas. */
async function contarNaoLidas(tx: Transacao, contaId: string): Promise<number> {
  const [linha] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(notificacoes)
    .where(and(eq(notificacoes.contaId, contaId), isNull(notificacoes.lidaEm)));
  return linha?.total ?? 0;
}

/** Os nomes atuais das pessoas das contas dadas. */
async function nomesDasContas(tx: Transacao, ids: readonly string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const linhas = await tx
    .select({ id: contas.id, nome: pessoas.nome })
    .from(contas)
    .innerJoin(pessoas, eq(pessoas.id, contas.pessoaId))
    .where(inArray(contas.id, [...ids]));
  return new Map(linhas.map((linha) => [linha.id, linha.nome]));
}

/** O evento das sessões da conta, que atualiza o sino e os avisos das outras abas. */
const avisarAConta = (tx: Transacao, contaId: string) =>
  registrarEvento(tx, {
    tipo: 'notificacoes.mudaram',
    alvo: null,
    publico: { contas: [contaId] },
  });

export const rotasDasNotificacoes: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  app.get(
    '/notificacoes',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtiva,
      schema: {
        summary: 'As notificações da própria conta, da mais recente para a mais antiga',
        querystring: FiltrosDasNotificacoes,
        response: { 200: ListaDeNotificacoes, ...PROBLEMAS_DAS_NOTIFICACOES },
      },
    },
    async (requisicao) => {
      const { contaId, acesso } = sessaoDa(requisicao);
      const { severidade, naoLidas, limite, cursor } = requisicao.query;
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const depois = cursor ? decodificarCursor(cursor, ChaveDoCursor) : null;
        const linhas = await tx
          .select({
            id: notificacoes.id,
            severidade: notificacoes.severidade,
            titulo: notificacoes.titulo,
            descricao: notificacoes.descricao,
            origem: notificacoes.origem,
            destino: notificacoes.destino,
            criadaEm: notificacoes.criadaEm,
            chave: sql<string>`to_json(${notificacoes.criadaEm}) #>> '{}'`,
            lidaEm: notificacoes.lidaEm,
            alertaId: alertas.id,
            situacao: alertas.situacao,
            ativoId: alertas.ativoId,
            localId: ativos.localId,
            reconhecidoPor: alertas.reconhecidoPor,
            reconhecidoEm: alertas.reconhecidoEm,
            adiadoPor: alertas.adiadoPor,
            adiadoAte: alertas.adiadoAte,
          })
          .from(notificacoes)
          .leftJoin(alertas, eq(alertas.id, notificacoes.alertaId))
          .leftJoin(ativos, eq(ativos.id, alertas.ativoId))
          .where(
            and(
              eq(notificacoes.contaId, contaId),
              severidade ? eq(notificacoes.severidade, severidade) : undefined,
              naoLidas === 'true' ? isNull(notificacoes.lidaEm) : undefined,
              depois
                ? sql`(${notificacoes.criadaEm}, ${notificacoes.id}) < (${depois[0]}::timestamptz, ${depois[1]}::uuid)`
                : undefined,
            ),
          )
          .orderBy(desc(notificacoes.criadaEm), desc(notificacoes.id))
          .limit(limite + 1);
        const { linhas: daPagina, proximo } = pagina(linhas, limite, (linha) => [
          linha.chave,
          linha.id,
        ]);
        const comAlerta = daPagina.filter((linha) => linha.alertaId !== null);
        const arvore = comAlerta.length > 0 ? await lerArvore(tx) : null;
        const nomes = await nomesDasContas(tx, [
          ...new Set(
            comAlerta.flatMap((linha) =>
              [linha.reconhecidoPor, linha.adiadoPor].filter((id): id is string => id !== null),
            ),
          ),
        ]);
        return {
          itens: daPagina.map((linha) => ({
            id: linha.id,
            severidade: linha.severidade,
            titulo: linha.titulo,
            descricao: linha.descricao,
            origem: linha.origem,
            destino: linha.destino,
            criadaEm: linha.criadaEm.toISOString(),
            lida: linha.lidaEm !== null,
            alerta:
              linha.alertaId !== null && arvore
                ? {
                    id: linha.alertaId,
                    situacao:
                      linha.situacao === 'resolvido' ? ('resolvido' as const) : ('aberto' as const),
                    reconhecido:
                      linha.reconhecidoPor && linha.reconhecidoEm
                        ? {
                            nome: nomes.get(linha.reconhecidoPor) ?? '',
                            em: linha.reconhecidoEm.toISOString(),
                          }
                        : null,
                    adiado:
                      linha.situacao !== 'resolvido' &&
                      linha.adiadoPor &&
                      linha.adiadoAte &&
                      linha.adiadoAte > momento
                        ? {
                            ate: linha.adiadoAte.toISOString(),
                            nome: nomes.get(linha.adiadoPor) ?? '',
                          }
                        : null,
                    permite: {
                      tratar: podeEm(
                        acesso,
                        'alertas.tratar',
                        linha.ativoId ? linha.localId : null,
                        arvore,
                      ),
                    },
                  }
                : null,
          })),
          naoLidas: await contarNaoLidas(tx, contaId),
          proximo,
        };
      });
    },
  );

  app.post(
    '/notificacoes/:id/leitura',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtiva,
      schema: {
        summary: 'Marcar uma notificação da própria conta como lida',
        params: ParametrosDaNotificacao,
        response: { 204: z.null(), ...PROBLEMAS_DAS_NOTIFICACOES },
      },
    },
    async (requisicao, resposta) => {
      const { contaId } = sessaoDa(requisicao);
      const momento = agora();
      await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const daConta = and(
          eq(notificacoes.id, requisicao.params.id),
          eq(notificacoes.contaId, contaId),
        );
        const lidas = await tx
          .update(notificacoes)
          .set({ lidaEm: momento })
          .where(and(daConta, isNull(notificacoes.lidaEm)))
          .returning({ id: notificacoes.id });
        if (lidas.length > 0) {
          await avisarAConta(tx, contaId);
          return;
        }
        const [existe] = await tx.select({ id: notificacoes.id }).from(notificacoes).where(daConta);
        if (!existe) throw naoEncontrado('Notificação não encontrada.');
      });
      return resposta.code(204).send(null);
    },
  );

  app.post(
    '/notificacoes/leitura',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtiva,
      schema: {
        summary: 'Marcar todas as notificações da própria conta como lidas',
        response: { 200: LeituraDeTodas, ...PROBLEMAS_DAS_NOTIFICACOES },
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const lidas = await tx
          .update(notificacoes)
          .set({ lidaEm: momento })
          .where(and(eq(notificacoes.contaId, contaId), isNull(notificacoes.lidaEm)))
          .returning({ id: notificacoes.id });
        if (lidas.length > 0) await avisarAConta(tx, contaId);
        return { lidas: lidas.length };
      });
    },
  );
};
