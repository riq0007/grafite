// Os destinos à vista (spec modulo-chat, "Telas do chat atualizadas e avisos"; change
// chat-com-chamados, design, decisão 6): a tela que mostra uma conversa ou um chamado, à vista, marca
// o endereço deles, e a notificação que chega com esse destino não vira aviso na tela. Ela fica na
// central, e a leitura da tela a marca como lida. O endereço vale sem a busca, como o `?m=` da
// mensagem. Na casca, a tela com um cadastro na frente, numa aba da janela, não está à vista.
import { createContext, useContext, useEffect } from 'react';

/**
 * A tela está na frente da janela dela: na casca, a aba da tela, e não a de um cadastro, que a deixa
 * montada atrás. Fora da casca, como no app do chat, ela está sempre.
 */
export const ContextoDaTelaNaFrente = createContext(true);

/** Os destinos das telas à vista, cada um com quantas telas o marcam. */
export interface DestinosAVista {
  /** Marca o destino à vista; devolve o que o desmarca. */
  marcar: (destino: string) => () => void;
  /** O destino, sem a busca e o fragmento, está à vista. */
  estaAVista: (destino: string) => boolean;
}

/** O caminho do destino, sem a busca e o fragmento, em minúsculas, como os ids que o banco devolve. */
const caminhoDe = (destino: string) => (destino.split(/[?#]/)[0] ?? '').toLowerCase();

export function criarDestinosAVista(): DestinosAVista {
  const marcados = new Map<string, number>();
  return {
    marcar: (destino) => {
      const caminho = caminhoDe(destino);
      marcados.set(caminho, (marcados.get(caminho) ?? 0) + 1);
      let marcado = true;
      return () => {
        if (!marcado) return;
        marcado = false;
        const restantes = (marcados.get(caminho) ?? 1) - 1;
        if (restantes > 0) marcados.set(caminho, restantes);
        else marcados.delete(caminho);
      };
    },
    estaAVista: (destino) => marcados.has(caminhoDe(destino)),
  };
}

/** Os destinos à vista das notificações da sessão, que o provedor delas dá às telas. */
export const ContextoDosDestinosAVista = createContext<DestinosAVista | null>(null);

/** Marca o destino enquanto a tela dele está à vista; fora do provedor das notificações, nada. */
export function useDestinoAVista(destino: string, aVista: boolean) {
  const destinos = useContext(ContextoDosDestinosAVista);
  useEffect(() => {
    if (!destinos || !aVista) return;
    return destinos.marcar(destino);
  }, [destinos, destino, aVista]);
}
