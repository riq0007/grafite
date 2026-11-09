// As consultas dos consumíveis (spec consumiveis e modulo-operacao; change p4b-consumiveis, design,
// decisões 6 e 7): a lista paginada, com a busca e os filtros, a ficha e os modelos para escolher,
// com as chaves que os eventos invalidam.
import type { components } from '@grafite/api-client';
import { type QueryClient, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { consultar, paginar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import type { FiltrosDosConsumiveis, SituacaoDoFiltro } from './filtros.ts';

export type ConsumivelNaLista = components['schemas']['ConsumivelNaLista'];
export type FichaDoConsumivel = components['schemas']['FichaDoConsumivel'];
export type FornecedorDoConsumivel = components['schemas']['FornecedorDoConsumivel'];
export type ModeloDoConsumivel = components['schemas']['ModeloDoConsumivel'];
export type PedidoDoConsumivel = components['schemas']['PedidoDeConsumivel'];

/** A chave das listas dos consumíveis nas consultas. */
export const CHAVE_DOS_CONSUMIVEIS = ['consumiveis'] as const;
/** A chave das fichas dos consumíveis, com o id depois dela. */
export const CHAVE_DO_CONSUMIVEL = ['consumivel'] as const;
/** A chave dos modelos para escolher, que a mudança do catálogo invalida. */
export const CHAVE_DOS_MODELOS_PARA_ESCOLHER = ['consumiveis-modelos-para-escolher'] as const;

/** Quantos consumíveis cada página traz. */
const POR_PAGINA = 50;

/** Os consumíveis da busca e dos filtros, página a página. */
export function useConsumiveis(
  parametros: Omit<FiltrosDosConsumiveis, 'situacao'> & { situacao: SituacaoDoFiltro },
) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: [...CHAVE_DOS_CONSUMIVEIS, parametros],
    ...paginar(
      (cursor) =>
        api.GET('/consumiveis', {
          params: { query: { ...parametros, cursor, limite: POR_PAGINA } },
        }),
      'carregar os consumíveis',
    ),
  });
}

/** A ficha de um consumível, com os fornecedores, os modelos e o que a conta pode fazer nele. */
export function useConsumivel(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_CONSUMIVEL, id],
    queryFn: () =>
      consultar(
        () => api.GET('/consumiveis/{id}', { params: { path: { id } } }),
        'carregar o consumível',
      ),
  });
}

/** Os modelos ativos dos tipos com os consumíveis compatíveis, para escolher. */
export function useModelosParaOsConsumiveis() {
  const api = useApi();
  return useQuery({
    queryKey: CHAVE_DOS_MODELOS_PARA_ESCOLHER,
    queryFn: () => consultar(() => api.GET('/consumiveis/modelos'), 'carregar os modelos'),
  });
}

/** Põe na ficha o consumível que a API devolveu e relê as listas. */
export async function aplicarConsumivel(consultas: QueryClient, ficha: FichaDoConsumivel) {
  consultas.setQueryData([...CHAVE_DO_CONSUMIVEL, ficha.id], ficha);
  await consultas.invalidateQueries({ queryKey: CHAVE_DOS_CONSUMIVEIS });
}
