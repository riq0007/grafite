// O app do chat (spec modulo-chat, "App do chat"): os mesmos provedores da casca, as preferências,
// a sessão, a API, as consultas, o canal dos eventos e as notificações, e, atrás da porta da
// entrada, o roteador do chat. A entrada não muda o endereço: depois dela, o app abre no endereço
// do chat que foi pedido. Os eventos relêem as consultas do chat (spec modulo-chat, "Telas do chat
// atualizadas e avisos"), e o toque no push abre aqui o endereço do chat. A postura do aparelho vai no
// <html>, como na casca, para as regras do toque e do celular valerem também nas camadas em portal,
// como os menus e as folhas.
import { usePostura } from '@grafite/ui';
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { criarClienteDeConsultas } from '../api/consultas.ts';
import { ProvedorDaApi } from '../api/useApi.tsx';
import { type CanalDeEventos, criarCanalDeEventos } from '../eventos/canal.ts';
import { ligarEventosDosModulos } from '../eventos/modulos.ts';
import { ProvedorDoCanal } from '../eventos/useCanal.tsx';
import { ouvirAberturaPeloPush } from '../notificacoes/aberturaPeloPush.ts';
import { ProvedorDeNotificacoes } from '../notificacoes/useNotificacoes.tsx';
import { ProvedorDePreferencias } from '../preferencias/usePreferencias.tsx';
import type { LojaDaSessao } from '../sessao/loja.ts';
import { Porta } from '../sessao/Porta.tsx';
import { ProvedorDaSessao } from '../sessao/useSessao.tsx';
import { ProvedorDoChamadoNovo } from './chamadoNovo.tsx';
import { EVENTOS_DO_CHAT } from './consultas.ts';
import { ehDoChat } from './enderecos.ts';
import { abrirForaDoChat } from './janela.ts';
import { ProvedorDosRascunhos } from './rascunhos.tsx';
import type { RoteadorDoChat } from './rotas.tsx';

/** O chat no registro dos eventos, com as consultas que cada evento relê. */
const REGISTRO_DO_CHAT = [{ id: 'chat', eventos: EVENTOS_DO_CHAT }] as const;

export function AppDoChat({
  roteador,
  sessao,
  consultas: consultasDeFora,
  canal: canalDeFora,
  chamadoNovo,
}: {
  roteador: RoteadorDoChat;
  sessao: LojaDaSessao;
  /** O cliente das consultas; sem ele, o app cria o seu. */
  consultas?: QueryClient;
  /** O canal dos eventos da sessão; sem ele, o app cria o seu. */
  canal?: CanalDeEventos;
  /** O chamado que a conta acaba de abrir, no alto da lista, como os testes o dão. */
  chamadoNovo?: number;
}) {
  const [consultas] = useState(() => consultasDeFora ?? criarClienteDeConsultas());
  const [canal] = useState(() => canalDeFora ?? criarCanalDeEventos());
  const postura = usePostura();
  useLayoutEffect(() => {
    const raiz = document.documentElement;
    raiz.setAttribute('data-postura', postura);
    return () => raiz.removeAttribute('data-postura');
  }, [postura]);
  useEffect(
    () => ligarEventosDosModulos({ registro: REGISTRO_DO_CHAT, canal, consultas }),
    [canal, consultas],
  );
  // O destino no chat abre aqui; o de fora, como o de um alerta, abre o Grafite numa janela nova,
  // porque o app do chat não tem as telas da casca.
  const navegar = useCallback(
    (destino: string) => {
      if (ehDoChat(destino)) void roteador.navigate({ href: destino });
      else abrirForaDoChat(destino);
    },
    [roteador],
  );
  // O toque no push com o app aberto: o service worker pede a esta janela o destino do chat
  // (`sw-avisos.js`), e o app o abre, sem recarregar.
  useEffect(
    () =>
      ouvirAberturaPeloPush(
        typeof navigator === 'undefined' ? undefined : navigator.serviceWorker,
        navegar,
      ),
    [navegar],
  );
  return (
    <ProvedorDePreferencias loja={sessao} canal={canal}>
      <ProvedorDaSessao loja={sessao}>
        <ProvedorDaApi cliente={sessao.cliente}>
          <QueryClientProvider client={consultas}>
            <ProvedorDoCanal canal={canal}>
              <ProvedorDeNotificacoes navegar={navegar}>
                <Porta>
                  <ProvedorDoChamadoNovo inicial={chamadoNovo}>
                    <ProvedorDosRascunhos>
                      <RouterProvider router={roteador} />
                    </ProvedorDosRascunhos>
                  </ProvedorDoChamadoNovo>
                </Porta>
              </ProvedorDeNotificacoes>
            </ProvedorDoCanal>
          </QueryClientProvider>
        </ProvedorDaApi>
      </ProvedorDaSessao>
    </ProvedorDePreferencias>
  );
}
