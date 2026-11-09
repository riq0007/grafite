// A abertura da busca global para as telas (change inicio-ajustavel, design, decisão 4): a casca dá
// a função que abre a busca, vazia, como o Ctrl K, e o Início a chama pelo campo do topo.
import { createContext, useContext } from 'react';

export const ContextoDaAberturaDaBusca = createContext<() => void>(() => {});

/** A função que abre a busca global; fora da casca, não faz nada. */
export const useAbrirBusca = () => useContext(ContextoDaAberturaDaBusca);
