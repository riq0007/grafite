// As ordens de serviço na API (spec ordens-de-servico; change p4e-ordens-de-servico, design,
// decisões 3 a 7): a OS com o ativo, o local, a solicitação de origem e o fornecedor como
// referência, e se a conta abre a ficha de cada um, o histórico das situações, as peças e o pedido
// de cada ação. Os textos chegam como foram digitados: a conferência e a mensagem de cada campo são
// do domínio.
import { SITUACOES_DA_ORDEM_NO_BANCO } from '@grafite/db';
import {
  LIMITES_DA_ORDEM,
  SITUACOES_DE_ATENDIMENTO,
  SITUACOES_DO_LOTE_DAS_ORDENS,
} from '@grafite/domain';
import { z } from 'zod';
import { Cursor, Limite } from '../paginacao.ts';

/** O local pelo caminho, como "Jundiaí › Expedição". */
export const LocalDaOrdem = z
  .object({ id: z.uuid(), caminho: z.string() })
  .meta({ id: 'LocalDaOrdem' });

const Conta = z.object({ id: z.uuid(), nome: z.string() });

/** O ativo da OS; `abrir` diz se a conta vê o ativo, no local dele. */
export const AtivoDaOrdem = z
  .object({
    id: z.uuid(),
    rotulo: z.string(),
    patrimonio: z.string().nullable(),
    abrir: z.boolean(),
  })
  .meta({ id: 'AtivoDaOrdem' });

const Fornecedor = z.object({ id: z.uuid(), nome: z.string(), abrir: z.boolean() });

/** Uma mudança da situação, no histórico. */
export const MudancaDaOrdem = z
  .object({
    id: z.uuid(),
    situacao: z.enum(SITUACOES_DA_ORDEM_NO_BANCO),
    /** A observação, o que foi feito ou o motivo. */
    texto: z.string().nullable(),
    /** Na Aguardando fornecedor. */
    fornecedor: Fornecedor.nullable(),
    mudadaPor: Conta,
    /** ISO 8601. */
    mudadaEm: z.string(),
  })
  .meta({ id: 'MudancaDaOrdem' });

/** Uma peça lançada, com a saída do estoque; `abrir` diz se a conta vê os consumíveis. */
export const PecaDaOrdem = z
  .object({
    id: z.uuid(),
    consumivel: z.object({
      id: z.uuid(),
      codigo: z.string(),
      nome: z.string().nullable(),
      abrir: z.boolean(),
    }),
    quantidade: z.number().int(),
    local: LocalDaOrdem,
    movimento: z.uuid(),
    lancadaPor: Conta,
    /** ISO 8601. */
    lancadaEm: z.string(),
  })
  .meta({ id: 'PecaDaOrdem' });

export const OrdemDeServico = z
  .object({
    id: z.uuid(),
    numero: z.number().int(),
    situacao: z.enum(SITUACOES_DA_ORDEM_NO_BANCO),
    ativo: AtivoDaOrdem,
    /** O local do ativo na abertura, em que a OS vale para ver e para atender. */
    local: LocalDaOrdem.nullable(),
    /** A solicitação de conserto de que ela nasceu, com quem pediu. */
    solicitacao: z
      .object({
        id: z.uuid(),
        numero: z.number().int(),
        pessoa: z.object({ id: z.uuid(), nome: z.string() }),
      })
      .nullable(),
    problema: z.string(),
    fornecedor: Fornecedor.nullable(),
    osDoFornecedor: z.string().nullable(),
    /** O que foi feito, na resolvida e na encerrada depois de resolvida. */
    solucao: z.string().nullable(),
    motivoDoEncerramento: z.string().nullable(),
    abertaPor: Conta,
    /** ISO 8601. */
    abertaEm: z.string(),
    resolvidaPor: Conta.nullable(),
    resolvidaEm: z.string().nullable(),
    encerradaPor: Conta.nullable(),
    encerradaEm: z.string().nullable(),
    /** Da mudança mais nova para a mais antiga. */
    historico: z.array(MudancaDaOrdem),
    /** Na ordem em que foram lançadas. */
    pecas: z.array(PecaDaOrdem),
    /** A conta atende o local da OS. */
    permite: z.object({ atender: z.boolean() }),
  })
  .meta({ id: 'OrdemDeServico' });

const TextoPedido = z.string().max(5000).nullable().optional();

export const PedidoDeAbertura = z
  .object({
    ativo: z.uuid({ error: 'Ativo não encontrado.' }).nullable().optional(),
    problema: TextoPedido,
  })
  .meta({ id: 'PedidoDeAberturaDaOrdem' });

export const PedidoDeCorrecao = z
  .object({
    problema: TextoPedido,
    /** Só na OS com o fornecedor: o fornecedor e o número da OS nele. */
    fornecedor: z.uuid({ error: 'Fornecedor não encontrado.' }).nullable().optional(),
    os: TextoPedido,
  })
  .meta({ id: 'PedidoDeCorrecaoDaOrdem' });

export const PedidoDeSituacaoDaOrdem = z
  .object({
    situacao: z.enum(SITUACOES_DE_ATENDIMENTO, { error: 'Escolha a situação.' }),
    observacao: TextoPedido,
    /** Na Aguardando fornecedor: o fornecedor e o número da OS nele. */
    fornecedor: z.uuid({ error: 'Fornecedor não encontrado.' }).nullable().optional(),
    os: TextoPedido,
  })
  .meta({ id: 'PedidoDeSituacaoDaOrdem' });

export const PedidoDePeca = z
  .object({
    consumivel: z.uuid({ error: 'Consumível não encontrado.' }).nullable().optional(),
    /** O local de origem, de onde sai a peça. */
    local: z.uuid({ error: 'Local não encontrado.' }).nullable().optional(),
    quantidade: z.number({ error: 'Use um número inteiro de 1 a 100.000.' }).nullable().optional(),
  })
  .meta({ id: 'PedidoDePecaDaOrdem' });

export const PedidoDeResolucao = z
  .object({ solucao: TextoPedido })
  .meta({ id: 'PedidoDeResolucaoDaOrdem' });

export const PedidoDeReabertura = z
  .object({ motivo: TextoPedido })
  .meta({ id: 'PedidoDeReaberturaDaOrdem' });

export const PedidoDeEncerramento = z
  .object({
    /** A em aberto se encerra sem resolver, com o motivo; a Resolvida, sem ele. */
    semResolver: z.boolean().default(false),
    motivo: TextoPedido,
  })
  .meta({ id: 'PedidoDeEncerramentoDaOrdem' });

export const PedidoDoLoteDeOrdens = z
  .object({
    numeros: z
      .array(z.number().int().min(1), { error: 'Escolha as ordens de serviço.' })
      .min(1, { error: 'Escolha as ordens de serviço.' })
      .max(LIMITES_DA_ORDEM.lote, { error: 'Escolha até 200 ordens de serviço.' }),
    situacao: z.enum(SITUACOES_DO_LOTE_DAS_ORDENS, { error: 'Escolha a situação.' }),
  })
  .meta({ id: 'PedidoDoLoteDeOrdens' });

export const RetornoDoLoteDeOrdens = z
  .object({
    mudaram: z.number().int(),
    /** As que ficaram como estavam, com a recusa de cada uma. */
    recusadas: z.array(z.object({ numero: z.number().int(), mensagem: z.string() })),
    /** "5 ordens de serviço mudaram. A 12 não: ainda não foi resolvida." */
    texto: z.string(),
  })
  .meta({ id: 'RetornoDoLoteDeOrdens' });

export const ParametrosDaOrdem = z.object({
  numero: z.coerce
    .number({ error: 'Ordem de serviço não encontrada.' })
    .int({ error: 'Ordem de serviço não encontrada.' })
    .min(1, { error: 'Ordem de serviço não encontrada.' }),
});

/** As em aberto são as Abertas, as Em atendimento, as Aguardando peça e as Aguardando fornecedor. */
const SITUACOES_DO_FILTRO = ['em-aberto', 'todas', ...SITUACOES_DA_ORDEM_NO_BANCO] as const;

export const FiltrosDasOrdens = z.object({
  situacao: z
    .enum(SITUACOES_DO_FILTRO, { error: 'Escolha uma situação da lista.' })
    .default('em-aberto'),
  /** O local, com os de dentro. */
  local: z.uuid({ error: 'Local não encontrado.' }).optional(),
  /** O número, o nome, o patrimônio ou a série do ativo, o problema e a OS do fornecedor. */
  busca: z.string().max(200).optional(),
  limite: Limite,
  cursor: Cursor.optional(),
});

export const ListaDeOrdens = z
  .object({
    itens: z.array(OrdemDeServico),
    /** Quantas OS os filtros trazem, em todas as páginas. */
    total: z.number().int(),
    proximo: z.string().nullable(),
  })
  .meta({ id: 'ListaDeOrdens' });

export const OrdensDoAtivo = z
  .object({
    emAberto: z.array(OrdemDeServico),
    /** As 5 resolvidas ou encerradas mais novas. */
    resolvidasOuEncerradas: z.array(OrdemDeServico),
  })
  .meta({ id: 'OrdensDoAtivo' });

export const ParametrosDoAtivoDaOrdem = z.object({
  id: z.uuid({ error: 'Ativo não encontrado.' }),
});
