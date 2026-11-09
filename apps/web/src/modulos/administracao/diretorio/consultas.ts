// O diretório na web (spec diretorio-ad; change integracao-ad-ldap): o diretório gravado, com os
// mapeamentos e os grupos do Grafite, sob a chave que o evento `diretorio.mudou` relê, os logins do
// Cofre que servem de conta de serviço e as buscas no AD.
import type { components } from '@grafite/api-client';
import { useQuery } from '@tanstack/react-query';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';

export type EstadoDoDiretorio = components['schemas']['EstadoDoDiretorio'];
export type GrupoNoDiretorio = components['schemas']['GrupoNoDiretorio'];
export type UsuarioNoDiretorio = components['schemas']['UsuarioNoDiretorio'];

/** A chave do diretório nas consultas; as buscas no AD ficam debaixo dela. */
export const CHAVE_DO_DIRETORIO = ['diretorio'] as const;

export function useDiretorio() {
  const api = useApi();
  return useQuery({
    queryKey: CHAVE_DO_DIRETORIO,
    queryFn: () => consultar(() => api.GET('/diretorio'), 'carregar o diretório'),
  });
}

export function useLoginsDoDiretorio() {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_DIRETORIO, 'logins'],
    queryFn: () => consultar(() => api.GET('/diretorio/logins'), 'carregar os logins do Cofre'),
  });
}

/** Os grupos do AD pelo nome, só com o diretório gravado e a busca pedida. */
export function useGruposDoAd(busca: string, habilitada: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_DIRETORIO, 'grupos', busca],
    queryFn: () =>
      consultar(
        () => api.GET('/diretorio/grupos', { params: { query: { busca } } }),
        'buscar os grupos do AD',
      ),
    enabled: habilitada,
    retry: false,
  });
}

/** Os usuários do AD pelo usuário, pelo nome ou pelo e-mail, só com a busca pedida. */
export function useUsuariosDoAd(busca: string, habilitada: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_DIRETORIO, 'usuarios', busca],
    queryFn: () =>
      consultar(
        () => api.GET('/diretorio/usuarios', { params: { query: { busca } } }),
        'buscar os usuários do AD',
      ),
    enabled: habilitada,
    retry: false,
  });
}

/** O grupo do AD escolhido e os membros dele. */
export function useMembrosDoAd(grupo: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_DIRETORIO, 'membros', grupo],
    queryFn: () =>
      consultar(
        () => api.GET('/diretorio/membros', { params: { query: { grupo: grupo ?? '' } } }),
        'carregar os membros do grupo',
      ),
    enabled: grupo !== null,
    retry: false,
  });
}
