import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { criarClienteDeConsultas } from './api/consultas.ts';
import { ProvedorDaApi } from './api/useApi.tsx';
import { PrimeiraCarga } from './casca/primeiraTela.ts';
import { paraAJanelaDoChat } from './chat/enderecos.ts';
import { ProvedorDosRascunhos } from './chat/rascunhos.tsx';
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
 * casca e os módulos, que carrega pela primeira vez já na primeira tela da conta.
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
  // Os destinos das notificações são endereços do app, conferidos por quem notifica. O do app do
  // chat abre o mesmo lugar na janela do Chat, com a busca, como o `?m=` da mensagem (change
  // chat-com-chamados, design, decisão 12).
  const navegar = useCallback(
    (destino: string) => {
      void roteador.navigate({ href: paraAJanelaDoChat(destino) });
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
                  <PrimeiraCarga roteador={roteador}>
                    {/* Os rascunhos da janela do Chat duram enquanto a casca está aberta. */}
                    <ProvedorDosRascunhos>
                      <RouterProvider router={roteador} />
                    </ProvedorDosRascunhos>
                  </PrimeiraCarga>
                </Porta>
              </ProvedorDeNotificacoes>
            </ProvedorDoCanal>
          </QueryClientProvider>
        </ProvedorDaApi>
      </ProvedorDaSessao>
    </ProvedorDePreferencias>
  );
}
