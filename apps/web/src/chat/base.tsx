// Onde o chat está (change chat-com-chamados, design, decisão 12): no app do chat, em /chat, ou na
// janela do Chat da casca, em /conversas, com as mesmas telas. As telas escrevem os endereços do
// app, que são os das notificações e dos links copiados, e o link, a navegação e as rotas os
// trocam pelos de onde o chat está. O endereço de fora do chat, como o de um chamado do módulo, abre
// o Grafite numa janela nova no app, que não tem as telas da casca, e na casca, nela mesma.
import { useRouter } from '@tanstack/react-router';
import { createContext, type ReactNode, useCallback, useContext } from 'react';
import { ehDoChat, JANELA_DO_CHAT, paraAJanelaDoChat } from './enderecos.ts';
import { abrirForaDoChat } from './janela.ts';

/** O app do chat ou a janela do Chat da casca. */
export type OndeEstaOChat = 'app' | 'casca';

const Contexto = createContext<OndeEstaOChat>('app');

/** As telas do chat abaixo dele estão na janela do Chat da casca, e não no app. */
export const ProvedorDaJanelaDoChat = ({ children }: { children: ReactNode }) => (
  <Contexto.Provider value="casca">{children}</Contexto.Provider>
);

/** Onde o chat está: no app ou na janela da casca. */
export const useOndeEstaOChat = (): OndeEstaOChat => useContext(Contexto);

/**
 * O endereço do app como ele é onde o chat está: o mesmo no app, e o da janela do Chat na casca. O
 * de fora do chat fica como está.
 */
export const noChatDeAgora = (endereco: string, onde: OndeEstaOChat): string =>
  onde === 'casca' ? paraAJanelaDoChat(endereco) : endereco;

/**
 * O id da rota casada como o app o chama, para as telas compararem com um só nome: na casca, o
 * `/conversas/c/$conversa` é o `/chat/c/$conversa` do app.
 */
export const rotaComoNoApp = (idDaRota: string): string =>
  idDaRota.startsWith(`${JANELA_DO_CHAT}/`) || idDaRota === JANELA_DO_CHAT
    ? `/chat${idDaRota.slice(JANELA_DO_CHAT.length)}`
    : idDaRota;

export interface OpcoesDeIrNoChat {
  /** Troca a entrada de agora do histórico, em vez de pôr uma nova. */
  replace?: boolean;
  /** O que entra no estado da navegação, como a pessoa da direta que ainda não nasceu. */
  comOEstado?: Record<string, unknown>;
}

/**
 * Vai a um endereço de onde o chat está: o do app, como `/chat/c/<id>`, no chat; o de fora dele, no
 * app, numa janela nova do Grafite, e, na casca, nela mesma.
 */
export function useIrNoChat(): (endereco: string, opcoes?: OpcoesDeIrNoChat) => void {
  const roteador = useRouter();
  const onde = useOndeEstaOChat();
  return useCallback(
    (endereco, opcoes = {}) => {
      if (!ehDoChat(endereco) && onde === 'app') {
        abrirForaDoChat(endereco);
        return;
      }
      const { replace, comOEstado } = opcoes;
      void roteador.navigate({
        href: noChatDeAgora(endereco, onde),
        ...(replace ? { replace } : {}),
        ...(comOEstado ? { state: (antes) => ({ ...antes, ...comOEstado }) } : {}),
      });
    },
    [roteador, onde],
  );
}
