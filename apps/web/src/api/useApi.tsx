// O cliente da API para os módulos (contrato de módulo): `useApi()` entrega o cliente tipado, já
// com o CSRF da sessão nas escritas. Uma resposta `sem-sessao` cobre a casca com a tela de entrada,
// sem código do módulo.
import { createContext, type ReactNode, useContext } from 'react';
import type { ClienteDaApi } from './cliente.ts';

const Contexto = createContext<ClienteDaApi | null>(null);

export function ProvedorDaApi({
  cliente,
  children,
}: {
  cliente: ClienteDaApi;
  children: ReactNode;
}) {
  return <Contexto.Provider value={cliente}>{children}</Contexto.Provider>;
}

export function useApi(): ClienteDaApi {
  const cliente = useContext(Contexto);
  if (!cliente) throw new Error('useApi() precisa do ProvedorDaApi');
  return cliente;
}
