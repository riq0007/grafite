// A janela do Chat na casca (spec modulo-chat, "Chat na casca"; change chat-com-chamados, design,
// decisão 12): as mesmas telas do app do chat (`chat/telas.tsx`), no endereço /conversas, porque o
// /chat é do app, e recarregar a casca com a janela aberta cairia nele. A moldura fica no endereço
// do módulo, com a trilha e a lista da vista, e cada rota dá a tela ao lado da lista. Os avisos ficam
// no sino da casca, e a janela não tem a vista deles. As equipes e os canais, de quem configura o
// chat, ficam no endereço do módulo, mas fora da moldura, que é de quem o usa.
import { createRoute, Navigate, Outlet, useRouterState } from '@tanstack/react-router';
import { ProvedorDaJanelaDoChat } from '../../chat/base.tsx';
import { ProvedorDoChamadoNovo } from '../../chat/chamadoNovo.tsx';
import { MolduraDoChat } from '../../chat/MolduraDoChat.tsx';
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
} from '../../chat/telas.tsx';
import { raiz } from '../../rotas/raiz.tsx';
import { useAcesso } from '../../sessao/useAcesso.ts';
import { EquipesECanais } from './EquipesECanais.tsx';

/**
 * A janela do Chat, com o chamado que a conta acaba de abrir no alto da lista, até ela sair da tela.
 * Os rascunhos ficam acima do roteador (`App.tsx`), para durar enquanto a casca está aberta, também
 * quando a conta vai a outro módulo e volta.
 *
 * As equipes e os canais são uma tela da casca, sem a moldura: quem só configura o chat a usa sem
 * usar o chat, e o Chat do dock, que leva à vista Chat, a leva a elas, como o Chamados leva aos
 * tipos quem só configura os chamados.
 */
function JanelaDoChat() {
  const { pode } = useAcesso();
  const folha = useRouterState({ select: (estado) => estado.matches.at(-1)?.routeId });
  if (folha === equipesECanais.id) return <Outlet />;
  if (folha === vistaChat.id && !pode('chat.usar') && pode('chat.configurar')) {
    return <Navigate to="/conversas/equipes-e-canais" replace />;
  }
  return (
    <ProvedorDaJanelaDoChat>
      <ProvedorDoChamadoNovo>
        <MolduraDoChat />
      </ProvedorDoChamadoNovo>
    </ProvedorDaJanelaDoChat>
  );
}

// Cada rota numa constante própria: criadas dentro do addChildren, as filhas perdem os tipos dos
// endereços, e um menu com destino errado passaria a compilar.

const conversas = createRoute({
  getParentRoute: () => raiz,
  path: '/conversas',
  component: JanelaDoChat,
  notFoundComponent: ChatNaoEncontrado,
});

const vistaChat = createRoute({
  getParentRoute: () => conversas,
  path: '/',
  component: NadaEscolhido,
});

const conversa = createRoute({
  getParentRoute: () => conversas,
  path: 'c/$conversa',
  validateSearch: validarBuscaDaConversa,
  component: ConversaDoEndereco,
});

const direta = createRoute({
  getParentRoute: () => conversas,
  path: 'direta/$conta',
  component: DiretaDoEndereco,
});

const vistaChamados = createRoute({
  getParentRoute: () => conversas,
  path: 'chamados',
  component: NenhumChamadoEscolhido,
});

const chamado = createRoute({
  getParentRoute: () => conversas,
  path: 'chamados/$numero',
  validateSearch: validarBuscaDoChamado,
  component: ChamadoDoEndereco,
});

const vistaEquipes = createRoute({
  getParentRoute: () => conversas,
  path: 'equipes',
  component: NenhumaEquipeEscolhida,
});

const equipe = createRoute({
  getParentRoute: () => conversas,
  path: 'equipes/$conversa',
  component: EquipeDoEndereco,
});

const equipesECanais = createRoute({
  getParentRoute: () => conversas,
  path: 'equipes-e-canais',
  component: EquipesECanais,
});

export const rotasDoChat = conversas.addChildren([
  vistaChat,
  conversa,
  direta,
  vistaChamados,
  chamado,
  vistaEquipes,
  equipe,
  equipesECanais,
]);
