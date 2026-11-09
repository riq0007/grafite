// As consultas do catálogo de ativos (design do P1a, decisão 9): os tipos, os campos e as
// capacidades vêm inteiros, de uma vez; os modelos, em páginas. O evento `catalogo.mudou` relê
// todas.
import type { components } from '@grafite/api-client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ClienteDaApi } from '../../api/cliente.ts';
import { consultar } from '../../api/consultas.ts';
import { useApi } from '../../api/useApi.tsx';

export type TipoDeAtivo = components['schemas']['TipoDeAtivo'];
export type CampoDaOrganizacao = components['schemas']['Campo'];
export type Capacidade = components['schemas']['Capacidade'];
export type Modelo = components['schemas']['Modelo'];
export type AtivoNaLista = components['schemas']['AtivoNaLista'];
export type FichaDoAtivo = components['schemas']['FichaDoAtivo'];

export const CHAVE_DOS_TIPOS = ['tipos-de-ativo'] as const;
export const CHAVE_DOS_CAMPOS = ['campos'] as const;
export const CHAVE_DAS_CAPACIDADES = ['capacidades'] as const;
/** As listas de modelos, por filtro, e as sugestões de fabricante. */
export const CHAVE_DOS_MODELOS = ['modelos'] as const;
export const chaveDoModelo = (id: string) => ['modelo', id] as const;

/** A consulta dos tipos, para as telas e para o menu do dock. */
export const consultaDosTipos = (api: ClienteDaApi) => ({
  queryKey: CHAVE_DOS_TIPOS,
  queryFn: () => consultar(() => api.GET('/tipos-de-ativo'), 'carregar os tipos de ativo'),
});

export function useTipos() {
  const api = useApi();
  return useQuery(consultaDosTipos(api));
}

export function useCampos() {
  const api = useApi();
  return useQuery({
    queryKey: CHAVE_DOS_CAMPOS,
    queryFn: () => consultar(() => api.GET('/campos'), 'carregar os campos'),
  });
}

export function useCapacidades() {
  const api = useApi();
  return useQuery({
    queryKey: CHAVE_DAS_CAPACIDADES,
    queryFn: () => consultar(() => api.GET('/capacidades'), 'carregar as capacidades'),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export const CHAVE_DAS_COMUNIDADES_SNMP = ['comunidades-snmp'] as const;

/** As comunidades SNMP ativas do cofre, pelo nome, que a ficha do tipo oferece a quem a edita. */
export function useComunidadesSnmp(ativa: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: CHAVE_DAS_COMUNIDADES_SNMP,
    queryFn: () =>
      consultar(() => api.GET('/catalogo/comunidades-snmp'), 'carregar as comunidades SNMP'),
    enabled: ativa,
  });
}

export const CHAVE_DOS_LOGINS_DO_CONTROL_ID = ['logins-do-control-id'] as const;

/** Os logins do cofre que servem para a sondagem do Control iD, pelo nome, para quem edita o tipo. */
export function useLoginsDoControlId(ativa: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: CHAVE_DOS_LOGINS_DO_CONTROL_ID,
    queryFn: () =>
      consultar(
        () => api.GET('/catalogo/logins-do-control-id'),
        'carregar os logins do Control iD',
      ),
    enabled: ativa,
  });
}

export function useModelo(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: chaveDoModelo(id),
    queryFn: () =>
      consultar(() => api.GET('/modelos/{id}', { params: { path: { id } } }), 'carregar o modelo'),
  });
}

/** Os fabricantes já usados que contêm o texto digitado, pela grafia que vale. */
export function useFabricantes(texto: string, tipoId: string | null, ativa = true) {
  const api = useApi();
  const busca = texto.trim();
  return useQuery({
    queryKey: [...CHAVE_DOS_MODELOS, 'fabricantes', busca, tipoId ?? ''],
    queryFn: () =>
      consultar(
        () =>
          api.GET('/modelos/fabricantes', {
            // Com o tipo, os fabricantes já usados nele vêm primeiro.
            params: { query: { ...(busca && { busca }), ...(tipoId && { tipo: tipoId }) } },
          }),
        'carregar os fabricantes',
      ),
    placeholderData: keepPreviousData,
    enabled: ativa,
  });
}

/** As listas dos ativos, por filtro. */
export const CHAVE_DOS_ATIVOS = ['ativos'] as const;
export const chaveDoAtivo = (id: string) => ['ativo', id] as const;
/** Debaixo da ficha: invalidar a ficha relê o histórico junto. */
export const chaveDoHistorico = (id: string) => [...chaveDoAtivo(id), 'historico'] as const;
/** Os ligados de cada ativo: a mudança de um ativo muda as listas em que ele aparece. */
export const CHAVE_DOS_LIGADOS = ['ligados'] as const;
export const chaveDosLigados = (id: string) => [...CHAVE_DOS_LIGADOS, id] as const;

export type LigadosDoAtivo = components['schemas']['LigadosDoAtivo'];

export function useAtivo(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: chaveDoAtivo(id),
    queryFn: () =>
      consultar(() => api.GET('/ativos/{id}', { params: { path: { id } } }), 'carregar o ativo'),
    // Com a disponibilidade, os suprimentos ou a saúde do Control iD, a ficha é relida a cada minuto
    // com a aba visível (design do P2a, do P2b, decisão 10, e do P2c, decisão 8).
    refetchInterval: ({ state: { data } }) =>
      data?.disponibilidade || data?.painelDeSuprimentos || data?.controlId ? 60_000 : false,
  });
}

/** O lado de lá dos campos e as ligações livres do ativo (spec ligacoes-de-ativos). */
export function useLigados(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: chaveDosLigados(id),
    queryFn: () =>
      consultar(
        () => api.GET('/ativos/{id}/ligados', { params: { path: { id } } }),
        'carregar os ativos ligados',
      ),
  });
}

/** Quantos ativos estão ligados: os que apontam pelos campos, além dos 100 de cada grupo, e os livres. */
export const quantosLigados = (ligados: LigadosDoAtivo) =>
  ligados.porCampos.reduce((soma, grupo) => soma + grupo.total, 0) + ligados.livres.length;
