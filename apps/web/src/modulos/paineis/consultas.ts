// As consultas do módulo Painéis (spec modulo-paineis; change painel-de-dashboards): a lista dos
// painéis com a última verificação, sob a chave que o evento `paineis.mudaram` relê.
import type { components } from '@grafite/api-client';
import { useQuery } from '@tanstack/react-query';
import { consultar } from '../../api/consultas.ts';
import { useApi } from '../../api/useApi.tsx';

export type Painel = components['schemas']['Painel'];

/** A chave de tudo dos painéis. */
export const CHAVE_DOS_PAINEIS = ['paineis'] as const;

export function usePaineis() {
  const api = useApi();
  return useQuery({
    queryKey: CHAVE_DOS_PAINEIS,
    queryFn: () => consultar(() => api.GET('/paineis'), 'carregar os painéis'),
  });
}
