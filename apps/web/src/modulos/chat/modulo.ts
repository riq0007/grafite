import { contadorDoChat } from '@grafite/domain';
import type { SeloDoModulo } from '@grafite/ui';
import { MessageCircle } from 'lucide-react';
import { contagemEmTexto, nomeParaOLeitor } from '../../chat/Contador.tsx';
import {
  consultaDoResumoDoChat,
  EVENTOS_DO_CHAT,
  type ResumoDoChat,
} from '../../chat/consultas.ts';
import { definirModulo } from '../tipos.ts';
import { rotasDoChat } from './rotas.tsx';

/**
 * O selo do Chat no dock (spec modulo-chat, "Chat na casca"): o total do chat mais os chamados com
 * resposta nova, que contam só com o módulo Chamados ligado, como "3" ou "99+", e o leitor de tela
 * ouve as duas contagens, como "2 não lidas, 1 chamado com resposta nova". Sem nada novo, e enquanto
 * o resumo carrega, o item fica sem selo.
 */
export function seloDoChat(resumo: ResumoDoChat | undefined): SeloDoModulo | null {
  if (!resumo) return null;
  const chamados = resumo.chamadosComRespostaNova ?? 0;
  const texto = contadorDoChat(resumo.naoLidas + chamados);
  if (texto === null) return null;
  return {
    texto,
    descricao: nomeParaOLeitor(
      contagemEmTexto(resumo.naoLidas, 'não lida', 'não lidas'),
      contagemEmTexto(chamados, 'chamado com resposta nova', 'chamados com resposta nova'),
    ),
  };
}

const USA_O_CHAT = ['chat.usar'] as const;

/**
 * O módulo Chat no registro (spec modulo-chat, "Chat na casca"; change chat-com-chamados, design,
 * decisão 12): logo depois do Chamados no dock e no celular, com o balão de conversa, para quem usa
 * o chat. A janela tem as vistas do app do chat em /conversas, e o menu leva a elas; a vista
 * Chamados só com o módulo Chamados ligado. O selo é o do resumo do chat, e quem só vê o Chat entre
 * os módulos da casca vai ao app dele, em /chat. Os eventos do chat relêem as telas dele.
 */
export const chat = definirModulo({
  id: 'chat',
  nome: 'Chat',
  icone: MessageCircle,
  endereco: '/conversas',
  prioridadeNoCelular: 0,
  rotas: rotasDoChat,
  permissoes: USA_O_CHAT,
  appProprio: { endereco: '/chat', permissoes: USA_O_CHAT },
  menu: [
    { rotulo: 'Chat', destino: '/conversas', permissoes: USA_O_CHAT },
    { rotulo: 'Equipes', destino: '/conversas/equipes', permissoes: USA_O_CHAT },
    {
      rotulo: 'Chamados',
      destino: '/conversas/chamados',
      permissoes: USA_O_CHAT,
      comOModulo: 'chamados',
    },
  ],
  selo: {
    permissoes: USA_O_CHAT,
    consultas: (api) => [consultaDoResumoDoChat(api)],
    montar: ({ ler, api }) => seloDoChat(ler(consultaDoResumoDoChat(api))),
  },
  eventos: EVENTOS_DO_CHAT,
});
