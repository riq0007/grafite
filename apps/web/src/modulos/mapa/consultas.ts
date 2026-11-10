// As consultas do mapa da planta na web (spec mapa-da-planta; change p7-mapa-da-planta, design,
// decisão 6): as plantas, o modelo navegável, que muda pouco, e os marcadores, que o evento
// `mapa.mudou` e os da coleta e dos alertas relêem.
import type { components } from '@grafite/api-client';
import { useQuery } from '@tanstack/react-query';
import { consultar } from '../../api/consultas.ts';
import { useApi } from '../../api/useApi.tsx';

export type PlantaDoMapa = components['schemas']['PlantaDoMapa'];
export type ModeloDaPlanta = components['schemas']['ModeloDaPlanta'];
export type SubstituicaoDoDesenho = components['schemas']['SubstituicaoDoDesenho'];
export type MarcadorDoMapa = components['schemas']['MarcadorDoMapa'];

/** A chave de tudo do mapa. */
export const CHAVE_DO_MAPA = ['mapa'] as const;

/** A chave dos marcadores, que os eventos dos ativos, da disponibilidade e dos alertas relêem. */
export const CHAVE_DOS_MARCADORES = [...CHAVE_DO_MAPA, 'marcadores'] as const;

export function usePlantas() {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_MAPA, 'plantas'],
    queryFn: () => consultar(() => api.GET('/mapa/plantas'), 'carregar as plantas'),
  });
}

export function useModeloDaPlanta(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_MAPA, 'modelo', id],
    queryFn: () =>
      consultar(
        () => api.GET('/mapa/plantas/{id}/modelo', { params: { path: { id } } }),
        'carregar a planta',
      ),
    staleTime: 60 * 60_000,
  });
}

export function useMarcadores(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DOS_MARCADORES, id],
    queryFn: () =>
      consultar(
        () => api.GET('/mapa/plantas/{id}/marcadores', { params: { path: { id } } }),
        'carregar os marcadores',
      ),
    refetchInterval: 60_000,
  });
}
