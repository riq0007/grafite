// O app do chat nos testes: a abertura num endereço, como a entrada dele, o servidor do chat vazio e
// a sessão de quem usa o chat, com o que o teste preparar por cima.
import type { Permissao } from '@grafite/domain';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, render } from '@testing-library/react';
import { AppDoChat } from '../chat/AppDoChat.tsx';
import { criarRoteadorDoChat } from '../chat/rotas.tsx';
import type { CanalDeEventos } from '../eventos/canal.ts';
import { ProvedorDoAmbienteDoPush } from '../notificacoes/ambienteDoPush.tsx';
import type { AmbienteDoPush } from '../notificacoes/push.ts';
import type { LojaDaSessao, ServidorDaSessao } from '../sessao/loja.ts';
import { FUSO_DOS_MOCKUPS } from './chamados.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from './sessao.ts';

let lojas: LojaDaSessao[] = [];

/**
 * Abre o app no endereço, como a entrada dele: a sessão ainda por validar é validada ali. O navegador
 * do push, sem um dado, é o do jsdom, sem o push.
 */
export function abrirOChat(
  endereco: string,
  loja: LojaDaSessao,
  {
    chamadoNovo,
    canal,
    ambiente,
  }: { chamadoNovo?: number; canal?: CanalDeEventos; ambiente?: AmbienteDoPush } = {},
) {
  lojas.push(loja);
  const roteador = criarRoteadorDoChat(createMemoryHistory({ initialEntries: [endereco] }));
  const app = (
    <AppDoChat roteador={roteador} sessao={loja} chamadoNovo={chamadoNovo} canal={canal} />
  );
  render(
    ambiente ? <ProvedorDoAmbienteDoPush ambiente={ambiente}>{app}</ProvedorDoAmbienteDoPush> : app,
  );
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

/** O chat de quem ainda não tem nada: sem não lidas, sem conversas, sem chamados e sem equipes. */
export const CHAT_VAZIO: ServidorDeTeste = {
  'GET /api/chat/resumo': () => Response.json({ naoLidas: 0, chamadosComRespostaNova: 0 }),
  'GET /api/chat/conversas': () => Response.json({ equipesECanais: [], recentes: [] }),
  'GET /api/chat/chamados': () => Response.json({ abertos: [], resolvidos: [], seguintes: false }),
  'GET /api/chat/equipes': () => Response.json({ itens: [] }),
};

/**
 * A sessão de quem usa o chat, com o servidor do chat vazio por baixo do que o teste preparar, no fuso
 * dos mockups: as horas na tela não dependem do fuso da máquina que roda o teste. As permissões vão
 * além do `chat.usar`, como o `chamados.pedir`.
 */
export const comOChat = (
  servidor: ServidorDeTeste = {},
  doServidor: Partial<ServidorDaSessao> = {},
  permissoes: Permissao[] = [],
) =>
  sessaoAtiva(
    naOrganizacao('chat.usar', ...permissoes),
    { ...CHAT_VAZIO, ...servidor },
    { regiao: { fuso: FUSO_DOS_MOCKUPS } },
    {},
    doServidor,
  );
