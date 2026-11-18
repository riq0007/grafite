// As consultas dos chamados (spec modulo-chamados, "Telas atualizadas e módulo desligado"; change
// chamados-da-ti, design, decisões 14 e 22): tudo o que é dos chamados fica debaixo de uma chave,
// que o `chamados.mudaram` relê de uma vez; a ficha, debaixo dela, relê também pelos eventos do que
// só ela mostra; e os ajustes ficam à parte, com o evento deles. O quadro e a lista dos prazos são
// pedidos no fuso das preferências da conta, que decide o "hoje".
import type { components } from '@grafite/api-client';
import { useDataHora } from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { consultar } from '../../api/consultas.ts';
import { useApi } from '../../api/useApi.tsx';

/** O começo da chave de toda consulta dos chamados: o quadro, os prazos e a ficha. */
export const CHAVE_DOS_CHAMADOS = ['chamados'] as const;

/** A chave da ficha do chamado, que mostra os alertas, a OS, a solicitação e o resumo do ativo. */
export const CHAVE_DA_FICHA_DO_CHAMADO = [...CHAVE_DOS_CHAMADOS, 'ficha'] as const;

/** O começo da chave dos ajustes: os tipos, o formulário, as respostas prontas e o horário. */
export const CHAVE_DOS_AJUSTES_DOS_CHAMADOS = ['ajustes-dos-chamados'] as const;

export type QuadroDosChamados = components['schemas']['QuadroDosChamados'];
export type ColunaDoQuadro = QuadroDosChamados['colunas'][number];
export type PrazosDosChamados = components['schemas']['PrazosDosChamados'];
export type ChamadoNosPrazos = PrazosDosChamados['chamados'][number];

/**
 * O quadro: a triagem, uma coluna por pessoa da TI, com a carga e os resolvidos hoje, e o aviso de
 * quem não vê a organização inteira (spec chamados, "Carga de cada pessoa").
 */
export function useQuadroDosChamados() {
  const api = useApi();
  const { fuso } = useDataHora();
  return useQuery({
    queryKey: [...CHAVE_DOS_CHAMADOS, 'quadro', fuso],
    queryFn: () =>
      consultar(
        () => api.GET('/chamados/quadro', { params: { query: { fuso } } }),
        'carregar o quadro dos chamados',
      ),
  });
}

export type FichaDoChamado = components['schemas']['FichaDoChamado'];

/**
 * A ficha do chamado aberto (spec modulo-chamados, "Chamado aberto"): o cabeçalho, o prazo, a
 * conversa e o que vem das outras capacidades. Só pede com o número do endereço válido.
 */
export function useFichaDoChamado(numero: number | null) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DA_FICHA_DO_CHAMADO, numero],
    enabled: numero !== null,
    queryFn: () =>
      consultar(
        () => api.GET('/chamados/{numero}', { params: { path: { numero: numero ?? 0 } } }),
        'carregar o chamado',
      ),
  });
}

export type TipoDaAbertura = components['schemas']['TipoDaAbertura'];

/**
 * Os tipos que a gaveta da abertura oferece, com o formulário de cada um, debaixo da chave dos
 * ajustes: o tipo ativado, inativado ou com o formulário trocado chega à gaveta aberta.
 */
export function useTiposDaAbertura() {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DOS_AJUSTES_DOS_CHAMADOS, 'abertura'],
    queryFn: () => consultar(() => api.GET('/chamados/abertura'), 'carregar os tipos de chamado'),
  });
}

/** A lista dos abertos que a conta vê, com o tipo, o título e o relógio de cada um, e o horário. */
export function usePrazosDosChamados() {
  const api = useApi();
  const { fuso } = useDataHora();
  return useQuery({
    queryKey: [...CHAVE_DOS_CHAMADOS, 'prazos', fuso],
    queryFn: () =>
      consultar(
        () => api.GET('/chamados/prazos', { params: { query: { fuso } } }),
        'carregar os prazos dos chamados',
      ),
  });
}

export type TipoDeChamado = components['schemas']['TipoDeChamado'];

/** A chave dos tipos de chamado, debaixo da dos ajustes, que o evento deles relê. */
export const CHAVE_DOS_TIPOS_DE_CHAMADO = [...CHAVE_DOS_AJUSTES_DOS_CHAMADOS, 'tipos'] as const;

/** Os tipos de chamado, na ordem, com o prazo, quem atende e as contagens, a quem configura. */
export function useTiposDeChamado() {
  const api = useApi();
  return useQuery({
    queryKey: CHAVE_DOS_TIPOS_DE_CHAMADO,
    queryFn: () => consultar(() => api.GET('/chamados/tipos'), 'carregar os tipos de chamado'),
  });
}

/** As contas que atendem os chamados, que o editor do tipo oferece em quem atende por padrão. */
export function useContasQueAtendem() {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DOS_AJUSTES_DOS_CHAMADOS, 'contas-que-atendem'],
    queryFn: () =>
      consultar(() => api.GET('/chamados/tipos/contas'), 'carregar quem atende os chamados'),
  });
}
