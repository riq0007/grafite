// As consultas dos indicadores da operação (spec modulo-operacao, "Operação atualizada pelos
// eventos"; change p4f-indicadores-da-operacao, design, decisão 10): os indicadores que a conta vê,
// com as metas, sob a chave que os eventos das OS, do estoque, dos consumíveis e das metas relêem.
import type { components } from '@grafite/api-client';
import { useQuery } from '@tanstack/react-query';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';

export type IndicadoresDaOperacao = components['schemas']['IndicadoresDaOperacao'];

/** A chave dos indicadores da operação, que os eventos relêem. */
export const CHAVE_DOS_INDICADORES_DA_OPERACAO = ['indicadores-da-operacao'] as const;

/** Os indicadores da operação que a conta vê, nos últimos 30 dias. */
export function useIndicadoresDaOperacao() {
  const api = useApi();
  return useQuery({
    queryKey: CHAVE_DOS_INDICADORES_DA_OPERACAO,
    queryFn: () => consultar(() => api.GET('/operacao/indicadores'), 'carregar os indicadores'),
  });
}
