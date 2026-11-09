import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { criarClienteDeConsultas } from './api/consultas.ts';
import { ProvedorDaApi } from './api/useApi.tsx';
import { type CanalDeEventos, criarCanalDeEventos } from './eventos/canal.ts';
import { ligarEventosDosModulos } from './eventos/modulos.ts';
import { ProvedorDoCanal } from './eventos/useCanal.tsx';
import { REGISTRO } from './modulos/registro.ts';
import { ProvedorDeNotificacoes } from './notificacoes/useNotificacoes.tsx';
import { ProvedorDePreferencias } from './preferencias/usePreferencias.tsx';
import type { criarRoteador } from './rotas/arvore.ts';
import type { LojaDaSessao } from './sessao/loja.ts';
import { Porta } from './sessao/Porta.tsx';
import { ProvedorDaSessao } from './sessao/useSessao.tsx';

/**
 * O app inteiro: as preferências por cima de tudo, com as camadas da sessão, a sessão, o cliente
 * da API e as consultas, as notificações da sessão e, atrás da porta da entrada, o roteador com a
 * casca e os módulos.
 */
export function App({
  roteador,
  sessao,
  consultas: consultasDeFora,
  canal: canalDeFora,
}: {
  roteador: ReturnType<typeof criarRoteador>;
  sessao: LojaDaSessao;
  /** O cliente das consultas; sem ele, o app cria o seu. */
  consultas?: QueryClient;
  /** O canal dos eventos da sessão; sem ele, o app cria o seu. */
  canal?: CanalDeEventos;
}) {
  const [consultas] = useState(() => consultasDeFora ?? criarClienteDeConsultas());
  const [canal] = useState(() => canalDeFora ?? criarCanalDeEventos());
  // Cada evento relê as consultas que os módulos declaram para ele.
  useEffect(
    () => ligarEventosDosModulos({ registro: REGISTRO, canal, consultas }),
    [canal, consultas],
  );
  // Os destinos das notificações são endereços do app, conferidos por quem notifica.
  const navegar = useCallback(
    (destino: string) => {
      void roteador.navigate({ to: destino });
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
