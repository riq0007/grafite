// A árvore de rotas do app do chat (change chat-com-chamados, design, decisão 12), à parte da
// casca: o app não importa o roteador dela nem os módulos. A moldura, com a trilha e a lista da
// vista, fica na raiz, e cada rota do /chat dá a tela ao lado da lista.
import { EstadoVazio } from '@grafite/ui';
import {
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
  useRouterState,
} from '@tanstack/react-router';
import { MessageCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { LinkDoChat } from './LinkDoChat.tsx';
import estilos from './MolduraDoChat.module.css';
import { MolduraDoChat } from './MolduraDoChat.tsx';
import { TelaDaConversa } from './TelaDaConversa.tsx';
import { type PessoaDaDireta, TelaDaDireta } from './TelaDaDireta.tsx';
import { ChamadoNaoEncontrado, TelaDoChamado } from './TelaDoChamado.tsx';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// As telas ao lado da lista ainda vazias chegam na tarefa delas: as vistas Chamados, Equipes e
// Avisos na 4.7.
const vistaChat = createRoute({ getParentRoute: () => chat, path: '/', component: NadaEscolhido });

/**
 * Uma conversa, na vista Chat; com `?m=`, aberta na mensagem do link (spec chat, "Link da
 * mensagem"). Os ids vão em minúsculas, como a API os devolve.
 */
export const rotaDaConversa = createRoute({
  getParentRoute: () => chat,
  path: 'c/$conversa',
  // O `?m=` mexido, que não é o id de uma mensagem, sai: a conversa abre como sem o link. O `m`
  // indefinido apaga o da busca da raiz, que o roteador junta por baixo da validada.
  validateSearch: (busca: Record<string, unknown>): { m?: string } => ({
    m: typeof busca.m === 'string' && UUID.test(busca.m) ? busca.m : undefined,
  }),
  component: ConversaDoEndereco,
});

/**
 * A tela de cada conversa começa do zero: as abas, a rolagem e a abertura são dela. Os tipos do
 * roteador são os da casca, que registra o dela: a rota lê os parâmetros e a busca pela forma deles.
 */
function ConversaDoEndereco(): ReactNode {
  const conversa = (rotaDaConversa.useParams() as { conversa: string }).conversa.toLowerCase();
  const alvo = (rotaDaConversa.useSearch() as { m?: string }).m?.toLowerCase() ?? null;
  return <TelaDaConversa key={conversa} conversa={conversa} alvo={alvo} />;
}

/**
 * A conversa direta com a pessoa escolhida em "Nova conversa", que ainda não nasceu: ela nasce com a
 * primeira mensagem (spec chat, "Conversa direta").
 */
export const rotaDaDireta = createRoute({
  getParentRoute: () => chat,
  path: 'direta/$conta',
  component: DiretaDoEndereco,
});

/** A pessoa vem no estado da navegação, que o histórico guarda também na volta e ao recarregar. */
function DiretaDoEndereco(): ReactNode {
  const conta = (rotaDaDireta.useParams() as { conta: string }).conta.toLowerCase();
  const pessoa = useRouterState({
    select: (estado) => (estado.location.state as { pessoa?: PessoaDaDireta }).pessoa ?? null,
  });
  const daConta = pessoa?.conta.toLowerCase() === conta ? pessoa : null;
  return <TelaDaDireta key={conta} conta={conta} pessoa={daConta} />;
}

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
  component: ChamadoDoEndereco,
});

/** O número do chamado no endereço: um inteiro positivo, sem zero à esquerda, que cabe no banco. */
const NUMERO_DO_CHAMADO = /^[1-9]\d{0,9}$/;
const MAIOR_NUMERO = 2_147_483_647;

/** A tela de cada chamado começa do zero, com a rolagem e o que se marca nela. */
function ChamadoDoEndereco(): ReactNode {
  const { numero } = rotaDoChamado.useParams() as { numero: string };
  const { vista } = rotaDoChamado.useSearch() as { vista?: 'chamados' };
  const lido = NUMERO_DO_CHAMADO.test(numero) ? Number(numero) : null;
  if (lido === null || lido > MAIOR_NUMERO) return <ChamadoNaoEncontrado />;
  return <TelaDoChamado key={lido} numero={lido} vista={vista ?? null} />;
}

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
