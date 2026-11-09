// A sessão para os módulos (contrato de módulo): `useSessao()` diz quem está na sessão e acompanha
// as mudanças. As ações (entrar, sair e os passos pendentes) ficam com a casca e os Ajustes, pelo
// `useLojaDaSessao()`.
import { createContext, type ReactNode, useContext, useSyncExternalStore } from 'react';
import type { EstadoDaSessao, LojaDaSessao, ServidorDaSessao } from './loja.ts';

const Contexto = createContext<LojaDaSessao | null>(null);

export function ProvedorDaSessao({ loja, children }: { loja: LojaDaSessao; children: ReactNode }) {
  return <Contexto.Provider value={loja}>{children}</Contexto.Provider>;
}

export function useLojaDaSessao(): LojaDaSessao {
  const loja = useContext(Contexto);
  if (!loja) throw new Error('useSessao() precisa do ProvedorDaSessao');
  return loja;
}

export function useSessao(): EstadoDaSessao {
  const loja = useLojaDaSessao();
  return useSyncExternalStore(loja.assinar, loja.ler);
}

/**
 * O que o servidor diz de si: o ambiente, que a barra e a entrada mostram no teste, e se a
 * organização opera o servidor. `null` enquanto o servidor não respondeu.
 */
export function useServidor(): ServidorDaSessao | null {
  const loja = useLojaDaSessao();
  return useSyncExternalStore(loja.assinar, loja.lerServidor);
}
