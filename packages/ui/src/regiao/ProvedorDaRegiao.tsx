// O fuso da interface (F1c, design, decisão 8): o app passa o fuso escolhido nos Ajustes, e a casca
// e os módulos formatam datas e horas pelo useDataHora().
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { criarDataHora, type DataHora } from './dataHora.ts';

/** Sem provedor acima, as datas saem no fuso do sistema. */
const DataHoraContexto = createContext<DataHora>(criarDataHora());

export interface PropsDoProvedorDaRegiao {
  /** Identificador IANA, como "America/Manaus"; sem ele, o fuso do sistema. */
  fuso?: string;
  children: ReactNode;
}

export function ProvedorDaRegiao({ fuso, children }: PropsDoProvedorDaRegiao) {
  const dataHora = useMemo(() => criarDataHora(fuso), [fuso]);
  return <DataHoraContexto.Provider value={dataHora}>{children}</DataHoraContexto.Provider>;
}

/** As funções de data e hora no fuso em vigor. */
export function useDataHora(): DataHora {
  return useContext(DataHoraContexto);
}
