// O app do chat nos testes: a abertura num endereço, como a entrada dele, o servidor do chat vazio e
// a sessão de quem usa o chat, com o que o teste preparar por cima.
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, render } from '@testing-library/react';
import { AppDoChat } from '../chat/AppDoChat.tsx';
import { criarRoteadorDoChat } from '../chat/rotas.tsx';
import type { CanalDeEventos } from '../eventos/canal.ts';
import type { LojaDaSessao, ServidorDaSessao } from '../sessao/loja.ts';
import { FUSO_DOS_MOCKUPS } from './chamados.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from './sessao.ts';

let lojas: LojaDaSessao[] = [];

/** Abre o app no endereço, como a entrada dele: a sessão ainda por validar é validada ali. */
export function abrirOChat(
  endereco: string,
  loja: LojaDaSessao,
  { chamadoNovo, canal }: { chamadoNovo?: number; canal?: CanalDeEventos } = {},
) {
  lojas.push(loja);
  const roteador = criarRoteadorDoChat(createMemoryHistory({ initialEntries: [endereco] }));
  render(<AppDoChat roteador={roteador} sessao={loja} chamadoNovo={chamadoNovo} canal={canal} />);
  if (loja.ler().tipo === 'validando') void loja.validar();
  return roteador;
}

/** Fecha o que os testes abriram: a tela, as lojas, os avisos, o armazenamento e o tema. */
export function fecharOChat() {
  cleanup();
  for (const loja of lojas) loja.parar();
  lojas = [];
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
}

/** O chat de quem ainda não tem nada: sem não lidas, sem conversas e sem chamados. */
export const CHAT_VAZIO: ServidorDeTeste = {
  'GET /api/chat/resumo': () => Response.json({ naoLidas: 0, chamadosComRespostaNova: 0 }),
  'GET /api/chat/conversas': () => Response.json({ equipesECanais: [], recentes: [] }),
  'GET /api/chat/chamados': () => Response.json({ abertos: [], resolvidos: [], seguintes: false }),
};

/**
 * A sessão de quem usa o chat, com o servidor do chat vazio por baixo do que o teste preparar, no fuso
 * dos mockups: as horas na tela não dependem do fuso da máquina que roda o teste.
 */
export const comOChat = (
  servidor: ServidorDeTeste = {},
  doServidor: Partial<ServidorDaSessao> = {},
) =>
  sessaoAtiva(
    naOrganizacao('chat.usar'),
    { ...CHAT_VAZIO, ...servidor },
    { regiao: { fuso: FUSO_DOS_MOCKUPS } },
    {},
    doServidor,
  );
