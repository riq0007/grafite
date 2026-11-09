// As consultas do módulo Alertas (spec modulo-alertas; change p3a-regras-e-alertas, design,
// decisão 11): as listas dos alertas, paginadas pelo cursor, as regras e o silêncio de um ativo,
// com as chaves que o evento `alertas.mudaram` relê.
import type { components } from '@grafite/api-client';
import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import type { ClienteDaApi } from '../../api/cliente.ts';
import { consultar, paginar } from '../../api/consultas.ts';
import { useApi } from '../../api/useApi.tsx';

export type AlertaNaLista = components['schemas']['AlertaNaLista'];
export type RegraDeAlerta = components['schemas']['RegraDeAlerta'];
export type PedidoDeRegra = components['schemas']['PedidoDeRegraDeAlerta'];
export type SilencioDoAtivo = components['schemas']['SilencioDoAtivo'];
export type IndicadoresDosAlertas = components['schemas']['IndicadoresDosAlertas'];
export type AlvoDoIndicador = components['schemas']['AlvoDoIndicador'];

/** A chave das listas dos alertas, que o evento invalida. */
export const CHAVE_DOS_ALERTAS = ['alertas'] as const;
/** A chave da lista das regras. */
export const CHAVE_DAS_REGRAS = ['regras-de-alerta'] as const;
/** A chave de cada regra, com o id dela depois. */
export const CHAVE_DA_REGRA = ['regra-de-alerta'] as const;
/** A chave do silêncio de cada ativo, com o id dele depois. */
export const CHAVE_DO_SILENCIO = ['silencio-do-ativo'] as const;
/** A chave dos indicadores, sob a dos alertas: o evento que relê os alertas relê os indicadores. */
export const CHAVE_DOS_INDICADORES = [...CHAVE_DOS_ALERTAS, 'indicadores'] as const;

/** Quantos alertas cada página traz. */
export const POR_PAGINA = 50;

export interface FiltrosDosAlertas {
  situacao: 'abertos' | 'resolvidos';
  /** As severidades separadas por vírgula, como `critico,atencao`. */
  severidade?: string;
  regra?: string;
  ativo?: string;
  paraResolver?: boolean;
  ordem?: 'severidade' | 'ha' | 'ativo' | 'alerta';
  direcao?: 'asc' | 'desc';
}

/**
 * A consulta dos alertas que a conta vê, com os filtros, página a página: a lista e o resumo da
 * ficha do ativo (change ficha-em-cartoes) a fazem com a mesma chave.
 */
export function opcoesDosAlertas(filtros: FiltrosDosAlertas, api: ClienteDaApi) {
  const parametros = {
    situacao: filtros.situacao,
    severidade: filtros.severidade,
    regra: filtros.regra,
    ativo: filtros.ativo,
    paraResolver: filtros.paraResolver ? ('true' as const) : undefined,
    ordem: filtros.ordem,
    direcao: filtros.direcao,
  };
  return infiniteQueryOptions({
    queryKey: [...CHAVE_DOS_ALERTAS, parametros],
    ...paginar(
      (cursor) =>
        api.GET('/alertas', { params: { query: { ...parametros, cursor, limite: POR_PAGINA } } }),
      'carregar os alertas',
    ),
  });
}

/** Os alertas que a conta vê, com os filtros, página a página. */
export function useAlertas(filtros: FiltrosDosAlertas) {
  const api = useApi();
  return useInfiniteQuery(opcoesDosAlertas(filtros, api));
}

/** As regras de alerta da organização. */
export function useRegras() {
  const api = useApi();
  return useQuery({
    queryKey: CHAVE_DAS_REGRAS,
    queryFn: () => consultar(() => api.GET('/regras-de-alerta'), 'carregar as regras'),
  });
}

/** Uma regra de alerta. */
export function useRegra(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DA_REGRA, id],
    queryFn: () =>
      consultar(
        () => api.GET('/regras-de-alerta/{id}', { params: { path: { id } } }),
        'carregar a regra',
      ),
  });
}

/** O silêncio dos alertas de um ativo, com o que a conta pode fazer. */
export function useSilencio(ativoId: string) {
  const api = useApi();
  return useQuery(opcoesDoSilencio(ativoId, api));
}

/** A consulta do silêncio de um ativo, que também diz se a conta vê os alertas no local dele. */
export const opcoesDoSilencio = (ativoId: string, api: ClienteDaApi) =>
  queryOptions({
    queryKey: [...CHAVE_DO_SILENCIO, ativoId],
    queryFn: () =>
      consultar(
        () => api.GET('/ativos/{id}/silencio', { params: { path: { id: ativoId } } }),
        'carregar o silêncio do ativo',
      ),
  });

/** Os indicadores dos alertas que a conta vê, com as metas da organização (change p3d-indicadores). */
export function useIndicadores() {
  const api = useApi();
  return useQuery({
    queryKey: CHAVE_DOS_INDICADORES,
    queryFn: () => consultar(() => api.GET('/alertas/indicadores'), 'carregar os indicadores'),
  });
}

export type IndicadorCriado = components['schemas']['IndicadorCriado'];
export type PedidoDeIndicadorCriado = components['schemas']['PedidoDeIndicadorCriado'];

/** A chave dos indicadores criados, sob a dos indicadores: o evento das metas a relê. */
export const CHAVE_DOS_INDICADORES_CRIADOS = [...CHAVE_DOS_INDICADORES, 'criados'] as const;

/** Os indicadores criados pela organização (change regras-indicadores-e-tarefas). */
export function useIndicadoresCriados() {
  const api = useApi();
  return useQuery({
    queryKey: CHAVE_DOS_INDICADORES_CRIADOS,
    queryFn: () =>
      consultar(() => api.GET('/alertas/indicadores/criados'), 'carregar os indicadores criados'),
  });
}
