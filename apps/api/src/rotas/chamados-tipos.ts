// Os tipos de chamado pela API (spec tipos-de-chamado, "Tipo de chamado"; change chamados-da-ti,
// design, decisão 18): a lista, para quem configura os chamados, com quem atende por padrão, o
// tipo de ativo do equipamento, quantos campos tem o formulário, os abertos e os abertos nos
// últimos 365 dias de cada tipo; e a ordem, com a auditoria e o evento dos ajustes. Os abertos
// contam os chamados de todos os locais: quem configura os tipos o faz na organização, e a contagem
// não mostra nenhum chamado.
import {
  type Banco,
  chamados,
  contas,
  naOrganizacao,
  pessoas,
  type Transacao,
  tiposDeAtivo,
  tiposDeChamado,
} from '@grafite/db';
import {
  ICONES_DO_TIPO_DE_CHAMADO,
  MENSAGENS_DO_TIPO_DE_CHAMADO,
  MODOS_DO_PRAZO,
  SEM_NINGUEM,
  SITUACOES_DO_TIPO_DE_CHAMADO,
  SOLICITACOES_DO_TIPO_DE_CHAMADO,
  UNIDADES_DO_PRAZO,
} from '@grafite/domain';
import { asc, eq, gte, ne, or, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { dadosInvalidos, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

/** O último ano da contagem: os 365 dias antes de agora. */
const UM_ANO_MS = 365 * 24 * 60 * 60 * 1000;

const ValorDoPrazo = z.object({ valor: z.number(), unidade: z.enum(UNIDADES_DO_PRAZO) });

const Referencia = z.object({ id: z.uuid(), nome: z.string() });

export const TipoDeChamado = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    icone: z.enum(ICONES_DO_TIPO_DE_CHAMADO),
    /** A frase para o colaborador; só o Rascunho fica sem ela. */
    frase: z.string().nullable(),
    situacao: z.enum(SITUACOES_DO_TIPO_DE_CHAMADO),
    ordem: z.number(),
    prazo: z.object({
      modo: z.enum(MODOS_DO_PRAZO),
      resposta: ValorDoPrazo,
      resolucao: ValorDoPrazo,
    }),
    /** A conta de quem atende por padrão, com o nome da pessoa; nulo, o chamado cai na triagem. */
    atendePorPadrao: Referencia.nullable(),
    semNinguem: z.enum(SEM_NINGUEM),
    podeVirarOs: z.boolean(),
    geraSolicitacao: z.enum(SOLICITACOES_DO_TIPO_DE_CHAMADO),
    /** O tipo de ativo da solicitação de Equipamento, só com ela. */
    tipoDeAtivoDoEquipamento: Referencia.nullable(),
    pedeOAtivo: z.boolean(),
    apareceParaOColaborador: z.boolean(),
    soATiAbre: z.boolean(),
    /** Quantos campos o formulário tem. */
    campos: z.number(),
    /** O tipo de onde o Rascunho foi duplicado, que a lista marca "copiado daqui". */
    duplicadoDe: z.uuid().nullable(),
    /** Os chamados do tipo em aberto, de todos os locais. */
    abertos: z.number(),
    /** Os chamados do tipo abertos nos últimos 365 dias, também os já resolvidos. */
    noUltimoAno: z.number(),
  })
  .meta({ id: 'TipoDeChamado' });

const ListaDosTiposDeChamado = z
  .object({ tipos: z.array(TipoDeChamado) })
  .meta({ id: 'ListaDosTiposDeChamado' });

const PROBLEMAS = { 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO };

type TipoNaLista = z.infer<typeof TipoDeChamado>;

/** A ordem dos tipos, a mesma na lista, na trava da ordem e na auditoria. */
const naOrdem = [asc(tiposDeChamado.ordem), asc(tiposDeChamado.nomeNormalizado)];

/** Os tipos na ordem, com as contagens de agora. */
export async function lerTiposDeChamado(tx: Transacao, agora: Date): Promise<TipoNaLista[]> {
  const desde = new Date(agora.getTime() - UM_ANO_MS);
  const contagens = await tx
    .select({
      tipoId: chamados.tipoId,
      abertos: sql<number>`count(*) filter (where ${ne(chamados.situacao, 'resolvido')})`.mapWith(
        Number,
      ),
      noUltimoAno: sql<number>`count(*) filter (where ${gte(chamados.abertoEm, desde)})`.mapWith(
        Number,
      ),
    })
    .from(chamados)
    .where(or(ne(chamados.situacao, 'resolvido'), gte(chamados.abertoEm, desde)))
    .groupBy(chamados.tipoId);
  const doTipo = new Map(contagens.map(({ tipoId, ...contagem }) => [tipoId, contagem]));

  const linhas = await tx
    .select({
      tipo: tiposDeChamado,
      // A API grava sempre o formulário conferido, com os campos; o `coalesce` só guarda a resposta.
      campos:
        sql<number>`coalesce(jsonb_array_length(${tiposDeChamado.formulario} -> 'campos'), 0)`.mapWith(
          Number,
        ),
      quemAtende: pessoas.nome,
      tipoDeAtivo: tiposDeAtivo.nome,
    })
    .from(tiposDeChamado)
    .leftJoin(contas, eq(contas.id, tiposDeChamado.atendePorPadrao))
    .leftJoin(pessoas, eq(pessoas.id, contas.pessoaId))
    .leftJoin(tiposDeAtivo, eq(tiposDeAtivo.id, tiposDeChamado.tipoDeAtivoDoEquipamento))
    .orderBy(...naOrdem);
  return linhas.map(({ tipo, campos, quemAtende, tipoDeAtivo }) => ({
    id: tipo.id,
    nome: tipo.nome,
    icone: tipo.icone,
    frase: tipo.frase,
    situacao: tipo.situacao,
    ordem: tipo.ordem,
    prazo: {
      modo: tipo.modo,
      resposta: { valor: tipo.respostaValor, unidade: tipo.respostaUnidade },
      resolucao: { valor: tipo.resolucaoValor, unidade: tipo.resolucaoUnidade },
    },
    atendePorPadrao:
      tipo.atendePorPadrao && quemAtende !== null
        ? { id: tipo.atendePorPadrao, nome: quemAtende }
        : null,
    semNinguem: tipo.semNinguem,
    podeVirarOs: tipo.podeVirarOs,
    geraSolicitacao: tipo.geraSolicitacao,
    tipoDeAtivoDoEquipamento:
      tipo.tipoDeAtivoDoEquipamento && tipoDeAtivo !== null
        ? { id: tipo.tipoDeAtivoDoEquipamento, nome: tipoDeAtivo }
        : null,
    pedeOAtivo: tipo.pedeOAtivo,
    apareceParaOColaborador: tipo.apareceParaOColaborador,
    soATiAbre: tipo.soATiAbre,
    campos,
    duplicadoDe: tipo.duplicadoDe,
    abertos: doTipo.get(tipo.id)?.abertos ?? 0,
    noUltimoAno: doTipo.get(tipo.id)?.noUltimoAno ?? 0,
  }));
}

export const rotasDosTiposDeChamado: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  const orgDa = (requisicao: FastifyRequest) => requisicao.organizacao?.id ?? '';
  const autorDa = (requisicao: FastifyRequest) =>
    ({ tipo: 'conta', contaId: sessaoDa(requisicao).contaId }) as const;

  app.get(
    '/chamados/tipos',
    {
      config: { permissao: 'chamados.configurar' },
      schema: {
        summary: 'Os tipos de chamado, na ordem, com os abertos e os do último ano',
        response: { 200: ListaDosTiposDeChamado, ...PROBLEMAS },
      },
    },
    async (requisicao) => ({
      tipos: await naOrganizacao(banco, orgDa(requisicao), (tx) => lerTiposDeChamado(tx, agora())),
    }),
  );

  app.put(
    '/chamados/tipos/ordem',
    {
      config: { permissao: 'chamados.configurar' },
      schema: {
        summary: 'Ordenar os tipos de chamado, com todos, uma vez cada',
        body: z.object({ ids: z.array(z.uuid()) }),
        response: { 200: ListaDosTiposDeChamado, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { ids } = requisicao.body;
      const momento = agora();
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        // Travados, para duas ordens ao mesmo tempo não se misturarem: a segunda espera a primeira.
        // A leitura vem depois da trava, num comando à parte, para ver a ordem que a primeira
        // deixou. No READ COMMITTED, o `order by` junto com a trava ordenaria pelo retrato de
        // antes da espera, e a segunda compararia o pedido e gravaria o antes na sequência velha.
        await tx.select({ id: tiposDeChamado.id }).from(tiposDeChamado).for('update');
        const atuais = await tx
          .select({ id: tiposDeChamado.id, nome: tiposDeChamado.nome, ordem: tiposDeChamado.ordem })
          .from(tiposDeChamado)
          .orderBy(...naOrdem);
        const pelaId = new Map(atuais.map((tipo) => [tipo.id, tipo]));
        if (
          ids.length !== atuais.length ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !pelaId.has(id))
        ) {
          throw dadosInvalidos({ ids: MENSAGENS_DO_TIPO_DE_CHAMADO.ordem });
        }
        if (ids.every((id, posicao) => atuais[posicao]?.id === id)) {
          return { tipos: await lerTiposDeChamado(tx, momento) };
        }
        for (const [posicao, id] of ids.entries()) {
          if (pelaId.get(id)?.ordem === posicao + 1) continue;
          await tx
            .update(tiposDeChamado)
            .set({ ordem: posicao + 1 })
            .where(eq(tiposDeChamado.id, id));
        }
        await registrarNaAuditoria(tx, {
          acao: 'tipos-de-chamado.ordenados',
          ator: autorDa(requisicao),
          alvo: { tipo: 'tipos-de-chamado' },
          antes: { ordem: atuais.map(({ nome }) => nome) },
          depois: { ordem: ids.map((id) => pelaId.get(id)?.nome ?? id) },
          origem: origemDa(requisicao),
          momento,
        });
        return { tipos: await lerTiposDeChamado(tx, momento) };
      });
    },
  );
};
