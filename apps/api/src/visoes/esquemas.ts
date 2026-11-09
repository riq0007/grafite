// Os esquemas das visões de tabela no contrato da API (spec visoes-de-tabela; design do P1c, decisão
// 6). A definição pedida é conferida pelo domínio, com as mensagens dele, e por isso entra como um
// objeto; a devolvida segue a forma que o domínio garante.
import { type IdDaTabelaComVisoes, SITUACOES_DO_FILTRO, TABELAS_COM_VISOES } from '@grafite/domain';
import { z } from 'zod';

export const TabelaComVisoes = z.enum(
  TABELAS_COM_VISOES.map((tabela) => tabela.id) as [IdDaTabelaComVisoes, ...IdDaTabelaComVisoes[]],
  { error: 'Tabela desconhecida.' },
);

const LimiteDoIntervalo = z.union([z.number(), z.string()]);

export const FiltroDaVisao = z
  .discriminatedUnion('operador', [
    z.object({ chave: z.string(), operador: z.literal('contem'), texto: z.string() }),
    z.object({ chave: z.string(), operador: z.literal('vazio') }),
    z.object({ chave: z.string(), operador: z.literal('preenchido') }),
    z.object({
      chave: z.string(),
      operador: z.literal('entre'),
      de: LimiteDoIntervalo.optional(),
      ate: LimiteDoIntervalo.optional(),
    }),
    z.object({ chave: z.string(), operador: z.literal('qualquer'), valores: z.array(z.string()) }),
    z.object({ chave: z.string(), operador: z.literal('em'), local: z.string() }),
    /** O local sem os de dentro. */
    z.object({ chave: z.string(), operador: z.literal('igual'), local: z.string() }),
    z.object({
      chave: z.string(),
      operador: z.literal('situacao'),
      situacao: z.enum(SITUACOES_DO_FILTRO),
    }),
  ])
  .meta({ id: 'FiltroDaVisao' });

export const DefinicaoDaVisao = z
  .object({
    /** As colunas à vista, na ordem da tabela, com a largura em pixels quando ela mudou. */
    colunas: z.array(z.object({ chave: z.string(), largura: z.number().int().optional() })),
    ordenacao: z
      .object({ chave: z.string(), direcao: z.enum(['crescente', 'decrescente']) })
      .nullable(),
    filtros: z.array(FiltroDaVisao),
  })
  .meta({ id: 'DefinicaoDaVisao' });

export const VisaoDaTabela = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    /** A visão da organização, que todos usam; sem ela, a da própria conta. */
    compartilhada: z.boolean(),
    definicao: DefinicaoDaVisao,
    permite: z.object({ editar: z.boolean() }),
  })
  .meta({ id: 'VisaoDaTabela' });

/** As mudanças da conta sobre a visão de fábrica ou uma da organização (change visoes-da-conta). */
export const MudancasDaVisao = z
  .object({
    /** O id da visão, ou `fabrica`. */
    visao: z.string(),
    definicao: DefinicaoDaVisao,
    atualizadaEm: z.iso.datetime(),
  })
  .meta({ id: 'MudancasDaVisao' });

export const VisoesDaTabela = z
  .object({
    /** As da organização, pelo nome, e depois as da conta, pelo nome. */
    visoes: z.array(VisaoDaTabela),
    /** As mudanças da conta sobre a visão de fábrica e as da organização. */
    mudancas: z.array(MudancasDaVisao),
    permite: z.object({ compartilhar: z.boolean() }),
  })
  .meta({ id: 'VisoesDaTabela' });

/** A definição pedida, como objeto: o domínio confere a forma e os limites. */
const DefinicaoPedida = z.record(z.string(), z.unknown(), {
  error: 'A definição da visão não é válida.',
});

export const PedidoDeVisao = z
  .object({
    tabela: TabelaComVisoes,
    nome: z.string({ error: 'Dê um nome à visão.' }),
    /** Compartilhar com a organização pede `organizacao.editar`. */
    compartilhada: z.boolean().default(false),
    definicao: DefinicaoPedida,
  })
  .meta({ id: 'PedidoDeVisao' });

export const PedidoDeAlteracaoDaVisao = z
  .strictObject({
    nome: z.string({ error: 'Dê um nome à visão.' }).optional(),
    definicao: DefinicaoPedida.optional(),
  })
  .meta({ id: 'PedidoDeAlteracaoDaVisao' });

export const ParametrosDaVisao = z.object({ id: z.uuid({ error: 'Visão não encontrada.' }) });

/** As mudanças da conta sobre uma visão; o domínio confere a visão e a definição. */
export const PedidoDeMudancas = z
  .object({
    tabela: TabelaComVisoes,
    /** O id da visão, ou `fabrica`. */
    visao: z.string({ error: 'A visão não existe.' }),
    definicao: DefinicaoPedida,
  })
  .meta({ id: 'PedidoDeMudancas' });

export const FiltroDasMudancas = z.object({
  tabela: TabelaComVisoes,
  /** Sem a visão, as mudanças da conta em todas as visões da tabela. */
  visao: z.string().optional(),
});
