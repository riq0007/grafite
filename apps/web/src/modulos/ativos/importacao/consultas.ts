// As consultas das importações (spec importacao-de-ativos; design do P1e, decisão 9): a lista da
// conta, cada importação, a prévia do rascunho, por ação, e as linhas com erro do resultado, todas
// debaixo da mesma chave, que o evento `importacoes.mudaram` relê.
import type { components } from '@grafite/api-client';
import type { AcaoDaLinha } from '@grafite/domain';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { consultar, paginar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';

export type Importacao = components['schemas']['Importacao'];
export type ImportacaoNaLista = components['schemas']['ImportacaoNaLista'];
export type PreviaDaImportacao = components['schemas']['PreviaDaImportacao'];
export type LinhaDaPreviaDaApi = components['schemas']['LinhaDaPrevia'];

export const CHAVE_DAS_IMPORTACOES = ['importacoes'] as const;
export const chaveDaImportacao = (id: string) => [...CHAVE_DAS_IMPORTACOES, id] as const;

const POR_PAGINA = 50;

export function useImportacoes() {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: [...CHAVE_DAS_IMPORTACOES, 'lista'],
    ...paginar(
      (cursor) =>
        api.GET('/ativos/importacoes', { params: { query: { cursor, limite: POR_PAGINA } } }),
      'carregar as importações',
    ),
  });
}

export function useImportacao(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: chaveDaImportacao(id),
    queryFn: () =>
      consultar(
        () => api.GET('/ativos/importacoes/{id}', { params: { path: { id } } }),
        'carregar a importação',
      ),
  });
}

/** A prévia do rascunho, por páginas, com o filtro por ação; os totais vêm em cada página. */
export function usePrevia(id: string, acao: AcaoDaLinha | null, ativa = true) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: [...chaveDaImportacao(id), 'previa', acao],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      consultar(
        () =>
          api.GET('/ativos/importacoes/{id}/previa', {
            params: {
              path: { id },
              query: { cursor: pageParam, limite: POR_PAGINA, ...(acao ? { acao } : {}) },
            },
          }),
        'carregar a prévia',
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultima: PreviaDaImportacao) => ultima.proximo,
    enabled: ativa,
  });
}

/** As linhas que a aplicação não gravou, por páginas. */
export function useErrosDaImportacao(id: string, ativa = true) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: [...chaveDaImportacao(id), 'erros'],
    ...paginar(
      (cursor) =>
        api.GET('/ativos/importacoes/{id}/erros', {
          params: { path: { id }, query: { cursor, limite: POR_PAGINA } },
        }),
      'carregar as linhas com erro',
    ),
    enabled: ativa,
  });
}
