// O canal dos eventos da sessão para as telas (change p3a-regras-e-alertas, design, decisão 11): a
// tela inicial o passa às fontes de ocorrências, para cada uma ouvir os eventos do seu módulo.
import { createContext, type ReactNode, useContext } from 'react';
import { type CanalDeEventos, criarCanalDeEventos } from './canal.ts';

/** Sem provedor acima, como nos testes de um componente só, um canal que nunca recebe nada. */
const Contexto = createContext<CanalDeEventos>(criarCanalDeEventos());

export function ProvedorDoCanal({
  canal,
  children,
}: {
  canal: CanalDeEventos;
  children: ReactNode;
}) {
  return <Contexto.Provider value={canal}>{children}</Contexto.Provider>;
}

export function useCanal(): CanalDeEventos {
  return useContext(Contexto);
}
