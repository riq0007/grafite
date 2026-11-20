// As consultas do app do chat (spec modulo-chat, "Trilha do chat", "Lista do Chat" e "Telas do
// chat atualizadas e avisos"; change chat-com-chamados, design, decisões 5 e 12): tudo fica debaixo
// da chave do chat, com as conversas e os chamados à parte, para cada evento reler só o que muda.
import type { components } from '@grafite/api-client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { consultar } from '../api/consultas.ts';
import { useApi } from '../api/useApi.tsx';
import type { EventosDoModulo } from '../modulos/tipos.ts';

/** O começo da chave de toda consulta do chat. */
export const CHAVE_DO_CHAT = ['chat'] as const;

/** O total do chat e os chamados com resposta nova, da trilha. */
export const CHAVE_DO_RESUMO_DO_CHAT = [...CHAVE_DO_CHAT, 'resumo'] as const;

/** As conversas da conta, na lista, e o que é de cada uma. */
export const CHAVE_DAS_CONVERSAS = [...CHAVE_DO_CHAT, 'conversas'] as const;

/** Os chamados de que a conta participa, na lista, e o que é de cada um. */
export const CHAVE_DOS_CHAMADOS_DO_CHAT = [...CHAVE_DO_CHAT, 'chamados'] as const;

/** As pessoas da escolha da conversa direta, pela busca. */
export const CHAVE_DAS_PESSOAS_DO_CHAT = [...CHAVE_DO_CHAT, 'pessoas'] as const;

export type ResumoDoChat = components['schemas']['ResumoDoChat'];
export type ConversaNaLista = components['schemas']['ConversaNaLista'];
export type ChamadoDeQuemParticipa = components['schemas']['ChamadoDeQuemParticipa'];
export type PessoaDoChat = components['schemas']['PessoasDoChat']['pessoas'][number];

export function useResumoDoChat() {
  const api = useApi();
  return useQuery({
    queryKey: CHAVE_DO_RESUMO_DO_CHAT,
    queryFn: ({ signal }) =>
      consultar(() => api.GET('/chat/resumo', { signal }), 'carregar os contadores do chat'),
  });
}

/** As equipes e os canais, pelo nome, e as conversas diretas, a da mensagem mais nova primeiro. */
export function useConversasDoChat() {
  const api = useApi();
  return useQuery({
    queryKey: CHAVE_DAS_CONVERSAS,
    queryFn: ({ signal }) =>
      consultar(() => api.GET('/chat/conversas', { signal }), 'carregar as conversas'),
  });
}

/** Os chamados de que a conta participa, só com o módulo Chamados ligado. */
export function useChamadosDoChat(ligado: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: CHAVE_DOS_CHAMADOS_DO_CHAT,
    enabled: ligado,
    queryFn: ({ signal }) =>
      consultar(() => api.GET('/chat/chamados', { signal }), 'carregar os seus chamados'),
  });
}

/**
 * As pessoas que usam o chat, pelas palavras do nome, até 20, para a conversa direta. Enquanto a
 * busca nova não chega, a lista fica com as da busca de antes.
 */
export function usePessoasDoChat(busca: string, ligado: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DAS_PESSOAS_DO_CHAT, busca],
    enabled: ligado,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      consultar(
        () =>
          api.GET('/chat/pessoas', {
            params: { query: busca === '' ? {} : { busca } },
            signal,
          }),
        'buscar as pessoas',
      ),
  });
}

/**
 * O que cada evento relê no chat. A mensagem, a reação, a leitura e as equipes e os canais mudam as
 * conversas e o total; o chamado muda a lista dos chamados e a resposta nova. O nome, a foto, quem
 * usa o chat e os módulos ligados mudam tudo.
 */
export const EVENTOS_DO_CHAT: EventosDoModulo = {
  'chat.mudou': () => [CHAVE_DAS_CONVERSAS, CHAVE_DO_RESUMO_DO_CHAT, CHAVE_DAS_PESSOAS_DO_CHAT],
  'chamados.mudaram': () => [CHAVE_DOS_CHAMADOS_DO_CHAT, CHAVE_DO_RESUMO_DO_CHAT],
  // O nome e o ícone do tipo dos chamados.
  'ajustes-dos-chamados.mudaram': () => [CHAVE_DOS_CHAMADOS_DO_CHAT],
  'pessoas.mudaram': () => [CHAVE_DO_CHAT],
  'acessos.mudaram': () => [CHAVE_DO_CHAT],
  'modulos.mudaram': () => [CHAVE_DO_CHAT],
};
