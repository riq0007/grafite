// As esperas da chegada que só o app conhece (design, decisão 2): quem as cumpre avisa aqui. Fora
// da chegada, como nos testes que abrem o app direto, os avisos não fazem nada.
import { createContext, type ReactNode, useContext } from 'react';

/** A primeira tela da chegada (F2a): a casca, com a sessão valendo, ou a tela de entrada. */
export type TelaDaChegada = 'casca' | 'entrada';

export interface AvisosDaChegada {
  /** As preferências foram lidas e aplicadas no <html>. */
  preferenciasAplicadas: () => void;
  /**
   * Uma tela foi desenhada. A primeira termina "Pronto"; depois da entrada, a casca desenhada leva
   * à montagem ou à troca de opacidade.
   */
  telaDesenhada: (tela: TelaDaChegada) => void;
}

const nada = () => {};

const Contexto = createContext<AvisosDaChegada>({
  preferenciasAplicadas: nada,
  telaDesenhada: nada,
});

export function ProvedorDaChegada({
  avisos,
  children,
}: {
  avisos: AvisosDaChegada;
  children: ReactNode;
}) {
  return <Contexto.Provider value={avisos}>{children}</Contexto.Provider>;
}

export function useChegada(): AvisosDaChegada {
  return useContext(Contexto);
}
