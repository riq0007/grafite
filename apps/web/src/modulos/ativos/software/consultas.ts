// As consultas da distribuição de software na web (spec distribuicao-de-software; change
// distribuicao-de-software, design, decisão 6): a base, as distribuições, a ficha de uma, as do
// ativo e a busca das máquinas com o agente, todas debaixo da chave que o evento `software.mudou`
// invalida. Os passos do agente não publicam evento: a ficha se relê enquanto alguma máquina espera
// ou instala.
import type { components } from '@grafite/api-client';
import { useQuery } from '@tanstack/react-query';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';

export type PacoteDeSoftware = components['schemas']['PacoteDeSoftware'];
export type ResumoDaDistribuicao = components['schemas']['ResumoDaDistribuicao'];
export type FichaDaDistribuicao = components['schemas']['FichaDaDistribuicao'];
export type MaquinaDaDistribuicao = components['schemas']['MaquinaDaDistribuicao'];
export type MaquinaParaDistribuir = components['schemas']['MaquinaParaDistribuir'];
export type DistribuicaoDoAtivo = components['schemas']['DistribuicaoDoAtivo'];

/** A chave de tudo do software, que o evento `software.mudou` invalida. */
export const CHAVE_DO_SOFTWARE = ['software'] as const;

/** De quanto em quanto tempo a ficha se relê enquanto alguma máquina espera ou instala. */
export const RELEITURA_DA_FICHA = 5_000;

/** A máquina ainda vai mudar: espera o agente ou instala. */
export const emCurso = (maquina: Pick<MaquinaDaDistribuicao, 'situacao'>) =>
  maquina.situacao.chave === 'aguardando' || maquina.situacao.chave === 'em-andamento';

export function usePacotes() {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_SOFTWARE, 'pacotes'],
    queryFn: () => consultar(() => api.GET('/software/pacotes'), 'carregar a base de software'),
  });
}

export function useDistribuicoes() {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_SOFTWARE, 'distribuicoes'],
    queryFn: () => consultar(() => api.GET('/software/distribuicoes'), 'carregar as distribuições'),
    refetchInterval: 30_000,
  });
}

export function useDistribuicao(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_SOFTWARE, 'distribuicao', id],
    queryFn: () =>
      consultar(
        () => api.GET('/software/distribuicoes/{id}', { params: { path: { id } } }),
        'carregar a distribuição',
      ),
    refetchInterval: (consulta) =>
      consulta.state.data?.maquinasDaDistribuicao.some(emCurso) ? RELEITURA_DA_FICHA : false,
  });
}

export function useDistribuicoesDoAtivo(ativoId: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_SOFTWARE, 'ativo', ativoId],
    queryFn: () =>
      consultar(
        () => api.GET('/ativos/{id}/distribuicoes', { params: { path: { id: ativoId } } }),
        'carregar as distribuições do ativo',
      ),
  });
}

/** As máquinas com o agente ligado, pela busca, nos locais em que a conta distribui. */
export function useMaquinasParaDistribuir(busca: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_SOFTWARE, 'maquinas', busca],
    queryFn: () =>
      consultar(
        () => api.GET('/software/maquinas', { params: { query: busca ? { busca } : {} } }),
        'buscar as máquinas',
      ),
  });
}
