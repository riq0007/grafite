// Os provedores de um componente que fala com a API, nos testes sem o app inteiro: o cliente da
// API sobre o servidor do teste e as consultas, sem esperar entre as tentativas.
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { criarCliente } from '../api/cliente.ts';
import { criarClienteDeConsultas } from '../api/consultas.ts';
import { ProvedorDaApi } from '../api/useApi.tsx';
import type { ServidorDeTeste } from './sessao.ts';

export function comApi(servidor: ServidorDeTeste = {}) {
  const cliente = criarCliente({
    csrf: () => 'csrf-de-teste',
    aoPerderASessao: () => {},
    aoMudarOAcesso: () => {},
    buscar: async (pedido) => {
      const caminho = `${pedido.method} ${new URL(pedido.url).pathname}`;
      const responder = servidor[caminho];
      if (!responder) throw new Error(`O teste não preparou o servidor para ${caminho}.`);
      return responder(pedido);
    },
  });
  const consultas = criarClienteDeConsultas({ esperaEntreTentativas: 0 });
  return function Provedores({ children }: { children: ReactNode }) {
    return (
      <ProvedorDaApi cliente={cliente}>
        <QueryClientProvider client={consultas}>{children}</QueryClientProvider>
      </ProvedorDaApi>
    );
  };
}
