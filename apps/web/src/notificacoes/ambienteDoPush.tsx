// O navegador do push para as telas (change p3c-email-e-push, design, decisão 8): por padrão, o de
// verdade; os testes dão um falso, com o `PushManager` e a permissão que eles controlam.
import { createContext, type ReactNode, useContext, useState } from 'react';
import { type AmbienteDoPush, ambienteDoNavegador } from './push.ts';

const Contexto = createContext<AmbienteDoPush | null>(null);

export function ProvedorDoAmbienteDoPush({
  ambiente,
  children,
}: {
  ambiente: AmbienteDoPush;
  children: ReactNode;
}) {
  return <Contexto.Provider value={ambiente}>{children}</Contexto.Provider>;
}

/** O navegador do push: o dado pelo provedor ou, sem ele, o de verdade. */
export function useAmbienteDoPush(): AmbienteDoPush {
  const dado = useContext(Contexto);
  const [doNavegador] = useState(() => dado ?? ambienteDoNavegador());
  return dado ?? doNavegador;
}
