// Os agentes do GLPI na web (spec inventario-pelo-agente; change inventario-pelo-agente-glpi): o
// endereço em vigor e os agentes, relidos a cada minuto com a aba visível, e a busca dos ativos
// para a ligação à mão.
import type { components } from '@grafite/api-client';
import { useQuery } from '@tanstack/react-query';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';

export type AgenteDoGlpi = components['schemas']['AgenteDoGlpi'];
export type CadastroDosAgentes = components['schemas']['CadastroDosAgentes'];

export const CHAVE_DOS_AGENTES = ['agentes'] as const;
export const CHAVE_DO_CADASTRO = [...CHAVE_DOS_AGENTES, 'cadastro'] as const;

export function useCadastroDosAgentes() {
  const api = useApi();
  return useQuery({
    queryKey: CHAVE_DO_CADASTRO,
    queryFn: () =>
      consultar(() => api.GET('/agentes/cadastro'), 'carregar a configuração do cadastro'),
  });
}

export function useAgentes() {
  const api = useApi();
  return useQuery({
    queryKey: CHAVE_DOS_AGENTES,
    queryFn: () => consultar(() => api.GET('/agentes'), 'carregar os agentes'),
    refetchInterval: 60_000,
  });
}

/** Os ativos pela busca, para ligar o agente; só com a busca pedida. */
export function useAtivosParaLigar(busca: string | null) {
  const api = useApi();
  return useQuery({
    // Fora da chave dos agentes: a ligação relê a lista, e não a busca.
    queryKey: ['ativos-para-ligar', busca],
    queryFn: () =>
      consultar(
        () => api.GET('/ativos', { params: { query: { busca: busca ?? '' } } }),
        'buscar os ativos',
      ),
    enabled: busca !== null,
  });
}
