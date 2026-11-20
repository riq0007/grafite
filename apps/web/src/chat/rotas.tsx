// A árvore de rotas do app do chat (change chat-com-chamados, design, decisão 12), à parte da
// casca: o app não importa o roteador dela nem os módulos. A moldura, com a trilha e a lista da
// vista, fica na raiz, e cada rota do /chat dá a tela ao lado da lista.
import { EstadoVazio } from '@grafite/ui';
import {
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router';
import { MessageCircle } from 'lucide-react';
import { LinkDoChat } from './LinkDoChat.tsx';
import estilos from './MolduraDoChat.module.css';
import { MolduraDoChat } from './MolduraDoChat.tsx';

/** A vista Chat sem nada escolhido na lista. */
function NadaEscolhido() {
  return (
    <div className={estilos.nadaEscolhido}>
      <EstadoVazio
        icone={MessageCircle}
        titulo="Escolha uma conversa ou um chamado na lista."
        descricao="Para falar com alguém, use Nova conversa."
      />
    </div>
  );
}

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

// As telas ao lado da lista ainda vazias chegam nas tarefas delas: a conversa e a direta na 4.3, o
// chamado na 4.6 e as vistas Chamados, Equipes e Avisos na 4.7.
const vistaChat = createRoute({ getParentRoute: () => chat, path: '/', component: NadaEscolhido });

/** Uma conversa, na vista Chat. */
export const rotaDaConversa = createRoute({ getParentRoute: () => chat, path: 'c/$conversa' });

/**
 * A conversa direta com a pessoa escolhida em "Nova conversa", que ainda não nasceu: ela nasce com a
 * primeira mensagem (spec chat, "Conversa direta").
 */
export const rotaDaDireta = createRoute({ getParentRoute: () => chat, path: 'direta/$conta' });

const vistaChamados = createRoute({ getParentRoute: () => chat, path: 'chamados' });

/**
 * Um chamado de quem participa, na vista Chat, com os abertos e os fechados na lista; aberto pela
 * vista Chamados, com `?vista=chamados`, fica nela.
 */
export const rotaDoChamado = createRoute({
  getParentRoute: () => chat,
  path: 'chamados/$numero',
  validateSearch: (busca: Record<string, unknown>): { vista?: 'chamados' } =>
    busca.vista === 'chamados' ? { vista: 'chamados' } : {},
});

const vistaEquipes = createRoute({ getParentRoute: () => chat, path: 'equipes' });

const vistaAvisos = createRoute({ getParentRoute: () => chat, path: 'avisos' });

export const arvoreDoChat = raiz.addChildren([
  chat.addChildren([
    vistaChat,
    rotaDaConversa,
    rotaDaDireta,
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
