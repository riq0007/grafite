// O estoque na API (spec estoque; change p4c-estoque, design, decisões 5 e 6): os saldos e as
// movimentações com os nomes do consumível, dos locais, do fornecedor, do ativo e de quem lançou,
// como referência, e se a conta pode abrir a ficha de cada um, e os pedidos de cada lançamento. Os
// textos chegam como foram digitados: a conferência e a mensagem de cada campo são do domínio.
import {
  CORES_DE_CONSUMIVEL_NO_BANCO,
  MOTIVOS_DO_AJUSTE_NO_BANCO,
  TIPOS_DE_CONSUMIVEL_NO_BANCO,
  TIPOS_DE_MOVIMENTO_NO_BANCO,
} from '@grafite/db';
import { DIRECOES_DO_AJUSTE, SITUACOES_DO_SALDO } from '@grafite/domain';
import { z } from 'zod';
import { Cursor, Limite } from '../paginacao.ts';

const SITUACOES_DO_CADASTRO = ['ativo', 'inativo'] as const;

/** O consumível de um saldo ou de uma movimentação, e se a conta abre a ficha dele. */
export const ConsumivelDoEstoque = z
  .object({
    id: z.uuid(),
    /** O código do fabricante, como "CF258A". */
    codigo: z.string(),
    nome: z.string().nullable(),
    tipo: z.enum(TIPOS_DE_CONSUMIVEL_NO_BANCO),
    cor: z.enum(CORES_DE_CONSUMIVEL_NO_BANCO).nullable(),
    situacao: z.enum(SITUACOES_DO_CADASTRO),
    /** A conta vê os consumíveis. */
    abrir: z.boolean(),
  })
  .meta({ id: 'ConsumivelDoEstoque' });

/** O local pelo caminho, como "Jundiaí › Almoxarifado". */
export const LocalDoEstoque = z
  .object({ id: z.uuid(), caminho: z.string() })
  .meta({ id: 'LocalDoEstoque' });

export const MovimentoDoEstoque = z
  .object({
    id: z.uuid(),
    tipo: z.enum(TIPOS_DE_MOVIMENTO_NO_BANCO),
    consumivel: ConsumivelDoEstoque,
    quantidade: z.number().int(),
    origem: LocalDoEstoque.nullable(),
    destino: LocalDoEstoque.nullable(),
    /** Na entrada; `abrir` diz se a conta vê os fornecedores. */
    fornecedor: z.object({ id: z.uuid(), nome: z.string(), abrir: z.boolean() }).nullable(),
    notaFiscal: z.string().nullable(),
    /** Na saída; `abrir` diz se a conta vê o ativo, no local dele. */
    ativo: z
      .object({
        id: z.uuid(),
        rotulo: z.string(),
        patrimonio: z.string().nullable(),
        abrir: z.boolean(),
      })
      .nullable(),
    /** O total de páginas do ativo lido na saída, com o momento da leitura (ISO 8601). */
    contador: z.object({ paginas: z.number().int(), lidoEm: z.string() }).nullable(),
    /** No ajuste. */
    motivo: z.enum(MOTIVOS_DO_AJUSTE_NO_BANCO).nullable(),
    observacao: z.string().nullable(),
    lancadoPor: z.object({ id: z.uuid(), nome: z.string() }),
    /** ISO 8601. */
    momento: z.string(),
  })
  .meta({ id: 'MovimentoDoEstoque' });

export const SaldoDoEstoque = z
  .object({
    id: z.uuid(),
    consumivel: ConsumivelDoEstoque,
    local: LocalDoEstoque,
    saldo: z.number().int(),
    /** 0 é sem mínimo. */
    minimo: z.number().int(),
    situacao: z.enum(SITUACOES_DO_SALDO),
    /** Desde quando o consumível está abaixo do mínimo no local (ISO 8601). */
    abaixoDesde: z.string().nullable(),
    permite: z.object({ movimentar: z.boolean() }),
  })
  .meta({ id: 'SaldoDoEstoque' });

export const LancamentoDoEstoque = z
  .object({
    movimento: MovimentoDoEstoque,
    /** Os saldos que o lançamento mudou, primeiro o de onde saiu. */
    saldos: z.array(SaldoDoEstoque),
  })
  .meta({ id: 'LancamentoDoEstoque' });

const ConsumivelPedido = z.uuid({ error: 'Consumível não encontrado.' }).nullable().optional();
const LocalPedido = z.uuid({ error: 'Local não encontrado.' }).nullable().optional();
const QuantidadePedida = z
  .number({ error: 'Use um número inteiro de 1 a 100.000.' })
  .nullable()
  .optional();
const TextoPedido = z.string().max(5000).nullable().optional();

export const PedidoDeEntrada = z
  .object({
    consumivel: ConsumivelPedido,
    quantidade: QuantidadePedida,
    destino: LocalPedido,
    fornecedor: z.uuid({ error: 'Fornecedor não encontrado.' }).nullable().optional(),
    notaFiscal: TextoPedido,
    observacao: TextoPedido,
  })
  .meta({ id: 'PedidoDeEntradaNoEstoque' });

export const PedidoDeSaida = z
  .object({
    consumivel: ConsumivelPedido,
    quantidade: QuantidadePedida,
    origem: LocalPedido,
    ativo: z.uuid({ error: 'Ativo não encontrado.' }).nullable().optional(),
    observacao: TextoPedido,
  })
  .meta({ id: 'PedidoDeSaidaDoEstoque' });

export const PedidoDeTransferencia = z
  .object({
    consumivel: ConsumivelPedido,
    quantidade: QuantidadePedida,
    origem: LocalPedido,
    destino: LocalPedido,
    observacao: TextoPedido,
  })
  .meta({ id: 'PedidoDeTransferenciaNoEstoque' });

export const PedidoDeAjuste = z
  .object({
    consumivel: ConsumivelPedido,
    quantidade: QuantidadePedida,
    local: LocalPedido,
    direcao: z
      .enum(DIRECOES_DO_AJUSTE, { error: 'Escolha se o ajuste acrescenta ou retira.' })
      .nullable()
      .optional(),
    motivo: z
      .enum(MOTIVOS_DO_AJUSTE_NO_BANCO, { error: 'Escolha o motivo.' })
      .nullable()
      .optional(),
    observacao: TextoPedido,
  })
  .meta({ id: 'PedidoDeAjusteDoEstoque' });

export const PedidoDoMinimo = z
  .object({
    /** 0 é sem mínimo. */
    minimo: z.number({ error: 'Use um número inteiro de 0 a 100.000.' }).nullable(),
  })
  .meta({ id: 'PedidoDoMinimoDoEstoque' });

export const ParametrosDoMinimo = z.object({
  consumivelId: z.uuid({ error: 'Consumível não encontrado.' }),
  localId: z.uuid({ error: 'Local não encontrado.' }),
});

/** A situação da tela: "Abaixo do mínimo" traz também os sem estoque com o mínimo. */
export const SITUACOES_DO_FILTRO = ['abaixo-do-minimo', 'sem-estoque', 'em-estoque'] as const;

export const FiltrosDosSaldos = z.object({
  /** O código, sem diferenciar maiúsculas, espaços e hífens, ou o nome, sem acento. */
  busca: z.string().max(120).optional(),
  consumivel: z.uuid({ error: 'Consumível não encontrado.' }).optional(),
  /** O local, com os de dentro. */
  local: z.uuid({ error: 'Local não encontrado.' }).optional(),
  tipo: z.enum(TIPOS_DE_CONSUMIVEL_NO_BANCO, { error: 'Escolha o tipo do consumível.' }).optional(),
  situacao: z.enum(SITUACOES_DO_FILTRO, { error: 'Escolha uma situação da lista.' }).optional(),
  limite: Limite,
  cursor: Cursor.optional(),
});

export const ListaDeSaldos = z
  .object({
    itens: z.array(SaldoDoEstoque),
    /** Quantos saldos a busca e os filtros trazem, em todas as páginas. */
    total: z.number().int(),
    proximo: z.string().nullable(),
    /** A conta movimenta o estoque em algum local. */
    permite: z.object({ movimentar: z.boolean() }),
  })
  .meta({ id: 'ListaDeSaldosDoEstoque' });

export const FiltrosDasMovimentacoes = z.object({
  /** O começo do período, incluído. */
  de: z.iso.datetime({ error: 'Informe o começo do período como data e hora.' }).optional(),
  /** O fim do período, incluído. */
  ate: z.iso.datetime({ error: 'Informe o fim do período como data e hora.' }).optional(),
  tipo: z.enum(TIPOS_DE_MOVIMENTO_NO_BANCO, { error: 'Escolha um tipo da lista.' }).optional(),
  /** O local, com os de dentro, na origem ou no destino. */
  local: z.uuid({ error: 'Local não encontrado.' }).optional(),
  consumivel: z.uuid({ error: 'Consumível não encontrado.' }).optional(),
  fornecedor: z.uuid({ error: 'Fornecedor não encontrado.' }).optional(),
  ativo: z.uuid({ error: 'Ativo não encontrado.' }).optional(),
  limite: Limite,
  cursor: Cursor.optional(),
});

export const ListaDeMovimentacoes = z
  .object({
    itens: z.array(MovimentoDoEstoque),
    /** Quantas movimentações os filtros trazem, em todas as páginas. */
    total: z.number().int(),
    proximo: z.string().nullable(),
  })
  .meta({ id: 'ListaDeMovimentacoesDoEstoque' });

export const AbaixoDoMinimo = z
  .object({
    /** Até 200, desde quando cada um ficou abaixo do mínimo, os mais antigos primeiro. */
    itens: z.array(SaldoDoEstoque),
  })
  .meta({ id: 'EstoqueAbaixoDoMinimo' });

export const FiltrosDosAtivosParaSaida = z.object({
  /** O consumível da saída, para sugerir os ativos de modelo compatível. */
  consumivel: z.uuid({ error: 'Consumível não encontrado.' }).optional(),
  /** As palavras do patrimônio, do nome ou do modelo. */
  busca: z.string().max(120).optional(),
  limite: Limite,
});

export const AtivosParaSaida = z
  .object({
    /** Os ativos ativos que a conta vê, primeiro os sugeridos, pelo patrimônio. */
    ativos: z.array(
      z.object({
        id: z.uuid(),
        rotulo: z.string(),
        patrimonio: z.string().nullable(),
        local: LocalDoEstoque.nullable(),
        /** O modelo do ativo é compatível com o consumível. */
        sugerido: z.boolean(),
      }),
    ),
  })
  .meta({ id: 'AtivosParaSaidaDoEstoque' });

export const EstoqueDoConsumivel = z
  .object({
    /** Os saldos nos locais que a conta vê, pelo caminho. */
    saldos: z.array(SaldoDoEstoque),
    /** A soma dos saldos. */
    soma: z.number().int(),
    /** As 10 movimentações mais novas, nesses locais. */
    movimentos: z.array(MovimentoDoEstoque),
    /** A conta movimenta o estoque em algum local. */
    permite: z.object({ movimentar: z.boolean() }),
  })
  .meta({ id: 'EstoqueDoConsumivel' });

export const EntradasDoFornecedor = z
  .object({
    /** Quantas entradas dele houve nos locais que a conta vê. */
    entradas: z.number().int(),
    /** O momento da última (ISO 8601). */
    ultima: z.string().nullable(),
  })
  .meta({ id: 'EntradasDoFornecedor' });
