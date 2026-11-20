// O chamado que a conta acaba de abrir pelo chat (spec modulo-chat, "Lista do Chat"): ele entra no
// alto de CHAMADOS, com o contorno forte, até a lista ser montada de novo. A abertura o marca, e a
// lista o esquece quando sai da tela, e não na consulta que o evento da abertura refaz.
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

export interface ControleDoChamadoNovo {
  /** O número do chamado aberto agora, ou `null`. */
  novo: number | null;
  marcar: (numero: number | null) => void;
}

const Contexto = createContext<ControleDoChamadoNovo | null>(null);

export function ProvedorDoChamadoNovo({
  inicial = null,
  children,
}: {
  inicial?: number | null;
  children: ReactNode;
}) {
  const [novo, marcar] = useState(inicial);
  const controle = useMemo(() => ({ novo, marcar }), [novo]);
  return <Contexto.Provider value={controle}>{children}</Contexto.Provider>;
}

export function useChamadoNovo(): ControleDoChamadoNovo {
  const controle = useContext(Contexto);
  if (!controle) throw new Error('useChamadoNovo precisa do ProvedorDoChamadoNovo acima dele.');
  return controle;
}
