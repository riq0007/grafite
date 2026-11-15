// As consultas da distribuição de software na web (spec distribuicao-de-software; change
// distribuicao-de-software, design, decisão 6): a base, a ficha do pacote, as categorias, as
// distribuições, a ficha de uma, o software da máquina e a busca das máquinas com o agente, todas debaixo da
// chave que o evento `software.mudou` invalida. Os passos do agente não publicam evento: a ficha se
// relê enquanto alguma máquina espera ou instala.
import type { components } from '@grafite/api-client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';

export type PacoteDeSoftware = components['schemas']['PacoteDeSoftware'];
export type PacoteNaBase = components['schemas']['PacoteNaBase'];
export type FichaDoPacote = components['schemas']['FichaDoPacote'];
export type DistribuicaoDoPacote = components['schemas']['DistribuicaoDoPacote'];
export type CategoriaDeSoftware = components['schemas']['CategoriaDeSoftware'];
export type ResumoDaDistribuicao = components['schemas']['ResumoDaDistribuicao'];
export type FichaDaDistribuicao = components['schemas']['FichaDaDistribuicao'];
export type MaquinaDaDistribuicao = components['schemas']['MaquinaDaDistribuicao'];
/** A outra distribuição em que a máquina já aguarda ou instala o mesmo pacote (decisões 10 e 11). */
export type OutraDistribuicao = components['schemas']['OutraDistribuicao'];
export type MaquinaParaDistribuir = components['schemas']['MaquinaParaDistribuir'];
export type SoftwareDaMaquina = components['schemas']['SoftwareDaMaquina'];
export type MandadoPeloGrafite = NonNullable<SoftwareDaMaquina['distribuir']>['mandados'][number];
export type InstaladoNaMaquina = SoftwareDaMaquina['instalados'][number];

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

/** A ficha do pacote: as contas frente ao inventário, as versões e as distribuições. */
export function usePacote(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_SOFTWARE, 'pacote', id],
    queryFn: () =>
      consultar(
        () => api.GET('/software/pacotes/{id}', { params: { path: { id } } }),
        'carregar o pacote',
      ),
  });
}

/** As categorias da base, na ordem das abas. */
export function useCategorias() {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_SOFTWARE, 'categorias'],
    queryFn: () =>
      consultar(() => api.GET('/software/categorias'), 'carregar as categorias da base'),
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

/**
 * O software da máquina (change software-por-pacote, design, decisão 13): os instalados e, para
 * quem distribui no local dela, a base, a origem, os mandados e os pacotes para instalar. A ficha
 * também a lê, para o "Sem contato" do cabeçalho.
 */
export function useSoftwareDaMaquina(ativoId: string, ativa = true) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_SOFTWARE, 'maquina', ativoId],
    enabled: ativa,
    queryFn: () =>
      consultar(
        () => api.GET('/ativos/{id}/software', { params: { path: { id: ativoId } } }),
        'carregar o software da máquina',
      ),
  });
}

/** O que o passo Máquinas do assistente escolheu (change software-por-pacote, design, decisão 10). */
export type AlvoDoAssistente = components['schemas']['AlvoDaDistribuicao'];
export type PreviaDaDistribuicao = components['schemas']['PreviaDaDistribuicao'];
export type AlvosDaDistribuicao = components['schemas']['AlvosDaDistribuicao'];
export type MaquinaDaPrevia = components['schemas']['MaquinaDaPrevia'];

/** O alvo sem nada escolhido. */
export const ALVO_VAZIO: AlvoDoAssistente = {
  locais: [],
  visoes: [],
  ativoIds: [],
  lista: '',
  fora: [],
};

/** O alvo escolheu alguma coisa: um local, uma visão, uma máquina ou a lista colada. */
export const alvoEscolhido = (alvo: AlvoDoAssistente) =>
  alvo.locais.length > 0 ||
  alvo.visoes.length > 0 ||
  alvo.ativoIds.length > 0 ||
  alvo.lista.trim() !== '';

/** Os locais e as visões do passo Máquinas, com quantas máquinas cada um tem. */
export function useAlvos(fuso: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_SOFTWARE, 'alvos', fuso],
    queryFn: () =>
      consultar(
        () => api.GET('/software/distribuicoes/alvos', { params: { query: { fuso } } }),
        'carregar os locais e as visões',
      ),
  });
}

/**
 * A conta do assistente: cada máquina escolhida com a classe frente ao pacote. O fuso vai junto, para
 * as datas dos filtros das visões.
 */
export function usePrevia(pacoteId: string | null, alvo: AlvoDoAssistente, fuso: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_SOFTWARE, 'previa', pacoteId, alvo, fuso],
    queryFn: () =>
      consultar(
        () =>
          api.POST('/software/distribuicoes/previa', {
            body: { pacoteId: pacoteId ?? '', alvo: { ...alvo, fuso } },
          }),
        'contar as máquinas',
      ),
    enabled: pacoteId !== null && alvoEscolhido(alvo),
    placeholderData: keepPreviousData,
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

export type MatrizPorMaquina = components['schemas']['MatrizPorMaquina'];
export type MatrizPorLocal = components['schemas']['MatrizPorLocal'];

/** A matriz por local: os pacotes ativos frente aos locais com máquinas com o agente. */
export function useMatrizPorLocal() {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_SOFTWARE, 'matriz', 'local'],
    queryFn: async (): Promise<MatrizPorLocal> => {
      const matriz = await consultar(
        () => api.GET('/software/matriz', { params: { query: { por: 'local' } } }),
        'carregar a matriz',
      );
      if (matriz.por !== 'local') throw new Error('Não foi possível carregar a matriz.');
      return matriz;
    },
  });
}

/** A matriz por máquina de um local: os pacotes ativos frente às máquinas do próprio local. */
export function useMatrizPorMaquina(local: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DO_SOFTWARE, 'matriz', 'maquina', local],
    enabled: local !== null,
    queryFn: async (): Promise<MatrizPorMaquina> => {
      const matriz = await consultar(
        () =>
          api.GET('/software/matriz', {
            params: { query: { por: 'maquina', local: local ?? '' } },
          }),
        'carregar a matriz do local',
      );
      if (matriz.por !== 'maquina') throw new Error('Não foi possível carregar a matriz do local.');
      return matriz;
    },
    placeholderData: keepPreviousData,
  });
}
