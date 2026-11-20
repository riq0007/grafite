// A árvore de rotas do app do chat (change chat-com-chamados, design, decisão 12), à parte da
// casca: o app não importa o roteador dela nem os módulos. A moldura, com a trilha, fica na raiz,
// e cada vista pendura as telas dela no /chat.
import {
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router';
import { LinkDoChat } from './LinkDoChat.tsx';
import estilos from './MolduraDoChat.module.css';
import { MolduraDoChat } from './MolduraDoChat.tsx';

/** A coluna da lista de uma vista, com o título dela. */
function ColunaDaVista({ titulo }: { titulo: string }) {
  return (
    <section aria-label={titulo} className={estilos.lista}>
      <h1 className={estilos.tituloDaLista}>{titulo}</h1>
    </section>
  );
}

const VistaChat = () => <ColunaDaVista titulo="Chat" />;
const VistaChamados = () => <ColunaDaVista titulo="Chamados" />;
const VistaEquipes = () => <ColunaDaVista titulo="Equipes" />;
const VistaAvisos = () => <ColunaDaVista titulo="Avisos" />;

/** O endereço que não leva a nenhuma tela do chat, com o caminho de volta. */
function ChatNaoEncontrado() {
  return (
    <div className={estilos.naoEncontrada}>
      <h1 className={estilos.tituloDaLista}>Página não encontrada</h1>
      <p>Este endereço não leva a nenhuma tela do chat.</p>
      <LinkDoChat para="/chat">Ir para o Chat</LinkDoChat>
    </div>
  );
}

const raiz = createRootRoute({ component: MolduraDoChat, notFoundComponent: ChatNaoEncontrado });

const chat = createRoute({ getParentRoute: () => raiz, path: '/chat' });

const vistaChat = createRoute({ getParentRoute: () => chat, path: '/', component: VistaChat });

/** Uma conversa, na vista Chat. */
export const rotaDaConversa = createRoute({
  getParentRoute: () => chat,
  path: 'c/$conversa',
  component: VistaChat,
});

const vistaChamados = createRoute({
  getParentRoute: () => chat,
  path: 'chamados',
  component: VistaChamados,
});

/** Um chamado de quem participa, na vista Chamados. */
export const rotaDoChamado = createRoute({
  getParentRoute: () => chat,
  path: 'chamados/$numero',
  component: VistaChamados,
});

const vistaEquipes = createRoute({
  getParentRoute: () => chat,
  path: 'equipes',
  component: VistaEquipes,
});

const vistaAvisos = createRoute({
  getParentRoute: () => chat,
  path: 'avisos',
  component: VistaAvisos,
});

export const arvoreDoChat = raiz.addChildren([
  chat.addChildren([
    vistaChat,
    rotaDaConversa,
    vistaChamados,
    rotaDoChamado,
    vistaEquipes,
    vistaAvisos,
  ]),
]);

/** O roteador do app do chat. Sem histórico, usa o do navegador; os testes passam um em memória. */
export function criarRoteadorDoChat(historico?: RouterHistory) {
  return createRouter({
    routeTree: arvoreDoChat,
    history: historico,
    defaultNotFoundComponent: ChatNaoEncontrado,
  });
}

export type RoteadorDoChat = ReturnType<typeof criarRoteadorDoChat>;
