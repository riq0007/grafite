// O app do chat (spec modulo-chat, "App do chat"): os mesmos provedores da casca, as preferências,
// a sessão, a API, as consultas, o canal dos eventos e as notificações, e, atrás da porta da
// entrada, o roteador do chat. A entrada não muda o endereço: depois dela, o app abre no endereço
// do chat que foi pedido.
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { criarClienteDeConsultas } from '../api/consultas.ts';
import { ProvedorDaApi } from '../api/useApi.tsx';
import { type CanalDeEventos, criarCanalDeEventos } from '../eventos/canal.ts';
import { ProvedorDoCanal } from '../eventos/useCanal.tsx';
import { ProvedorDeNotificacoes } from '../notificacoes/useNotificacoes.tsx';
import { ProvedorDePreferencias } from '../preferencias/usePreferencias.tsx';
import type { LojaDaSessao } from '../sessao/loja.ts';
import { Porta } from '../sessao/Porta.tsx';
import { ProvedorDaSessao } from '../sessao/useSessao.tsx';
import { ehDoChat } from './enderecos.ts';
import type { RoteadorDoChat } from './rotas.tsx';

export function AppDoChat({
  roteador,
  sessao,
  consultas: consultasDeFora,
  canal: canalDeFora,
}: {
  roteador: RoteadorDoChat;
  sessao: LojaDaSessao;
  /** O cliente das consultas; sem ele, o app cria o seu. */
  consultas?: QueryClient;
  /** O canal dos eventos da sessão; sem ele, o app cria o seu. */
  canal?: CanalDeEventos;
}) {
  const [consultas] = useState(() => consultasDeFora ?? criarClienteDeConsultas());
  const [canal] = useState(() => canalDeFora ?? criarCanalDeEventos());
  // O destino no chat abre aqui; o de fora, como o de um alerta, abre o Grafite numa janela nova,
  // porque o app do chat não tem as telas da casca.
  const navegar = useCallback(
    (destino: string) => {
      if (ehDoChat(destino)) void roteador.navigate({ href: destino });
      else window.open(destino, '_blank', 'noopener');
    },
    [roteador],
  );
  return (
    <ProvedorDePreferencias loja={sessao} canal={canal}>
      <ProvedorDaSessao loja={sessao}>
        <ProvedorDaApi cliente={sessao.cliente}>
          <QueryClientProvider client={consultas}>
            <ProvedorDoCanal canal={canal}>
              <ProvedorDeNotificacoes navegar={navegar}>
                <Porta>
                  <RouterProvider router={roteador} />
                </Porta>
              </ProvedorDeNotificacoes>
            </ProvedorDoCanal>
          </QueryClientProvider>
        </ProvedorDaApi>
      </ProvedorDaSessao>
    </ProvedorDePreferencias>
  );
}
