import type { components } from '@grafite/api-client';
import { type QueryClient, useQuery } from '@tanstack/react-query';
import { consultar } from '../../api/consultas.ts';
import { useApi } from '../../api/useApi.tsx';
import type { FiltrosDoCofre } from './filtros.ts';

export type ItemDoCofre = components['schemas']['ItemDoCofre'];
export type FichaDoSegredo = components['schemas']['FichaDoSegredo'];

/** A chave das listas do cofre nas consultas, que o evento `cofre.mudou` invalida. */
export const CHAVE_DOS_SEGREDOS = ['segredos'] as const;
/** A chave das fichas dos segredos, com o id de cada um depois. */
export const CHAVE_DO_SEGREDO = ['segredo'] as const;

/** O código da recusa à conta sem a verificação em dois passos. */
export const SEM_DOIS_PASSOS = 'cofre-sem-dois-passos';

/** Os segredos que a conta vê, com a busca e os filtros; sem situação, só os ativos. */
export function useSegredos(filtros: FiltrosDoCofre) {
  const api = useApi();
  const parametros = {
    busca: filtros.busca,
    tipo: filtros.tipo,
    classificacao: filtros.classificacao,
    situacao: filtros.situacao ?? 'ativos',
  } as const;
  return useQuery({
    queryKey: [...CHAVE_DOS_SEGREDOS, parametros],
    queryFn: () =>
      consultar(
        () => api.GET('/cofre/segredos', { params: { query: parametros } }),
        'carregar os segredos',
      ),
  });
}

/** A ficha de um segredo, sem o valor. */
export function useSegredo(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_SEGREDO, id],
    queryFn: () =>
      consultar(
        () => api.GET('/cofre/segredos/{id}', { params: { path: { id } } }),
        'carregar o segredo',
      ),
  });
}

export type TitularesDoCofre = components['schemas']['TitularesDoCofre'];

/** As contas, os grupos e os perfis ativos, para o acesso dos segredos. */
export function useTitulares() {
  const api = useApi();
  return useQuery({
    queryKey: ['cofre', 'titulares'],
    queryFn: () => consultar(() => api.GET('/cofre/titulares'), 'carregar os titulares'),
  });
}

/** As pessoas ativas, só pelo nome, para o vínculo dos segredos. */
export function usePessoasDoCofre() {
  const api = useApi();
  return useQuery({
    queryKey: ['cofre', 'pessoas'],
    queryFn: () => consultar(() => api.GET('/cofre/pessoas'), 'carregar as pessoas'),
  });
}

/** Põe na ficha o segredo que a API devolveu e relê as listas. */
export async function aplicarSegredo(consultas: QueryClient, ficha: FichaDoSegredo) {
  consultas.setQueryData([...CHAVE_DO_SEGREDO, ficha.id], ficha);
  await consultas.invalidateQueries({ queryKey: CHAVE_DOS_SEGREDOS });
}

/** A chave da liberação do cofre na sessão: até quando revelar e copiar dispensam o código. */
export const CHAVE_DA_LIBERACAO = ['cofre', 'liberacao'] as const;

/** Até quando o cofre está liberado nesta sessão, ou nulo. */
export function useLiberacao() {
  const api = useApi();
  return useQuery({
    queryKey: CHAVE_DA_LIBERACAO,
    queryFn: () => consultar(() => api.GET('/cofre/liberacao'), 'carregar a liberação do cofre'),
  });
}
