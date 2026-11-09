import type { components } from '@grafite/api-client';
import { type QueryClient, useQuery } from '@tanstack/react-query';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';

export type Coletor = components['schemas']['Coletor'];

/** A chave da lista dos coletores nas consultas, que o evento `coletores.mudaram` invalida. */
export const CHAVE_DOS_COLETORES = ['coletores'] as const;

/**
 * Os coletores da organização. A lista é relida a cada minuto com a aba visível, para o último
 * contato ficar no máximo 1 minuto atrás (design do P2a, decisão 5).
 */
export function useColetores() {
  const api = useApi();
  return useQuery({
    queryKey: CHAVE_DOS_COLETORES,
    queryFn: () => consultar(() => api.GET('/coletores'), 'carregar os coletores'),
    refetchInterval: 60_000,
  });
}

/** Põe na lista o coletor que a API devolveu e relê a lista. */
export async function aplicarColetor(consultas: QueryClient, coletor: Coletor) {
  consultas.setQueryData<{ coletores: Coletor[]; permite: { cadastrar: boolean } }>(
    CHAVE_DOS_COLETORES,
    (atual) =>
      atual && {
        ...atual,
        coletores: atual.coletores.map((outro) => (outro.id === coletor.id ? coletor : outro)),
      },
  );
  await consultas.invalidateQueries({ queryKey: CHAVE_DOS_COLETORES });
}
