// As solicitações na API (spec solicitacoes; change p4d-solicitacoes, design, decisões 3 a 7): a
// solicitação com quem pediu pelo nome, a impressora, o ativo, o tipo e o fornecedor como
// referência, e se a conta abre a ficha de cada um, e o pedido de cada tipo. Os textos chegam como
// foram digitados: a conferência e a mensagem de cada campo são do domínio.
import {
  CORES_DO_TONER_NO_BANCO,
  ORIGENS_DA_ENTREGA_NO_BANCO,
  SITUACOES_DA_ORDEM_NO_BANCO,
  SITUACOES_DA_SOLICITACAO_NO_BANCO,
  TIPOS_DE_SOLICITACAO_NO_BANCO,
} from '@grafite/db';
import { z } from 'zod';
import { Cursor, Limite } from '../paginacao.ts';

/** O local pelo caminho, como "Jundiaí › Expedição". */
export const LocalDaSolicitacao = z
  .object({ id: z.uuid(), caminho: z.string() })
  .meta({ id: 'LocalDaSolicitacao' });

const Conta = z.object({ id: z.uuid(), nome: z.string() });

/** A impressora ou o ativo do conserto; `abrir` diz se a conta vê o ativo, no local dele. */
export const AtivoDaSolicitacao = z
  .object({
    id: z.uuid(),
    rotulo: z.string(),
    patrimonio: z.string().nullable(),
    abrir: z.boolean(),
  })
  .meta({ id: 'AtivoDaSolicitacao' });

const Fornecedor = z.object({ id: z.uuid(), nome: z.string(), abrir: z.boolean() });

export const ItemDaSolicitacao = z
  .object({
    id: z.uuid(),
    cor: z.enum(CORES_DO_TONER_NO_BANCO),
    quantidade: z.number().int(),
    /** O sugerido, o escolhido ou o entregue; `abrir` diz se a conta vê os consumíveis. */
    consumivel: z
      .object({
        id: z.uuid(),
        codigo: z.string(),
        nome: z.string().nullable(),
        abrir: z.boolean(),
      })
      .nullable(),
    /** Nula no item pendente. */
    entrega: z
      .object({
        origem: z.enum(ORIGENS_DA_ENTREGA_NO_BANCO),
        /** Do estoque: o local de origem e a movimentação lançada. */
        local: LocalDaSolicitacao.nullable(),
        movimento: z.uuid().nullable(),
        /** Pelo fornecedor. */
        fornecedor: Fornecedor.nullable(),
        entreguePor: Conta,
        /** ISO 8601. */
        entregueEm: z.string(),
      })
      .nullable(),
  })
  .meta({ id: 'ItemDaSolicitacao' });

export const ImpressoraDaSolicitacao = z
  .object({
    ativo: AtivoDaSolicitacao,
    /** O total de páginas congelado quando a impressora entrou, com o momento da leitura (ISO 8601). */
    contador: z.object({ paginas: z.number().int(), lidoEm: z.string() }).nullable(),
    itens: z.array(ItemDaSolicitacao),
  })
  .meta({ id: 'ImpressoraDaSolicitacao' });

export const Solicitacao = z
  .object({
    id: z.uuid(),
    numero: z.number().int(),
    tipo: z.enum(TIPOS_DE_SOLICITACAO_NO_BANCO),
    situacao: z.enum(SITUACOES_DA_SOLICITACAO_NO_BANCO),
    /** Quem pediu, só pelo nome. */
    pessoa: z.object({ id: z.uuid(), nome: z.string() }),
    observacao: z.string().nullable(),
    /** Os locais da solicitação, em que ela vale para ver e para atender. */
    locais: z.array(LocalDaSolicitacao),
    /** Uma impressora ou o ativo sem local: só a organização inteira a alcança. */
    semLocal: z.boolean(),
    /** No toner. */
    impressoras: z.array(ImpressoraDaSolicitacao),
    /** No conserto. */
    ativo: AtivoDaSolicitacao.nullable(),
    defeito: z.string().nullable(),
    /** No equipamento. */
    tipoDeAtivo: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
    quantidade: z.number().int().nullable(),
    motivo: z.string().nullable(),
    local: LocalDaSolicitacao.nullable(),
    /** O pedido ao fornecedor, no toner e no equipamento. */
    fornecedor: Fornecedor.nullable(),
    osDoFornecedor: z.string().nullable(),
    oQueFoiFeito: z.string().nullable(),
    motivoDoCancelamento: z.string().nullable(),
    registradaPor: Conta,
    /** ISO 8601. */
    registradaEm: z.string(),
    encerradaPor: Conta.nullable(),
    encerradaEm: z.string().nullable(),
    /** A conta atende todos os locais da solicitação. */
    permite: z.object({ atender: z.boolean() }),
    /**
     * A OS do conserto (change p4e-ordens-de-servico); `abrir` diz se a conta vê as OS do local
     * dela. Com a OS em aberto, a solicitação segue a OS e não muda por si.
     */
    ordem: z
      .object({
        numero: z.number().int(),
        situacao: z.enum(SITUACOES_DA_ORDEM_NO_BANCO),
        abrir: z.boolean(),
      })
      .nullable(),
  })
  .meta({ id: 'Solicitacao' });

const TextoPedido = z.string().max(5000).nullable().optional();
const PessoaPedida = z.uuid({ error: 'Pessoa não encontrada.' }).nullable().optional();
const QuantidadePedida = z
  .number({ error: 'Use um número inteiro de 1 a 99.' })
  .nullable()
  .optional();

const ItemPedido = z.object({
  impressora: z.uuid({ error: 'Impressora não encontrada.' }).nullable().optional(),
  cor: z.enum(CORES_DO_TONER_NO_BANCO, { error: 'Escolha a cor.' }).nullable().optional(),
  quantidade: QuantidadePedida,
  /** Sem ele, a API sugere o compatível da cor. */
  consumivel: z.uuid({ error: 'Consumível não encontrado.' }).nullable().optional(),
});

/** O registro e a alteração, com os campos do tipo; a alteração não muda o tipo. */
export const PedidoDaSolicitacao = z
  .discriminatedUnion(
    'tipo',
    [
      z.object({
        tipo: z.literal('toner'),
        pessoa: PessoaPedida,
        observacao: TextoPedido,
        impressoras: z
          .array(z.uuid({ error: 'Impressora não encontrada.' }))
          .max(100)
          .optional(),
        itens: z.array(ItemPedido).max(500).optional(),
      }),
      z.object({
        tipo: z.literal('conserto'),
        pessoa: PessoaPedida,
        observacao: TextoPedido,
        ativo: z.uuid({ error: 'Ativo não encontrado.' }).nullable().optional(),
        defeito: TextoPedido,
      }),
      z.object({
        tipo: z.literal('equipamento'),
        pessoa: PessoaPedida,
        observacao: TextoPedido,
        tipoDeAtivo: z.uuid({ error: 'Tipo de ativo não encontrado.' }).nullable().optional(),
        quantidade: QuantidadePedida,
        motivo: TextoPedido,
        local: z.uuid({ error: 'Local não encontrado.' }).nullable().optional(),
      }),
    ],
    { error: 'Escolha o tipo.' },
  )
  .meta({ id: 'PedidoDaSolicitacao' });

export const ParametrosDaSolicitacao = z.object({
  numero: z.coerce
    .number({ error: 'Solicitação não encontrada.' })
    .int({ error: 'Solicitação não encontrada.' })
    .min(1, { error: 'Solicitação não encontrada.' }),
});

export const PedidoDeSituacao = z
  .object({
    situacao: z.enum(['em-atendimento', 'aguardando-entrega'], { error: 'Escolha a situação.' }),
  })
  .meta({ id: 'PedidoDeSituacaoDaSolicitacao' });

export const PedidoAoFornecedor = z
  .object({
    fornecedor: z.uuid({ error: 'Fornecedor não encontrado.' }).nullable().optional(),
    /** O número da OS no fornecedor, a "OS digital" do PMG. */
    os: TextoPedido,
  })
  .meta({ id: 'PedidoAoFornecedor' });

export const PedidoDeConclusao = z
  .object({ oQueFoiFeito: TextoPedido })
  .meta({ id: 'PedidoDeConclusaoDaSolicitacao' });

export const PedidoDeCancelamento = z
  .object({ motivo: TextoPedido })
  .meta({ id: 'PedidoDeCancelamentoDaSolicitacao' });

export const PedidoDoLote = z
  .object({
    numeros: z
      .array(z.number().int().min(1), { error: 'Escolha as solicitações.' })
      .min(1, { error: 'Escolha as solicitações.' })
      .max(200, { error: 'Escolha até 200 solicitações.' }),
    situacao: z.enum(['em-atendimento', 'aguardando-entrega', 'concluida', 'cancelada'], {
      error: 'Escolha a situação.',
    }),
    /** No cancelamento. */
    motivo: TextoPedido,
  })
  .meta({ id: 'PedidoDoLoteDeSolicitacoes' });

export const RetornoDoLote = z
  .object({
    mudaram: z.number().int(),
    /** As que ficaram como estavam, com a recusa de cada uma. */
    recusadas: z.array(z.object({ numero: z.number().int(), mensagem: z.string() })),
    /** "3 solicitações mudaram. A 42 não: já está concluída." */
    texto: z.string(),
  })
  .meta({ id: 'RetornoDoLoteDeSolicitacoes' });

const ReferenciaDaEntrega = (erro: string) => z.uuid({ error: erro }).nullable().optional();

export const PedidoDeEntrega = z
  .object({
    entregas: z
      .array(
        z.discriminatedUnion(
          'origem',
          [
            z.object({
              item: z.uuid({ error: 'Item não encontrado.' }),
              origem: z.literal('estoque'),
              consumivel: ReferenciaDaEntrega('Consumível não encontrado.'),
              local: ReferenciaDaEntrega('Local não encontrado.'),
            }),
            z.object({
              item: z.uuid({ error: 'Item não encontrado.' }),
              origem: z.literal('fornecedor'),
              /** Sem ele, vale o fornecedor do pedido. */
              fornecedor: ReferenciaDaEntrega('Fornecedor não encontrado.'),
              consumivel: ReferenciaDaEntrega('Consumível não encontrado.'),
            }),
          ],
          { error: 'Escolha de onde vem o item.' },
        ),
      )
      .max(500),
  })
  .meta({ id: 'PedidoDeEntregaDaSolicitacao' });

/** As pendentes são as Abertas, as Em atendimento e as Aguardando entrega. */
const SITUACOES_DO_FILTRO = ['pendentes', 'todas', ...SITUACOES_DA_SOLICITACAO_NO_BANCO] as const;

export const FiltrosDasSolicitacoes = z.object({
  situacao: z
    .enum(SITUACOES_DO_FILTRO, { error: 'Escolha uma situação da lista.' })
    .default('pendentes'),
  tipo: z.enum(TIPOS_DE_SOLICITACAO_NO_BANCO, { error: 'Escolha um tipo da lista.' }).optional(),
  /** O local, com os de dentro, entre os locais da solicitação. */
  local: z.uuid({ error: 'Local não encontrado.' }).optional(),
  /** O número, quem pediu, a impressora ou o ativo e a OS do fornecedor. */
  busca: z.string().max(200).optional(),
  limite: Limite,
  cursor: Cursor.optional(),
});

export const ListaDeSolicitacoes = z
  .object({
    itens: z.array(Solicitacao),
    /** Quantas solicitações os filtros trazem, em todas as páginas. */
    total: z.number().int(),
    proximo: z.string().nullable(),
  })
  .meta({ id: 'ListaDeSolicitacoes' });

export const FiltrosDasImpressoras = z.object({
  busca: z.string().max(200).optional(),
  limite: z.coerce.number().int().min(1).max(50).default(20),
});

export const ImpressorasParaSolicitacao = z
  .object({
    itens: z.array(
      z.object({
        id: z.uuid(),
        rotulo: z.string(),
        patrimonio: z.string().nullable(),
        local: LocalDaSolicitacao.nullable(),
      }),
    ),
  })
  .meta({ id: 'ImpressorasParaSolicitacao' });

export const ImpressoraParaSolicitacao = z
  .object({
    ativo: AtivoDaSolicitacao,
    local: LocalDaSolicitacao.nullable(),
    /** O total de páginas de agora, que a solicitação congela ao registrar (ISO 8601). */
    contador: z.object({ paginas: z.number().int(), lidoEm: z.string() }).nullable(),
    /** As cinco cores, cada uma com os compatíveis do modelo e o sugerido, ou nenhum. */
    cores: z.array(
      z.object({
        cor: z.enum(CORES_DO_TONER_NO_BANCO),
        sugerido: z.uuid().nullable(),
        compativeis: z.array(
          z.object({
            id: z.uuid(),
            codigo: z.string(),
            nome: z.string().nullable(),
            /** O saldo nos locais em que a conta vê o estoque; nulo sem `estoque.ver`. */
            saldo: z.number().int().nullable(),
          }),
        ),
      }),
    ),
  })
  .meta({ id: 'ImpressoraParaSolicitacao' });

export const SolicitacoesDoAtivo = z
  .object({
    pendentes: z.array(Solicitacao),
    /** As 5 concluídas ou canceladas mais novas. */
    encerradas: z.array(Solicitacao),
    /** O tipo do ativo usa consumíveis: a nova solicitação dele é o toner; senão, o conserto. */
    usaConsumiveis: z.boolean(),
  })
  .meta({ id: 'SolicitacoesDoAtivo' });

export const ParametrosDoAtivoDaSolicitacao = z.object({
  id: z.uuid({ error: 'Ativo não encontrado.' }),
});
