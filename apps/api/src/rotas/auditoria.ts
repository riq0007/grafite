// A consulta da auditoria (spec consulta-da-auditoria; design do F2b, decisões 12 e 13): só para
// quem tem auditoria.ver, e nada a altera. A lista vem do mais recente ao mais antigo, ou ao
// contrário, paginada pelo cursor de (momento, id), com os filtros valendo para o conjunto inteiro e
// o total contado até 10.000. Os nomes de quem fez e do alvo são os atuais, resolvidos na consulta.
import {
  ativos,
  auditoria,
  type Banco,
  contas,
  grupos,
  modelos,
  naOrganizacao,
  ordensDeServico,
  perfis,
  pessoas,
  segredos,
  sessoes,
  solicitacoes,
  tiposDeAtivo,
} from '@grafite/db';
import {
  descreverDispositivo,
  nomeDaOrdem,
  normalizarTexto,
  ROTULOS_DOS_TIPOS_DE_SOLICITACAO,
  rotuloDaAcao,
  rotuloDoAtivo,
} from '@grafite/domain';
import { and, asc, desc, eq, gte, inArray, like, lte, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { consultarAtivos } from '../ativos/leitura.ts';
import { contendo } from '../busca.ts';
import { Cursor, decodificarCursor, Limite, pagina } from '../paginacao.ts';
import { RespostaDeProblema } from '../problemas.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

/** O total é exato até aqui; acima, a resposta diz "mais de". */
const TETO_DO_TOTAL = 10_000;

const AtorDoRegistro = z
  .discriminatedUnion('tipo', [
    z.object({
      tipo: z.literal('conta'),
      id: z.uuid(),
      /** O nome atual da pessoa da conta, o anonimizado depois da anonimização. */
      nome: z.string(),
      usuario: z.string().nullable(),
    }),
    z.object({ tipo: z.literal('sistema'), descricao: z.string() }),
    z.object({ tipo: z.literal('anonimo') }),
  ])
  .meta({ id: 'AtorDoRegistro' });

const RegistroDeAuditoria = z
  .object({
    id: z.uuid(),
    momento: z.iso.datetime(),
    acao: z.string(),
    /** O texto da ação em pt-BR, ou a própria chave quando ela ainda não tem rótulo. */
    rotulo: z.string(),
    ator: AtorDoRegistro,
    alvo: z.object({
      tipo: z.string(),
      id: z.uuid().nullable(),
      /**
       * O nome atual do alvo: a pessoa, o perfil, o grupo, o caminho do local, o ativo ou o
       * dispositivo.
       */
      nome: z.string().nullable(),
      /** O usuário, quando o alvo é uma conta. */
      usuario: z.string().nullable(),
    }),
    antes: z.record(z.string(), z.unknown()).nullable(),
    depois: z.record(z.string(), z.unknown()).nullable(),
    dados: z.record(z.string(), z.unknown()).nullable(),
    ip: z.string().nullable(),
    codigoDeRastreio: z.string().nullable(),
  })
  .meta({ id: 'RegistroDeAuditoria' });

const ListaDaAuditoria = z
  .object({
    itens: z.array(RegistroDeAuditoria),
    proximo: z.string().nullable(),
    /** Quantos registros atendem aos filtros, até 10.000. */
    total: z.number().int().min(0),
    /** Há mais registros que o total diz. */
    maisDe: z.boolean(),
  })
  .meta({ id: 'ListaDaAuditoria' });

const UM_ALVO = /^[a-z-]+:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const Alvo = z.string().regex(UM_ALVO, { error: 'Use o tipo e o id do alvo, como pessoa:<id>.' });

const FiltrosDaAuditoria = z.object({
  /** O começo do período, incluído. */
  de: z.iso.datetime({ error: 'Informe o começo do período como data e hora.' }).optional(),
  /** O fim do período, incluído. */
  ate: z.iso.datetime({ error: 'Informe o fim do período como data e hora.' }).optional(),
  /** Quem fez: o id da conta. */
  ator: z.uuid({ error: 'Conta não encontrada.' }).optional(),
  acao: z
    .string()
    .regex(/^[a-z-]+\.[a-z-]+$/, { error: 'Escolha uma ação da lista.' })
    .optional(),
  /** Um ou mais alvos, como pessoa:<id> e conta:<id>; vale qualquer um deles. */
  alvo: z.union([Alvo, z.array(Alvo)]).optional(),
  rastreio: z.string().max(20, { error: 'Use até 20 caracteres.' }).optional(),
  ordem: z
    .enum(['recentes', 'antigos'], { error: 'Escolha recentes ou antigos.' })
    .default('recentes'),
  cursor: Cursor.optional(),
  limite: Limite,
});

/** A chave da ordem: o momento com a precisão do banco e o id, que desempata. */
const ChaveDoRegistro = z.tuple([z.string(), z.uuid()]);

const ContaDoFiltro = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    usuario: z.string().nullable(),
    situacao: z.enum(['ativa', 'inativa', 'anonimizada']),
  })
  .meta({ id: 'ContaDoFiltro' });

const FiltrosDasContas = z.object({
  busca: z.string().max(200, { error: 'Use até 200 caracteres.' }).optional(),
  limite: Limite,
});

const contaDoAtor = alias(contas, 'conta_do_ator');
const pessoaDoAtor = alias(pessoas, 'pessoa_do_ator');
const pessoaAlvo = alias(pessoas, 'pessoa_alvo');
const contaAlvo = alias(contas, 'conta_alvo');
const pessoaDaContaAlvo = alias(pessoas, 'pessoa_da_conta_alvo');
const perfilAlvo = alias(perfis, 'perfil_alvo');
const grupoAlvo = alias(grupos, 'grupo_alvo');
const sessaoAlvo = alias(sessoes, 'sessao_alvo');

/** O texto como padrão do `like`, com os curingas escapados. */

/** Os filtros da consulta, sem o cursor: valem também para o total. */
function condicoesDaConsulta(filtros: z.infer<typeof FiltrosDaAuditoria>): SQL[] {
  const condicoes: SQL[] = [];
  if (filtros.de) condicoes.push(gte(auditoria.momento, new Date(filtros.de)));
  if (filtros.ate) condicoes.push(lte(auditoria.momento, new Date(filtros.ate)));
  if (filtros.ator) condicoes.push(eq(auditoria.atorContaId, filtros.ator));
  if (filtros.acao) condicoes.push(eq(auditoria.acao, filtros.acao));
  const alvos = [filtros.alvo ?? []].flat();
  if (alvos.length > 0) {
    const algum = or(
      ...alvos.map((alvo) => {
        const [tipo = '', id = ''] = alvo.split(':');
        return and(eq(auditoria.alvoTipo, tipo), eq(auditoria.alvoId, id));
      }),
    );
    if (algum) condicoes.push(algum);
  }
  const rastreio = filtros.rastreio?.trim().toUpperCase();
  if (rastreio) condicoes.push(eq(auditoria.codigoDeRastreio, rastreio));
  return condicoes;
}

export const rotasDaAuditoria: FastifyPluginAsyncZod<{ banco: Banco }> = async (app, { banco }) => {
  app.get(
    '/auditoria',
    {
      config: { permissao: 'auditoria.ver' },
      schema: {
        summary: 'Os registros da auditoria, com filtros',
        querystring: FiltrosDaAuditoria,
        response: { 200: ListaDaAuditoria, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      sessaoDa(requisicao);
      const filtros = requisicao.query;
      const depoisDe = filtros.cursor ? decodificarCursor(filtros.cursor, ChaveDoRegistro) : null;
      const recentes = filtros.ordem === 'recentes';
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const condicoes = condicoesDaConsulta(filtros);
        const doCursor = depoisDe
          ? recentes
            ? sql`(${auditoria.momento}, ${auditoria.id}) < (${depoisDe[0]}::timestamptz, ${depoisDe[1]}::uuid)`
            : sql`(${auditoria.momento}, ${auditoria.id}) > (${depoisDe[0]}::timestamptz, ${depoisDe[1]}::uuid)`
          : undefined;
        const linhas = await tx
          .select({
            id: auditoria.id,
            momento: auditoria.momento,
            momentoExato: sql<string>`to_char(${auditoria.momento} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
            acao: auditoria.acao,
            atorTipo: auditoria.atorTipo,
            atorContaId: auditoria.atorContaId,
            atorDescricao: auditoria.atorDescricao,
            atorNome: pessoaDoAtor.nome,
            atorUsuario: contaDoAtor.usuario,
            alvoTipo: auditoria.alvoTipo,
            alvoId: auditoria.alvoId,
            pessoaAlvo: pessoaAlvo.nome,
            contaAlvo: pessoaDaContaAlvo.nome,
            usuarioAlvo: contaAlvo.usuario,
            perfilAlvo: perfilAlvo.nome,
            grupoAlvo: grupoAlvo.nome,
            agenteAlvo: sessaoAlvo.agente,
            antes: auditoria.antes,
            depois: auditoria.depois,
            dados: auditoria.dados,
            ip: auditoria.ip,
            codigoDeRastreio: auditoria.codigoDeRastreio,
          })
          .from(auditoria)
          .leftJoin(
            contaDoAtor,
            and(eq(contaDoAtor.orgId, auditoria.orgId), eq(contaDoAtor.id, auditoria.atorContaId)),
          )
          .leftJoin(
            pessoaDoAtor,
            and(
              eq(pessoaDoAtor.orgId, contaDoAtor.orgId),
              eq(pessoaDoAtor.id, contaDoAtor.pessoaId),
            ),
          )
          .leftJoin(
            pessoaAlvo,
            and(
              eq(auditoria.alvoTipo, 'pessoa'),
              eq(pessoaAlvo.orgId, auditoria.orgId),
              eq(pessoaAlvo.id, auditoria.alvoId),
            ),
          )
          .leftJoin(
            contaAlvo,
            and(
              eq(auditoria.alvoTipo, 'conta'),
              eq(contaAlvo.orgId, auditoria.orgId),
              eq(contaAlvo.id, auditoria.alvoId),
            ),
          )
          .leftJoin(
            pessoaDaContaAlvo,
            and(
              eq(pessoaDaContaAlvo.orgId, contaAlvo.orgId),
              eq(pessoaDaContaAlvo.id, contaAlvo.pessoaId),
            ),
          )
          .leftJoin(
            perfilAlvo,
            and(
              eq(auditoria.alvoTipo, 'perfil'),
              eq(perfilAlvo.orgId, auditoria.orgId),
              eq(perfilAlvo.id, auditoria.alvoId),
            ),
          )
          .leftJoin(
            grupoAlvo,
            and(
              eq(auditoria.alvoTipo, 'grupo'),
              eq(grupoAlvo.orgId, auditoria.orgId),
              eq(grupoAlvo.id, auditoria.alvoId),
            ),
          )
          .leftJoin(
            sessaoAlvo,
            and(
              eq(auditoria.alvoTipo, 'sessao'),
              eq(sessaoAlvo.orgId, auditoria.orgId),
              eq(sessaoAlvo.id, auditoria.alvoId),
            ),
          )
          .where(and(...condicoes, doCursor))
          .orderBy(
            ...(recentes
              ? [desc(auditoria.momento), desc(auditoria.id)]
              : [asc(auditoria.momento), asc(auditoria.id)]),
          )
          .limit(filtros.limite + 1);

        const { rows } = await tx.execute<{ total: number }>(
          sql`select count(*)::int as total from (
                select 1 from ${auditoria} where ${and(...condicoes) ?? sql`true`}
                limit ${TETO_DO_TOTAL + 1}
              ) as contados`,
        );
        const contados = rows[0]?.total ?? 0;

        const arvore = await lerArvore(tx);
        const { linhas: daPagina, proximo } = pagina(linhas, filtros.limite, (linha) => [
          linha.momentoExato,
          linha.id,
        ]);
        const ativosDaPagina = daPagina.flatMap((linha) =>
          linha.alvoTipo === 'ativo' && linha.alvoId ? [linha.alvoId] : [],
        );
        const nomesDosAtivos = new Map(
          ativosDaPagina.length === 0
            ? []
            : (await consultarAtivos(tx).where(inArray(ativos.id, ativosDaPagina))).map((ativo) => [
                ativo.ativo.id,
                rotuloDoAtivo({ nome: ativo.ativo.nome, modelo: ativo.modelo, tipo: ativo.tipo }),
              ]),
        );
        // O segredo do cofre pelo nome atual: os dados dele, nunca o valor.
        const segredosDaPagina = daPagina.flatMap((linha) =>
          linha.alvoTipo === 'segredo' && linha.alvoId ? [linha.alvoId] : [],
        );
        const nomesDosSegredos = new Map(
          segredosDaPagina.length === 0
            ? []
            : (
                await tx
                  .select({ id: segredos.id, nome: segredos.nome })
                  .from(segredos)
                  .where(inArray(segredos.id, segredosDaPagina))
              ).map((segredo) => [segredo.id, segredo.nome]),
        );
        // A solicitação pelo número, pelo tipo e por quem pediu, como está agora: as mudanças de
        // situação só guardam a situação.
        const solicitacoesDaPagina = daPagina.flatMap((linha) =>
          linha.alvoTipo === 'solicitacao' && linha.alvoId ? [linha.alvoId] : [],
        );
        const nomesDasSolicitacoes = new Map(
          solicitacoesDaPagina.length === 0
            ? []
            : (
                await tx
                  .select({
                    id: solicitacoes.id,
                    numero: solicitacoes.numero,
                    tipo: solicitacoes.tipo,
                    pessoa: pessoas.nome,
                  })
                  .from(solicitacoes)
                  .innerJoin(pessoas, eq(pessoas.id, solicitacoes.pessoaId))
                  .where(inArray(solicitacoes.id, solicitacoesDaPagina))
              ).map(({ id, numero, tipo, pessoa }) => [
                id,
                `${numero} · ${ROTULOS_DOS_TIPOS_DE_SOLICITACAO[tipo]} · ${pessoa}`,
              ]),
        );
        // A OS pelo número, pelo patrimônio do ativo e pelo problema, como está agora.
        const ordensDaPagina = daPagina.flatMap((linha) =>
          linha.alvoTipo === 'ordem' && linha.alvoId ? [linha.alvoId] : [],
        );
        const nomesDasOrdens = new Map(
          ordensDaPagina.length === 0
            ? []
            : (
                await tx
                  .select({
                    id: ordensDeServico.id,
                    numero: ordensDeServico.numero,
                    problema: ordensDeServico.problema,
                    patrimonio: ativos.patrimonio,
                    nome: ativos.nome,
                    tipo: { nome: tiposDeAtivo.nome },
                    modelo: { fabricante: modelos.fabricante, nome: modelos.nome },
                  })
                  .from(ordensDeServico)
                  .innerJoin(ativos, eq(ativos.id, ordensDeServico.ativoId))
                  .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
                  .leftJoin(modelos, eq(modelos.id, ativos.modeloId))
                  .where(inArray(ordensDeServico.id, ordensDaPagina))
              ).map(({ id, numero, problema, patrimonio, nome, tipo, modelo }) => [
                id,
                nomeDaOrdem({
                  numero,
                  ativo: patrimonio ?? rotuloDoAtivo({ nome, modelo, tipo }),
                  problema,
                }),
              ]),
        );
        return {
          itens: daPagina.map((linha) => {
            const local = linha.alvoTipo === 'local' && linha.alvoId !== null;
            const nomeDoAlvo =
              linha.pessoaAlvo ??
              linha.contaAlvo ??
              linha.perfilAlvo ??
              linha.grupoAlvo ??
              (local && linha.alvoId && arvore.local(linha.alvoId)
                ? arvore.caminho(linha.alvoId)
                : null) ??
              (linha.alvoTipo === 'sessao' && linha.alvoId !== null
                ? descreverDispositivo(linha.agenteAlvo)
                : null) ??
              (linha.alvoTipo === 'ativo' && linha.alvoId
                ? (nomesDosAtivos.get(linha.alvoId) ?? null)
                : null) ??
              (linha.alvoTipo === 'segredo' && linha.alvoId
                ? (nomesDosSegredos.get(linha.alvoId) ?? null)
                : null) ??
              (linha.alvoTipo === 'solicitacao' && linha.alvoId
                ? (nomesDasSolicitacoes.get(linha.alvoId) ?? null)
                : null) ??
              (linha.alvoTipo === 'ordem' && linha.alvoId
                ? (nomesDasOrdens.get(linha.alvoId) ?? null)
                : null);
            return {
              id: linha.id,
              momento: linha.momento.toISOString(),
              acao: linha.acao,
              rotulo: rotuloDaAcao(linha.acao),
              ator:
                linha.atorTipo === 'conta'
                  ? {
                      tipo: 'conta' as const,
                      id: linha.atorContaId ?? '',
                      nome: linha.atorNome ?? '',
                      usuario: linha.atorUsuario,
                    }
                  : linha.atorTipo === 'sistema'
                    ? { tipo: 'sistema' as const, descricao: linha.atorDescricao ?? '' }
                    : { tipo: 'anonimo' as const },
              alvo: {
                tipo: linha.alvoTipo,
                id: linha.alvoId,
                nome: nomeDoAlvo,
                usuario: linha.alvoTipo === 'conta' ? linha.usuarioAlvo : null,
              },
              antes: linha.antes as Record<string, unknown> | null,
              depois: linha.depois as Record<string, unknown> | null,
              dados: linha.dados as Record<string, unknown> | null,
              ip: linha.ip,
              codigoDeRastreio: linha.codigoDeRastreio,
            };
          }),
          proximo,
          total: Math.min(contados, TETO_DO_TOTAL),
          maisDe: contados > TETO_DO_TOTAL,
        };
      });
    },
  );

  app.get(
    '/auditoria/contas',
    {
      config: { permissao: 'auditoria.ver' },
      schema: {
        summary: 'As contas para o filtro "quem fez", inclusive as inativas e as anonimizadas',
        querystring: FiltrosDasContas,
        response: {
          200: z.object({ itens: z.array(ContaDoFiltro) }).meta({ id: 'ContasDoFiltro' }),
          401: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao) => {
      sessaoDa(requisicao);
      const { busca, limite } = requisicao.query;
      const palavras = normalizarTexto(busca ?? '')
        .split(' ')
        .filter(Boolean);
      const itens = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        tx
          .select({
            id: contas.id,
            nome: pessoas.nome,
            usuario: contas.usuario,
            situacao: contas.situacao,
          })
          .from(contas)
          .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
          .where(
            and(
              ...palavras.map(
                (palavra) =>
                  or(
                    like(pessoas.busca, contendo(palavra)),
                    like(contas.usuario, contendo(palavra)),
                  ) as SQL,
              ),
            ),
          )
          .orderBy(pessoas.nome, contas.id)
          .limit(limite),
      );
      return { itens };
    },
  );
};
