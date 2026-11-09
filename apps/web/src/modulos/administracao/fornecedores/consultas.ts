// As consultas dos fornecedores (spec fornecedores; change p4a-fornecedores, design, decisão 6): a
// lista paginada, com a busca e a situação, e a ficha, com as chaves que o evento
// `fornecedores.mudaram` invalida.
import type { components } from '@grafite/api-client';
import { type QueryClient, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { consultar, paginar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import type { SituacaoDoFiltro } from './filtros.ts';

export type Fornecedor = components['schemas']['Fornecedor'];
export type FichaDoFornecedor = components['schemas']['FichaDoFornecedor'];

/** A chave das listas dos fornecedores nas consultas. */
export const CHAVE_DOS_FORNECEDORES = ['fornecedores'] as const;
/** A chave das fichas dos fornecedores, com o id depois dela. */
export const CHAVE_DO_FORNECEDOR = ['fornecedor'] as const;

/** Quantos fornecedores cada página traz. */
const POR_PAGINA = 50;

/** Os fornecedores da busca e da situação, página a página. */
export function useFornecedores(parametros: { busca?: string; situacao: SituacaoDoFiltro }) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: [...CHAVE_DOS_FORNECEDORES, parametros],
    ...paginar(
      (cursor) =>
        api.GET('/fornecedores', {
          params: { query: { ...parametros, cursor, limite: POR_PAGINA } },
        }),
      'carregar os fornecedores',
    ),
  });
}

/** A ficha de um fornecedor, com o que a conta pode fazer nele. */
export function useFornecedor(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_FORNECEDOR, id],
    queryFn: () =>
      consultar(
        () => api.GET('/fornecedores/{id}', { params: { path: { id } } }),
        'carregar o fornecedor',
      ),
  });
}

/** Põe na ficha o fornecedor que a API devolveu e relê as listas. */
export async function aplicarFornecedor(consultas: QueryClient, ficha: FichaDoFornecedor) {
  consultas.setQueryData([...CHAVE_DO_FORNECEDOR, ficha.id], ficha);
  await consultas.invalidateQueries({ queryKey: CHAVE_DOS_FORNECEDORES });
}
