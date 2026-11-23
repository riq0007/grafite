// O que se escreve em cada caixa do chat, até ser mandado (spec modulo-chat, "Caixa de escrever do
// chat"): o texto, a mensagem respondida e os anexos já enviados ficam no app, pela conversa, quando
// a conversa se atualiza e quando a conta vai a outra e volta. A direta que ainda não nasceu guarda o
// dela pela pessoa.
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
} from 'react';

/** A mensagem respondida, como a caixa a mostra em cima: quem escreveu e o começo dela. */
export interface RespondidaNoRascunho {
  id: string;
  autor: string;
  comeco: string;
}

/** O anexo já enviado, ainda sem dono, até a mensagem que o usa. */
export interface AnexoNoRascunho {
  id: string;
  nome: string;
  bytes: number;
}

export interface RascunhoDoChat {
  texto: string;
  respondida: RespondidaNoRascunho | null;
  anexos: readonly AnexoNoRascunho[];
}

export const RASCUNHO_VAZIO: RascunhoDoChat = { texto: '', respondida: null, anexos: [] };

/** A chave do rascunho: a conversa, a pessoa da direta que ainda não nasceu ou o chamado. */
export const rascunhoDaConversa = (conversa: string) => `conversa:${conversa.toLowerCase()}`;
export const rascunhoDaDireta = (conta: string) => `direta:${conta.toLowerCase()}`;
export const rascunhoDoChamado = (numero: number) => `chamado:${numero}`;

type MudarRascunho = (mudar: (antes: RascunhoDoChat) => RascunhoDoChat) => void;

interface LojaDosRascunhos {
  ler: (chave: string) => RascunhoDoChat;
  mudar: (chave: string, mudar: (antes: RascunhoDoChat) => RascunhoDoChat) => void;
  assinar: (ouvinte: () => void) => () => void;
}

function criarLoja(): LojaDosRascunhos {
  const rascunhos = new Map<string, RascunhoDoChat>();
  const ouvintes = new Set<() => void>();
  return {
    ler: (chave) => rascunhos.get(chave) ?? RASCUNHO_VAZIO,
    mudar: (chave, mudar) => {
      const depois = mudar(rascunhos.get(chave) ?? RASCUNHO_VAZIO);
      const vazio = depois.texto === '' && depois.respondida === null && depois.anexos.length === 0;
      if (vazio) rascunhos.delete(chave);
      else rascunhos.set(chave, depois);
      for (const ouvinte of ouvintes) ouvinte();
    },
    assinar: (ouvinte) => {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
  };
}

const Contexto = createContext<LojaDosRascunhos | null>(null);

export function ProvedorDosRascunhos({ children }: { children: ReactNode }) {
  const [loja] = useState(criarLoja);
  return <Contexto.Provider value={loja}>{children}</Contexto.Provider>;
}

/** O rascunho da caixa e o jeito de mudá-lo. */
export function useRascunho(chave: string): [RascunhoDoChat, MudarRascunho] {
  const loja = useContext(Contexto);
  if (!loja) throw new Error('useRascunho precisa do ProvedorDosRascunhos acima dele.');
  const rascunho = useSyncExternalStore(loja.assinar, () => loja.ler(chave));
  const mudar = useCallback<MudarRascunho>((mudanca) => loja.mudar(chave, mudanca), [loja, chave]);
  return [rascunho, mudar];
}
