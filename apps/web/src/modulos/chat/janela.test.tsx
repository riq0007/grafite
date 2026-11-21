// A janela do Chat na casca (spec modulo-chat, "Chat na casca"; spec pwa, "Abertura pelo push";
// change chat-com-chamados, design, decisão 12): o selo do Chat no dock, que o evento do chat relê; a
// casca recarregada com a janela do Chat aberta, que volta nela, com as vistas sem os Avisos, que
// ficam no sino; "Abrir no app do chat", com o mesmo lugar em /chat numa janela nova; e os endereços
// do app do chat, como o da notificação e o do toque no push, que abrem o mesmo lugar na janela do
// Chat, com a busca.
import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { criarClienteDeConsultas } from '../../api/consultas.ts';
import { criarCanalDeEventos } from '../../eventos/canal.ts';
import { criarRoteador } from '../../rotas/arvore.ts';
import type { LojaDaSessao } from '../../sessao/loja.ts';
import { comOChat } from '../../teste/chat.tsx';
import {
  CONVERSA,
  id,
  mensagemNaTela,
  PAULO,
  servidorDaConversa,
  varias,
} from '../../teste/conversaDoChat.ts';
import { noComputador } from '../../teste/postura.ts';
import type { ServidorDeTeste } from '../../teste/sessao.ts';

type Notificacao = components['schemas']['NotificacaoNaLista'];

let lojas: LojaDaSessao[] = [];

afterEach(() => {
  cleanup();
  for (const loja of lojas) loja.parar();
  lojas = [];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
  sessionStorage.clear();
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

/** A casca no endereço, no computador, com a sessão de quem usa o chat e o servidor dado. */
function abrirACasca(endereco: string, servidor: ServidorDeTeste = {}) {
  noComputador();
  const loja = comOChat(servidor);
  lojas.push(loja);
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  const canal = criarCanalDeEventos();
  render(
    <App
      roteador={roteador}
      sessao={loja}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
  return { roteador, canal };
}

const dock = () => screen.findByRole('navigation', { name: 'Dock' });
const vistasDoChat = () => screen.findByRole('navigation', { name: 'Vistas do chat' });

const FINANCEIRO = '0199a6e0-0000-7000-8000-0000000000e1';

/** A vista Equipes com a Equipe Financeiro, de Ana Souza e Fernanda Rocha. */
const COM_O_FINANCEIRO: ServidorDeTeste = {
  'GET /api/chat/equipes': () =>
    Response.json({ itens: [{ id: FINANCEIRO, tipo: 'equipe', nome: 'Financeiro', pessoas: 2 }] }),
  [`GET /api/chat/conversas/${FINANCEIRO}/pessoas`]: () =>
    Response.json({
      pessoas: [
        {
          conta: '0199a6e0-0000-7000-8000-0000000000c1',
          nome: 'Ana Souza',
          daTi: true,
          foto: null,
        },
        {
          conta: '0199a6e0-0000-7000-8000-0000000000c2',
          nome: 'Fernanda Rocha',
          daTi: false,
          foto: null,
        },
      ],
    }),
};

/** A conversa direta com Paulo Nunes, com 5 mensagens, e o endereço da terceira no app do chat. */
function conversaComPaulo() {
  const { servidor, estado } = servidorDaConversa({
    cabecalho: { tipo: 'direta', nome: 'Paulo Nunes', outra: PAULO, pessoas: null },
    mensagens: varias(1, 5),
  });
  return { servidor, estado, destino: `/chat/c/${CONVERSA}?m=${id(3)}` };
}

/** Na conversa da janela do Chat, na mensagem do endereço, marcada, com o Chat atual no dock. */
async function naTerceiraMensagem(
  roteador: ReturnType<typeof criarRoteador>,
  estado: { paginas: string[] },
) {
  await waitFor(() =>
    expect(roteador.state.location.href).toBe(`/conversas/c/${CONVERSA}?m=${id(3)}`),
  );
  expect(await screen.findByRole('region', { name: 'Paulo Nunes' })).toBeTruthy();
  const marcada = await mensagemNaTela('Mensagem 3');
  expect(marcada.getAttribute('aria-current')).toBe('true');
  expect(estado.paginas[0]).toBe(`em=${id(3)}`);
  // Chegou de outro módulo: o foco vai ao nome da conversa, que o leitor de tela anuncia.
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 2, name: 'Paulo Nunes' }),
    ),
  );
  expect(
    within(await dock())
      .getByRole('button', { name: 'Chat' })
      .getAttribute('aria-current'),
  ).toBe('page');
}

describe('o Chat na casca', () => {
  it('o Chat do dock tem o selo do total do chat mais os chamados com resposta nova, que o evento do chat relê', async () => {
    let resumo = { naoLidas: 2, chamadosComRespostaNova: 0 };
    const { canal } = abrirACasca('/ajustes', {
      'GET /api/chat/resumo': () => Response.json(resumo),
    });
    const antes = await within(await dock()).findByRole('button', { name: 'Chat, 2 não lidas' });
    expect(within(antes).getByText('2').getAttribute('aria-hidden')).toBe('true');
    resumo = { naoLidas: 3, chamadosComRespostaNova: 1 };
    canal.publicar({
      id: 'evento-1',
      tipo: 'chat.mudou',
      momento: new Date().toISOString(),
      alvo: null,
    });
    const depois = await within(await dock()).findByRole('button', {
      name: 'Chat, 3 não lidas, 1 chamado com resposta nova',
    });
    expect(within(depois).getByText('4')).toBeTruthy();
  });

  it('recarregar a casca com a janela do Chat na Equipe Financeiro volta nela, e não no app do chat', async () => {
    const { roteador } = abrirACasca(`/conversas/equipes/${FINANCEIRO}`, COM_O_FINANCEIRO);
    expect(await screen.findByRole('heading', { level: 2, name: 'Financeiro' })).toBeTruthy();
    expect(screen.getByText('Equipe · 2 pessoas')).toBeTruthy();
    expect(
      within(await dock())
        .getByRole('button', { name: 'Chat' })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(roteador.state.location.pathname).toBe(`/conversas/equipes/${FINANCEIRO}`);
    // As vistas levam aos endereços da janela, e os Avisos ficam no sino da casca.
    const trilha = await vistasDoChat();
    const vistas = within(trilha).getAllByRole('link');
    expect(vistas.map((vista) => vista.getAttribute('href'))).toEqual([
      '/conversas',
      '/conversas/equipes',
      '/conversas/chamados',
    ]);
    expect(within(trilha).getByRole('link', { name: 'Chat' })).toBeTruthy();
    expect(within(trilha).getByRole('link', { name: 'Equipes' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(within(trilha).getByRole('link', { name: 'Chamados' })).toBeTruthy();
    expect(within(trilha).queryByRole('link', { name: /^Avisos/ })).toBeNull();
  });

  it('chegar ao Chat pelo dock leva o foco ao título da lista, e trocar de vista dentro dele o deixa onde estava', async () => {
    abrirACasca('/ajustes', COM_O_FINANCEIRO);
    await screen.findByRole('heading', { level: 1, name: 'Aparência' });
    fireEvent.click(within(await dock()).getByRole('button', { name: 'Chat' }));
    const titulo = await screen.findByRole('heading', { level: 1, name: 'Chat' });
    await waitFor(() => expect(document.activeElement).toBe(titulo));
    const equipes = within(await vistasDoChat()).getByRole('link', { name: 'Equipes' });
    equipes.focus();
    fireEvent.click(equipes);
    await screen.findByRole('heading', { level: 1, name: 'Equipes' });
    await new Promise((resolver) => setTimeout(resolver, 50));
    expect(document.activeElement).toBe(equipes);
  });

  it('"Abrir no app do chat" abre o mesmo lugar em /chat, numa janela nova', async () => {
    const abrirJanela = vi.spyOn(window, 'open').mockReturnValue(null);
    abrirACasca(`/conversas/equipes/${FINANCEIRO}`, COM_O_FINANCEIRO);
    await screen.findByRole('heading', { level: 2, name: 'Financeiro' });
    fireEvent.click(
      within(await vistasDoChat()).getByRole('button', { name: 'Abrir no app do chat' }),
    );
    expect(abrirJanela).toHaveBeenCalledWith(`/chat/equipes/${FINANCEIRO}`, '_blank', 'noopener');
  });

  it('"Abrir no app do chat" na direta que ainda não nasceu abre o Chat do app, porque a pessoa não vai à janela nova', async () => {
    const abrirJanela = vi.spyOn(window, 'open').mockReturnValue(null);
    abrirACasca(`/conversas/direta/${PAULO.conta}`, COM_O_FINANCEIRO);
    await screen.findByText('Escolha a pessoa de novo em Nova conversa.');
    fireEvent.click(
      within(await vistasDoChat()).getByRole('button', { name: 'Abrir no app do chat' }),
    );
    expect(abrirJanela).toHaveBeenCalledWith('/chat', '_blank', 'noopener');
  });

  it('o "Abrir" da notificação do chat, na central da casca, abre a conversa na janela do Chat, na mensagem', async () => {
    const { servidor, estado, destino } = conversaComPaulo();
    const notificacao: Notificacao = {
      id: 'n1',
      severidade: 'info',
      titulo: 'Mensagem de Paulo Nunes',
      descricao: 'Mensagem 3',
      origem: 'Chat',
      destino,
      criadaEm: new Date().toISOString(),
      lida: false,
      alerta: null,
    };
    const { roteador } = abrirACasca('/ajustes', {
      ...servidor,
      'GET /api/notificacoes': () =>
        Response.json({ itens: [notificacao], naoLidas: 1, proximo: null }),
      'POST /api/notificacoes/n1/leitura': () => new Response(null, { status: 204 }),
    });
    fireEvent.click(await screen.findByRole('button', { name: /^Notificações,/ }));
    const central = await screen.findByRole('dialog', { name: 'Notificações' });
    const item = (await within(central).findByText('Mensagem de Paulo Nunes')).closest(
      'li',
    ) as HTMLElement;
    fireEvent.click(within(item).getByRole('button', { name: 'Abrir' }));
    await naTerceiraMensagem(roteador, estado);
  });

  it('o toque no push do chat, com a casca aberta, abre a conversa na janela do Chat, na mensagem', async () => {
    const container = new EventTarget();
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container });
    const { servidor, estado, destino } = conversaComPaulo();
    const { roteador } = abrirACasca('/ajustes', servidor);
    await screen.findByRole('heading', { level: 1, name: 'Aparência' });
    container.dispatchEvent(
      new MessageEvent('message', { data: { tipo: 'grafite:abrir', destino } }),
    );
    await naTerceiraMensagem(roteador, estado);
  });
});
