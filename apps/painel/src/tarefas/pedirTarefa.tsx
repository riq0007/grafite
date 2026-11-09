// O pedido de uma tarefa pela página (spec painel-da-operacao, "Tarefas do painel pelos mesmos
// comandos"): os botões e os formulários pedem por aqui, e quem acompanha o andamento é o painel das
// tarefas. A recusa do servidor, como a de uma tarefa que espera outra, fica para ele mostrar.
import { createContext, type ReactNode, useContext } from 'react';
import type { ResultadoDoPedido } from '../api/tipos.ts';

export type PedirTarefa = (
  tarefa: string,
  campos?: Record<string, string>,
) => Promise<ResultadoDoPedido>;

const Contexto = createContext<{ pedir: PedirTarefa; emAndamento: string | null } | null>(null);

export function ProvedorDasTarefas({
  pedir,
  emAndamento,
  children,
}: {
  pedir: PedirTarefa;
  emAndamento: string | null;
  children: ReactNode;
}) {
  return <Contexto.Provider value={{ pedir, emAndamento }}>{children}</Contexto.Provider>;
}

/** Como pedir uma tarefa, e a que roda agora, que deixa as outras indisponíveis. */
export function useTarefas() {
  const contexto = useContext(Contexto);
  if (contexto === null) throw new Error('O pedido das tarefas fica dentro do ProvedorDasTarefas.');
  return contexto;
}
