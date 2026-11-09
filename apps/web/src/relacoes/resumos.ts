// O resumo dos registros para o cartão da referência e a origem da tabela (change relacoes-vivas,
// design, decisões 1 a 3): buscado quando o cartão abre, com o sinal que cancela a busca se ele
// fechar antes da resposta, guardado por 30 s e relido pelos eventos que mudam o registro ou as
// contagens dele. O cartão e a origem do mesmo registro dividem a mesma consulta.
import type { components } from '@grafite/api-client';
import { useQuery } from '@tanstack/react-query';
import type { ClienteDaApi } from '../api/cliente.ts';
import { consultar } from '../api/consultas.ts';
import { useApi } from '../api/useApi.tsx';

/** O começo da chave de todos os resumos: os eventos dos registros os releem de uma vez. */
export const CHAVE_DOS_RESUMOS = ['resumo'] as const;

/** Quanto tempo um resumo vale sem ser buscado de novo. */
const VALIDADE_DO_RESUMO = 30_000;

export type ContagemNoEscopo = components['schemas']['ContagemNoEscopo'];

/** As buscas do resumo de cada registro. */
const BUSCAS = {
  pessoa: (api: ClienteDaApi, id: string, signal: AbortSignal) =>
    consultar(
      () => api.GET('/pessoas/{id}/resumo', { params: { path: { id } }, signal }),
      'carregar o resumo da pessoa',
    ),
  local: (api: ClienteDaApi, id: string, signal: AbortSignal) =>
    consultar(
      () => api.GET('/locais/{id}/resumo', { params: { path: { id } }, signal }),
      'carregar o resumo do local',
    ),
  modelo: (api: ClienteDaApi, id: string, signal: AbortSignal) =>
    consultar(
      () => api.GET('/modelos/{id}/resumo', { params: { path: { id } }, signal }),
      'carregar o resumo do modelo',
    ),
  tipo: (api: ClienteDaApi, id: string, signal: AbortSignal) =>
    consultar(
      () => api.GET('/tipos-de-ativo/{id}/resumo', { params: { path: { id } }, signal }),
      'carregar o resumo do tipo',
    ),
  // O fornecedor pela ficha dele, que pede `fornecedores.ver` (change p4a-fornecedores, decisão 6).
  fornecedor: (api: ClienteDaApi, id: string, signal: AbortSignal) =>
    consultar(
      () => api.GET('/fornecedores/{id}', { params: { path: { id } }, signal }),
      'carregar o fornecedor',
    ),
};

export type RegistroDoResumo = keyof typeof BUSCAS;

export type ResumoDe<R extends RegistroDoResumo> = Awaited<ReturnType<(typeof BUSCAS)[R]>>;

/** O resumo de um registro: buscado ao montar, como o cartão aberto faz. */
export function useResumo<R extends RegistroDoResumo>(
  registro: R,
  id: string,
  { buscar = true }: { buscar?: boolean } = {},
) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DOS_RESUMOS, registro, id],
    queryFn: ({ signal }) => BUSCAS[registro](api, id, signal) as Promise<ResumoDe<R>>,
    staleTime: VALIDADE_DO_RESUMO,
    enabled: buscar,
  });
}

const numero = (quantos: number) => quantos.toLocaleString('pt-BR');

/** "1 ativo", "30 ativos", com "que você vê" quando o escopo recorta o total. */
export const quantidade = ({ quantos, recortada }: ContagemNoEscopo, um: string, varios: string) =>
  `${numero(quantos)} ${quantos === 1 ? um : varios}${recortada ? ' que você vê' : ''}`;

/** "Ativos: 12", ou "Ativos que você vê: 12" quando o escopo de quem vê recorta o total. */
export const contagemComRotulo = (rotulo: string, contagem: ContagemNoEscopo) =>
  `${rotulo}${contagem.recortada ? ' que você vê' : ''}: ${numero(contagem.quantos)}`;

/** "Ativos: 12 aqui · 30 com os de dentro", com "que você vê" quando alguma parte é recortada. */
export const aquiEDentro = (
  rotulo: string,
  { aqui, comOsDeDentro }: { aqui: ContagemNoEscopo; comOsDeDentro: ContagemNoEscopo },
) =>
  `${rotulo}${aqui.recortada || comOsDeDentro.recortada ? ' que você vê' : ''}: ${numero(
    aqui.quantos,
  )} aqui · ${numero(comOsDeDentro.quantos)} com os de dentro`;

/** "3 ativos sob responsabilidade", "1 ativo…" ou "Nenhum ativo…", com "que você vê" no recorte. */
export function ativosSobResponsabilidade({ quantos, recortada }: ContagemNoEscopo): string {
  const texto =
    quantos === 0
      ? 'Nenhum ativo sob responsabilidade'
      : `${numero(quantos)} ${quantos === 1 ? 'ativo' : 'ativos'} sob responsabilidade`;
  return recortada ? `${texto} que você vê` : texto;
}

/** O estado do cartão a partir da consulta do resumo. */
export const estadoDoCartao = (consulta: { isError: boolean; data?: unknown }) =>
  consulta.isError ? 'erro' : consulta.data ? 'pronto' : 'carregando';
