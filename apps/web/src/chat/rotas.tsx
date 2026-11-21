// A árvore de rotas do app do chat (change chat-com-chamados, design, decisão 12), à parte da
// casca: o app não importa o roteador dela nem os módulos. A moldura, com a trilha e a lista da
// vista, fica na raiz, e cada rota do /chat dá a tela ao lado da lista. As telas são as mesmas da
// janela do Chat da casca (`telas.tsx`).
import {
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router';
import { MolduraDoChat } from './MolduraDoChat.tsx';
import { TelaDosAvisos } from './TelaDosAvisos.tsx';
import {
  ChamadoDoEndereco,
  ChatNaoEncontrado,
  ConversaDoEndereco,
  DiretaDoEndereco,
  EquipeDoEndereco,
  NadaEscolhido,
  NenhumaEquipeEscolhida,
  NenhumChamadoEscolhido,
  validarBuscaDaConversa,
  validarBuscaDoChamado,
} from './telas.tsx';
import { lembrarAsEntradas } from './voltar.ts';

const raiz = createRootRoute({ component: MolduraDoChat, notFoundComponent: ChatNaoEncontrado });

const chat = createRoute({ getParentRoute: () => raiz, path: '/chat' });

const vistaChat = createRoute({ getParentRoute: () => chat, path: '/', component: NadaEscolhido });

/** Uma conversa, na vista Chat; com `?m=`, aberta na mensagem do link (spec chat, "Link da mensagem"). */
const rotaDaConversa = createRoute({
  getParentRoute: () => chat,
  path: 'c/$conversa',
  validateSearch: validarBuscaDaConversa,
  component: ConversaDoEndereco,
});

/**
 * A conversa direta com a pessoa escolhida em "Nova conversa", que ainda não nasceu: ela nasce com a
 * primeira mensagem (spec chat, "Conversa direta").
 */
const rotaDaDireta = createRoute({
  getParentRoute: () => chat,
  path: 'direta/$conta',
  component: DiretaDoEndereco,
});

const vistaChamados = createRoute({
  getParentRoute: () => chat,
  path: 'chamados',
  component: NenhumChamadoEscolhido,
});

/**
 * Um chamado de quem participa, na vista Chat, com os abertos e os fechados na lista; aberto pela
 * vista Chamados, com `?vista=chamados`, fica nela.
 */
const rotaDoChamado = createRoute({
  getParentRoute: () => chat,
  path: 'chamados/$numero',
  validateSearch: validarBuscaDoChamado,
  component: ChamadoDoEndereco,
});

const vistaEquipes = createRoute({
  getParentRoute: () => chat,
  path: 'equipes',
  component: NenhumaEquipeEscolhida,
});

/** Uma equipe ou um canal de que a conta participa, na vista Equipes, com quem participa. */
const rotaDaEquipe = createRoute({
  getParentRoute: () => chat,
  path: 'equipes/$conversa',
  component: EquipeDoEndereco,
});

/** Os avisos, sem a lista ao lado: a tela ocupa a largura. */
const vistaAvisos = createRoute({
  getParentRoute: () => chat,
  path: 'avisos',
  component: TelaDosAvisos,
});

const arvoreDoChat = raiz.addChildren([
  chat.addChildren([
    vistaChat,
    rotaDaConversa,
    rotaDaDireta,
    vistaChamados,
    rotaDoChamado,
    vistaEquipes,
    rotaDaEquipe,
    vistaAvisos,
  ]),
]);

/** O roteador do app do chat. Sem histórico, usa o do navegador; os testes passam um em memória. */
export function criarRoteadorDoChat(historico?: RouterHistory) {
  const roteador = createRouter({
    routeTree: arvoreDoChat,
    history: historico,
    defaultNotFoundComponent: ChatNaoEncontrado,
  });
  // A seta de voltar do celular sabe se a entrada anterior é a lista (`voltar.ts`).
  lembrarAsEntradas(roteador.history);
  return roteador;
}

export type RoteadorDoChat = ReturnType<typeof criarRoteadorDoChat>;
