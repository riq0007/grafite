// As consultas das ordens de serviço (spec modulo-operacao, "Tela das ordens de serviço" e
// "Operação atualizada pelos eventos"; change p4e-ordens-de-servico, design, decisão 8): a lista
// paginada, com os filtros e a busca, e a que diz se há alguma, todas debaixo da mesma chave, que o
// evento `ordens.mudaram` invalida de uma vez.
import type { components } from '@grafite/api-client';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { consultar, paginar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import type { SituacaoDoFiltroDasOrdens } from './filtros.ts';

export type OrdemDeServico = components['schemas']['OrdemDeServico'];

/** O começo da chave de toda consulta das OS, que o evento `ordens.mudaram` relê. */
export const CHAVE_DAS_ORDENS = ['ordens'] as const;
/** A chave das listas das OS. */
export const CHAVE_DAS_LISTAS_DAS_ORDENS = [...CHAVE_DAS_ORDENS, 'listas'] as const;

/** Quantas OS cada página traz. */
const POR_PAGINA = 50;

/** As OS dos filtros, das mais novas para as mais antigas, página a página. */
export function useOrdens(parametros: {
  busca?: string;
  /** Sem ela, a API traz as em aberto. */
  situacao?: SituacaoDoFiltroDasOrdens;
  local?: string;
}) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: [...CHAVE_DAS_LISTAS_DAS_ORDENS, parametros],
    // A troca dos filtros mostra a lista de antes até a nova chegar, sem desmontar os filtros.
    placeholderData: keepPreviousData,
    ...paginar(
      (cursor) =>
        api.GET('/ordens', { params: { query: { ...parametros, cursor, limite: POR_PAGINA } } }),
      'carregar as ordens de serviço',
    ),
  });
}

/** A ficha da OS pelo número; sem um número, nada é pedido. */
export function useOrdem(numero: number | null) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DAS_ORDENS, 'ficha', numero],
    enabled: numero !== null,
    queryFn: () =>
      consultar(
        () => api.GET('/ordens/{numero}', { params: { path: { numero: numero ?? 0 } } }),
        'carregar a ordem de serviço',
      ),
  });
}

/**
 * Se a conta vê alguma OS, de qualquer situação: com as em aberto vazias, diz se não há nenhuma
 * ainda ou só nenhuma em aberto. Só pede quando `ativa`.
 */
export function useAlgumaOrdem(ativa: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DAS_ORDENS, 'alguma'],
    enabled: ativa,
    queryFn: async () => {
      const pagina = await consultar(
        () => api.GET('/ordens', { params: { query: { situacao: 'todas', limite: 1 } } }),
        'carregar as ordens de serviço',
      );
      return pagina.total > 0;
    },
  });
}
