// As consultas do app do chat (spec modulo-chat, "Trilha do chat", "Lista do Chat" e "Telas do
// chat atualizadas e avisos"; change chat-com-chamados, design, decisões 5 e 12): tudo fica debaixo
// da chave do chat, com as conversas e os chamados à parte, para cada evento reler só o que muda.
import type { components } from '@grafite/api-client';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { consultar } from '../api/consultas.ts';
import { pedir } from '../api/pedir.ts';
import { useApi } from '../api/useApi.tsx';
import type { EventosDoModulo } from '../modulos/tipos.ts';
import {
  abrirTrecho,
  type BuscarPagina,
  juntarPagina,
  type PedidoDaPagina,
  relerTrecho,
  type TrechoDaConversa,
} from './conversa.ts';

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

/**
 * O que é de uma conversa aberta: o cabeçalho, as mensagens, os arquivos e os chamados dela, à parte
 * da lista, para o evento da conversa reler só ela. O id vai em minúsculas, como a API o devolve.
 */
export const chaveDaConversa = (conversa: string) =>
  [...CHAVE_DO_CHAT, 'conversa', conversa.toLowerCase()] as const;

export type ResumoDoChat = components['schemas']['ResumoDoChat'];
export type ConversaNaLista = components['schemas']['ConversaNaLista'];
export type ChamadoDeQuemParticipa = components['schemas']['ChamadoDeQuemParticipa'];
export type PessoaDoChat = components['schemas']['PessoasDoChat']['pessoas'][number];
export type ConversaAberta = components['schemas']['ConversaAberta'];
export type ArquivoDaConversa = components['schemas']['ArquivoDaConversa'];
export type ChamadoDaConversa = components['schemas']['ChamadoDaConversa'];

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

/** A conversa aberta: o nome, quem escreve, o silenciar e a última lida. */
export function useConversaAberta(conversa: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...chaveDaConversa(conversa), 'cabecalho'],
    queryFn: ({ signal }) =>
      consultar(
        () => api.GET('/chat/conversas/{id}', { params: { path: { id: conversa } }, signal }),
        'abrir a conversa',
      ),
  });
}

/**
 * O que se carrega no trecho: as 50 antes da primeira, em "Mensagens anteriores", as 50 depois da
 * última, em "Mensagens seguintes", ou as mais novas, que levam o trecho ao fim da conversa.
 */
export type CargaDoTrecho = 'anteriores' | 'seguintes' | 'mais-novas';

/**
 * As mensagens carregadas da conversa (`conversa.ts`): o trecho abre na mensagem do link, na
 * primeira não lida ou na última, cresce pelas pontas, de 50 em 50, e se relê inteiro a cada evento
 * da conversa e na volta do foco, junto ao que está na tela. A consulta sai da memória com a tela:
 * aberta de novo, a conversa abre na primeira não lida de então.
 */
export function useMensagensDaConversa(conversa: string, alvo: string | null) {
  const api = useApi();
  const consultas = useQueryClient();
  const chave = [...chaveDaConversa(conversa), 'mensagens', alvo] as const;
  const buscarCom =
    (signal?: AbortSignal): BuscarPagina =>
    (pedido: PedidoDaPagina) =>
      consultar(
        () =>
          api.GET('/chat/conversas/{id}/mensagens', {
            params: { path: { id: conversa }, query: pedido },
            signal,
          }),
        'carregar as mensagens',
      );
  const trecho = useQuery({
    queryKey: chave,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      const buscar = buscarCom(signal);
      const atual = consultas.getQueryData<TrechoDaConversa>(chave);
      if (!atual) return abrirTrecho(buscar, alvo);
      const { pedido, pagina } = await relerTrecho(buscar, atual);
      return juntarPagina(consultas.getQueryData<TrechoDaConversa>(chave) ?? atual, pedido, pagina);
    },
  });
  const mais = useMutation({
    mutationFn: async (carga: CargaDoTrecho) => {
      const atual = consultas.getQueryData<TrechoDaConversa>(chave);
      if (!atual) return;
      let pedido: PedidoDaPagina = {};
      if (carga !== 'mais-novas') {
        const ponta = carga === 'anteriores' ? atual.itens[0]?.id : atual.itens.at(-1)?.id;
        if (ponta === undefined) return;
        pedido = carga === 'anteriores' ? { antes: ponta } : { depois: ponta };
      }
      const pagina = await buscarCom()(pedido);
      consultas.setQueryData<TrechoDaConversa>(chave, (agora) =>
        juntarPagina(agora ?? atual, pedido, pagina),
      );
    },
  });
  return { trecho, mais };
}

export type MensagensDaConversa = ReturnType<typeof useMensagensDaConversa>;

/**
 * A leitura da conversa à vista (spec chat, "Não lidas"; design, "A leitura"): a última mensagem
 * mostrada fica lida na abertura e a cada mensagem que chega. A lida só anda para a frente, e cada
 * mensagem vai uma vez; a que falhou vai de novo na próxima mudança. O evento da leitura relê a
 * conversa, a lista e o total.
 */
export function useLeituraDaConversa(
  conversa: string,
  { ultima, lidaAte, aVista }: { ultima: string | null; lidaAte: string | null; aVista: boolean },
) {
  const api = useApi();
  const enviada = useRef<string | null>(null);
  useEffect(() => {
    if (!aVista || ultima === null) return;
    if (lidaAte !== null && lidaAte >= ultima) return;
    if (enviada.current !== null && enviada.current >= ultima) return;
    enviada.current = ultima;
    void pedir(
      () =>
        api.POST('/chat/conversas/{id}/leitura', {
          params: { path: { id: conversa } },
          body: { ate: ultima },
        }),
      'marcar a conversa como lida',
    ).then((resultado) => {
      if (!('dados' in resultado) && enviada.current === ultima) enviada.current = null;
    });
  }, [api, conversa, ultima, lidaAte, aVista]);
}

/** Os anexos das mensagens da conversa, de 50 em 50, o mais novo primeiro. */
export function useArquivosDaConversa(conversa: string, ligado: boolean) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: [...chaveDaConversa(conversa), 'arquivos'],
    enabled: ligado,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      consultar(
        () =>
          api.GET('/chat/conversas/{id}/arquivos', {
            params: {
              path: { id: conversa },
              query: pageParam === undefined ? {} : { antesDe: pageParam },
            },
            signal,
          }),
        'carregar os arquivos',
      ),
    getNextPageParam: (pagina) => (pagina.seguintes ? pagina.itens.at(-1)?.id : undefined),
  });
}

/** Os chamados abertos das mensagens da equipe ou do canal, de 50 em 50, o mais novo primeiro. */
export function useChamadosDaConversa(conversa: string, ligado: boolean) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: [...chaveDaConversa(conversa), 'chamados'],
    enabled: ligado,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam, signal }) =>
      consultar(
        () =>
          api.GET('/chat/conversas/{id}/chamados', {
            params: {
              path: { id: conversa },
              query: pageParam === undefined ? {} : { antes: pageParam },
            },
            signal,
          }),
        'carregar os chamados da conversa',
      ),
    getNextPageParam: (pagina) => (pagina.seguintes ? pagina.itens.at(-1)?.numero : undefined),
  });
}

/** A conversa do evento, quando ele é de uma. */
const daConversa = ({ alvo }: { alvo: { tipo: string; id: string | null } | null }) =>
  alvo?.tipo === 'conversa' && alvo.id !== null ? [chaveDaConversa(alvo.id)] : [];

/**
 * O que cada evento relê no chat. A mensagem, a reação, a leitura e as equipes e os canais mudam as
 * conversas, o total e o que é da conversa do evento; o chamado muda a lista dos chamados e a
 * resposta nova. O nome, a foto, quem usa o chat e os módulos ligados mudam tudo.
 */
export const EVENTOS_DO_CHAT: EventosDoModulo = {
  'chat.mudou': (evento) => [
    CHAVE_DAS_CONVERSAS,
    CHAVE_DO_RESUMO_DO_CHAT,
    CHAVE_DAS_PESSOAS_DO_CHAT,
    ...daConversa(evento),
  ],
  'chamados.mudaram': () => [CHAVE_DOS_CHAMADOS_DO_CHAT, CHAVE_DO_RESUMO_DO_CHAT],
  // O nome e o ícone do tipo dos chamados.
  'ajustes-dos-chamados.mudaram': () => [CHAVE_DOS_CHAMADOS_DO_CHAT],
  'pessoas.mudaram': () => [CHAVE_DO_CHAT],
  'acessos.mudaram': () => [CHAVE_DO_CHAT],
  'modulos.mudaram': () => [CHAVE_DO_CHAT],
};
