// As consultas das solicitações (spec modulo-operacao, "Tela das solicitações" e "Operação
// atualizada pelos eventos"; change p4d-solicitacoes, design, decisão 8): a lista paginada, com os
// filtros e a busca, e a que diz se há alguma, todas debaixo da mesma chave, que o evento
// `solicitacoes.mudaram` invalida de uma vez.
import type { components } from '@grafite/api-client';
import type { SituacaoDaSolicitacao, TipoDeSolicitacao } from '@grafite/domain';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { consultar, paginar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';

export type Solicitacao = components['schemas']['Solicitacao'];

/** O começo da chave de toda consulta das solicitações, que o evento `solicitacoes.mudaram` relê. */
export const CHAVE_DAS_SOLICITACOES = ['solicitacoes'] as const;
/** A chave das listas das solicitações. */
export const CHAVE_DAS_LISTAS = [...CHAVE_DAS_SOLICITACOES, 'listas'] as const;

/** Quantas solicitações cada página traz. */
const POR_PAGINA = 50;

/** As solicitações dos filtros, das mais novas para as mais antigas, página a página. */
export function useSolicitacoes(parametros: {
  busca?: string;
  /** Sem ela, a API traz as pendentes. */
  situacao?: 'todas' | SituacaoDaSolicitacao;
  tipo?: TipoDeSolicitacao;
  local?: string;
}) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: [...CHAVE_DAS_LISTAS, parametros],
    // A troca dos filtros mostra a lista de antes até a nova chegar, sem desmontar os filtros.
    placeholderData: keepPreviousData,
    ...paginar(
      (cursor) =>
        api.GET('/solicitacoes', {
          params: { query: { ...parametros, cursor, limite: POR_PAGINA } },
        }),
      'carregar as solicitações',
    ),
  });
}

/** A ficha da solicitação pelo número; sem um número, nada é pedido. */
export function useSolicitacao(numero: number | null) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DAS_SOLICITACOES, 'ficha', numero],
    enabled: numero !== null,
    queryFn: () =>
      consultar(
        () => api.GET('/solicitacoes/{numero}', { params: { path: { numero: numero ?? 0 } } }),
        'carregar a solicitação',
      ),
  });
}

/**
 * Se a conta vê alguma solicitação, de qualquer situação: com as pendentes vazias, diz se não há
 * nenhuma ainda ou só nenhuma pendente. Só pede quando `ativa`.
 */
export function useAlgumaSolicitacao(ativa: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DAS_SOLICITACOES, 'alguma'],
    enabled: ativa,
    queryFn: async () => {
      const pagina = await consultar(
        () =>
          api.GET('/solicitacoes', {
            params: { query: { situacao: 'todas', limite: 1 } },
          }),
        'carregar as solicitações',
      );
      return pagina.total > 0;
    },
  });
}
