// As consultas do estoque (spec estoque e modulo-operacao; change p4c-estoque, design, decisão 7):
// os saldos paginados, com a busca e os filtros, e as que os lançamentos e as fichas leem, todas
// debaixo da mesma chave, que o evento `estoque.mudou` invalida de uma vez.
import type { components } from '@grafite/api-client';
import type { TipoDeMovimento } from '@grafite/domain';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { paginar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import type { FiltrosDoEstoque } from './filtros.ts';

export type SaldoDoEstoque = components['schemas']['SaldoDoEstoque'];
export type MovimentoDoEstoque = components['schemas']['MovimentoDoEstoque'];
export type ConsumivelDoEstoque = components['schemas']['ConsumivelDoEstoque'];

/** O começo da chave de toda consulta do estoque, que o evento `estoque.mudou` relê. */
export const CHAVE_DO_ESTOQUE = ['estoque'] as const;
/** A chave das listas dos saldos. */
export const CHAVE_DOS_SALDOS = [...CHAVE_DO_ESTOQUE, 'saldos'] as const;

/** Quantos saldos cada página traz. */
const POR_PAGINA = 50;

/** Os saldos da busca e dos filtros, página a página. */
export function useSaldos(
  parametros: Pick<FiltrosDoEstoque, 'busca' | 'local' | 'consumivel' | 'tipo' | 'situacao'>,
) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: [...CHAVE_DOS_SALDOS, parametros],
    // A troca dos filtros mostra a lista de antes até a nova chegar, sem desmontar os filtros.
    placeholderData: keepPreviousData,
    ...paginar(
      (cursor) =>
        api.GET('/estoque/saldos', {
          params: { query: { ...parametros, cursor, limite: POR_PAGINA } },
        }),
      'carregar o estoque',
    ),
  });
}

/** A chave das listas das movimentações. */
export const CHAVE_DAS_MOVIMENTACOES = [...CHAVE_DO_ESTOQUE, 'movimentacoes'] as const;

/** As movimentações dos filtros, da mais nova para a mais antiga, página a página. */
export function useMovimentacoes(parametros: {
  de?: string;
  ate?: string;
  tipo?: TipoDeMovimento;
  local?: string;
  consumivel?: string;
  fornecedor?: string;
  ativo?: string;
}) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: [...CHAVE_DAS_MOVIMENTACOES, parametros],
    placeholderData: keepPreviousData,
    ...paginar(
      (cursor) =>
        api.GET('/estoque/movimentos', {
          params: { query: { ...parametros, cursor, limite: POR_PAGINA } },
        }),
      'carregar as movimentações',
    ),
  });
}
