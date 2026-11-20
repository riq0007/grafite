// O app do chat (spec modulo-chat, "App do chat"): a entrada, que volta ao endereço pedido, a conta
// sem o chat, o módulo desligado, o servidor que não responde, a trilha e o menu da conta.
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarLojaDaSessao, type LojaDaSessao } from '../sessao/loja.ts';
import { pagina } from '../sessao/pagina.ts';
import {
  estadoDaSessaoAtiva,
  naOrganizacao,
  type ServidorDeTeste,
  sessaoAtiva,
  sessaoDesconhecida,
} from '../teste/sessao.ts';
import { AppDoChat } from './AppDoChat.tsx';
import { criarRoteadorDoChat } from './rotas.tsx';

const CONVERSA = '0199a6e0-0000-7000-8000-00000000c0a1';

let lojas: LojaDaSessao[] = [];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const loja of lojas) loja.parar();
  lojas = [];
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

/** Abre o app no endereço, como a entrada dele: a sessão ainda por validar é validada ali. */
function abrir(endereco: string, loja: LojaDaSessao) {
  lojas.push(loja);
  const roteador = criarRoteadorDoChat(createMemoryHistory({ initialEntries: [endereco] }));
  render(<AppDoChat roteador={roteador} sessao={loja} />);
  if (loja.ler().tipo === 'validando') void loja.validar();
  return roteador;
}

/** Um servidor que responde os pedidos preparados e as notificações, que o app lê com a sessão. */
const buscarEm = (servidor: ServidorDeTeste) => async (pedido: Request) => {
  const caminho = `${pedido.method} ${new URL(pedido.url).pathname}`;
  const responder = servidor[caminho];
  if (responder) return responder(pedido);
  if (caminho === 'GET /api/notificacoes') {
    return Response.json({ itens: [], naoLidas: 0, proximo: null });
  }
  throw new Error(`O teste não preparou o servidor para ${caminho}.`);
};

/** O GET /api/sessao de quem ainda não entrou. */
const semSessao = () =>
  Response.json({
    ambiente: 'producao',
    organizacao: {
      nome: 'Empresa de exemplo',
      preferencias: {},
      operaOServidor: false,
      modulosDesligados: [],
    },
    sessao: null,
  });

const trilha = () => screen.findByRole('navigation', { name: 'Vistas do chat' });
const nomesDosLinks = (lugar: HTMLElement) =>
  within(lugar)
    .queryAllByRole('link')
    .map((link) => link.textContent);

describe('o app do chat', () => {
  it('sem a sessão, mostra a entrada e, depois dela, abre o chat no endereço pedido', async () => {
    const roteador = abrir(
      `/chat/c/${CONVERSA}`,
      criarLojaDaSessao({
        buscar: buscarEm({
          'GET /api/sessao': semSessao,
          'POST /api/sessao': () => estadoDaSessaoAtiva(naOrganizacao('chat.usar')),
        }),
      }),
    );
    await screen.findByRole('heading', { name: 'Entrar' });
    expect(screen.queryByRole('navigation', { name: 'Vistas do chat' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: 'ana.souza' } });
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'cavalo bateria grampo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(
      await within(await trilha()).findByRole('link', { name: 'Chat', current: 'page' }),
    ).toBeTruthy();
    expect(roteador.state.location.pathname).toBe(`/chat/c/${CONVERSA}`);
    expect(screen.queryByRole('heading', { name: 'Entrar' })).toBeNull();
  });

  it('com chat.usar, abre a vista pedida, com a trilha na ordem e a vista marcada', async () => {
    abrir('/chat/equipes', sessaoAtiva(naOrganizacao('chat.usar')));
    const lugar = await trilha();
    expect(nomesDosLinks(lugar)).toEqual(['Chat', 'Equipes', 'Chamados', 'Avisos']);
    expect(within(lugar).getByRole('link', { current: 'page' }).textContent).toBe('Equipes');
    expect(await screen.findByRole('heading', { level: 1, name: 'Equipes' })).toBeTruthy();
  });

  it('cada item da trilha leva à vista dele, sem recarregar a página', async () => {
    const roteador = abrir('/chat', sessaoAtiva(naOrganizacao('chat.usar')));
    const lugar = await trilha();
    expect(within(lugar).getByRole('link', { current: 'page' }).textContent).toBe('Chat');
    fireEvent.click(within(lugar).getByRole('link', { name: 'Avisos' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/chat/avisos'));
    expect(within(lugar).getByRole('link', { current: 'page' }).textContent).toBe('Avisos');
    expect(await screen.findByRole('heading', { level: 1, name: 'Avisos' })).toBeTruthy();
  });

  it('o chamado aberto fica na vista Chamados', async () => {
    abrir('/chat/chamados/1041', sessaoAtiva(naOrganizacao('chat.usar')));
    expect(within(await trilha()).getByRole('link', { current: 'page' }).textContent).toBe(
      'Chamados',
    );
  });

  it.each([
    ['/chat/Equipes', 'Equipes'],
    ['/chat/Chamados/1041', 'Chamados'],
  ])(
    'o endereço com maiúsculas, como %s, marca a vista dele, como o roteador o casa',
    async (endereco, vista) => {
      abrir(endereco, sessaoAtiva(naOrganizacao('chat.usar')));
      expect(within(await trilha()).getByRole('link', { current: 'page' }).textContent).toBe(vista);
    },
  );

  it('sem o módulo Chamados, a trilha fica sem Chamados', async () => {
    abrir(
      '/chat',
      sessaoAtiva(naOrganizacao('chat.usar'), {}, {}, {}, { modulosDesligados: ['chamados'] }),
    );
    expect(nomesDosLinks(await trilha())).toEqual(['Chat', 'Equipes', 'Avisos']);
  });

  it('sem chat.usar, diz que a conta não tem acesso ao chat, com a quem pedir, sem as vistas', async () => {
    abrir(
      '/chat/c/0199a6e0-0000-7000-8000-00000000c0a1',
      sessaoAtiva([], {
        'GET /api/acesso/administradores': () =>
          Response.json({ administradores: ['Ana Souza', 'Bruno Lima'] }),
      }),
    );
    expect(await screen.findByText('Você não tem acesso ao chat.')).toBeTruthy();
    expect(await screen.findByText('Peça acesso a Ana Souza ou Bruno Lima.')).toBeTruthy();
    expect(nomesDosLinks(await trilha())).toEqual([]);
    // O menu da conta continua no pé da trilha, para sair.
    expect(screen.getByRole('button', { name: 'Ana Souza' })).toBeTruthy();
  });

  it.each([
    ['para quem usa o chat', naOrganizacao('chat.usar')],
    ['também sem chat.usar', []],
  ])('com o módulo desligado, diz que o chat está desligado, %s', async (_caso, permissoes) => {
    abrir('/chat', sessaoAtiva(permissoes, {}, {}, {}, { modulosDesligados: ['chat'] }));
    expect(await screen.findByText('O chat está desligado nesta organização.')).toBeTruthy();
    expect(
      screen.getByText('Peça a quem define os padrões da organização para ligá-lo.'),
    ).toBeTruthy();
    expect(screen.queryByText('Você não tem acesso ao chat.')).toBeNull();
    expect(nomesDosLinks(await trilha())).toEqual([]);
  });

  it('com o módulo desligado, quem define os padrões sabe onde ligá-lo', async () => {
    abrir(
      '/chat',
      sessaoAtiva(naOrganizacao('organizacao.editar'), {}, {}, {}, { modulosDesligados: ['chat'] }),
    );
    expect(await screen.findByText('O chat está desligado nesta organização.')).toBeTruthy();
    expect(
      screen.getByText('Você pode ligá-lo na seção Módulos da Administração do Grafite.'),
    ).toBeTruthy();
  });

  it('sem resposta do servidor, diz que está sem conexão e abre o chat quando ele volta', async () => {
    abrir('/chat/avisos', sessaoDesconhecida(naOrganizacao('chat.usar')));
    expect(await screen.findByText('Sem conexão com o servidor.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ana Souza' })).toBeNull();
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(
      await within(await trilha()).findByRole('link', { name: 'Avisos', current: 'page' }),
    ).toBeTruthy();
  });

  it.each(['/chat/c/abc/outra', '/chat/equipes/outra', '/chat/nada'])(
    'um endereço que não existe no chat, como %s, diz que a página não foi encontrada, sem vista marcada',
    async (endereco) => {
      abrir(endereco, sessaoAtiva(naOrganizacao('chat.usar')));
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Página não encontrada' }),
      ).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Ir para o Chat' }).getAttribute('href')).toBe(
        '/chat',
      );
      const lugar = await trilha();
      expect(nomesDosLinks(lugar)).toEqual(['Chat', 'Equipes', 'Chamados', 'Avisos']);
      expect(within(lugar).queryByRole('link', { current: 'page' })).toBeNull();
    },
  );
});

describe('o menu da conta', () => {
  const abrirOMenu = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Ana Souza' }));
    return screen.findByRole('menu', { name: 'Ana Souza' });
  };

  it('fica no pé da trilha, com as iniciais, o tema e "Sair"', async () => {
    abrir('/chat', sessaoAtiva(naOrganizacao('chat.usar')));
    const conta = within(await trilha()).getByRole('button', { name: 'Ana Souza' });
    expect(conta.textContent).toBe('AS');
    const menu = await abrirOMenu();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Tema', 'Sair']);
  });

  it('com foto, mostra a foto da pessoa da conta', async () => {
    abrir(
      '/chat',
      sessaoAtiva(
        naOrganizacao('chat.usar'),
        {},
        {},
        { foto: { id: '0199a6e0-0000-7000-8000-0000000000f1' } },
      ),
    );
    const conta = within(await trilha()).getByRole('button', { name: 'Ana Souza' });
    expect(conta.querySelector('img')?.getAttribute('srcset')).toContain(
      '/api/conta/foto/0199a6e0-0000-7000-8000-0000000000f1/64 64w',
    );
  });

  it('o tema troca na hora a aparência do app', async () => {
    abrir(
      '/chat',
      sessaoAtiva(naOrganizacao('chat.usar'), {
        'PATCH /api/conta/preferencias': () => Response.json({ aparencia: { tema: 'nevoa' } }),
      }),
    );
    const menu = await abrirOMenu();
    const tema = within(menu).getByRole('menuitem', { name: 'Tema' });
    act(() => tema.focus());
    fireEvent.keyDown(tema, { key: 'ArrowRight' });
    const temas = await screen.findByRole('menu', { name: 'Tema' });
    expect(
      within(temas)
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent),
    ).toEqual([
      'Grafite',
      'Meia-noite',
      'OLED',
      'Névoa',
      'Papel',
      'Alto contraste',
      'Personalizado',
    ]);
    expect(within(temas).getByRole('menuitemradio', { checked: true }).textContent).toBe('Grafite');
    fireEvent.click(within(temas).getByRole('menuitemradio', { name: 'Névoa' }));
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('nevoa'));
  });

  it('"Sair" encerra a sessão e recarrega a página', async () => {
    const recarregar = vi.spyOn(pagina, 'recarregar').mockImplementation(() => {});
    const pedidos: string[] = [];
    abrir(
      '/chat',
      sessaoAtiva(naOrganizacao('chat.usar'), {
        'DELETE /api/sessao': (pedido) => {
          pedidos.push(pedido.headers.get('x-grafite-csrf') ?? '');
          return new Response(null, { status: 204 });
        },
      }),
    );
    fireEvent.click(within(await abrirOMenu()).getByRole('menuitem', { name: 'Sair' }));
    await waitFor(() => expect(recarregar).toHaveBeenCalledTimes(1));
    expect(pedidos).toEqual(['csrf-de-teste']);
  });

  it('"Sair" sem conexão avisa e não recarrega', async () => {
    const recarregar = vi.spyOn(pagina, 'recarregar').mockImplementation(() => {});
    abrir(
      '/chat',
      sessaoAtiva(naOrganizacao('chat.usar'), {
        'DELETE /api/sessao': () => {
          throw new TypeError('Failed to fetch');
        },
      }),
    );
    fireEvent.click(within(await abrirOMenu()).getByRole('menuitem', { name: 'Sair' }));
    await waitFor(() =>
      expect(filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo)).toContain(
        'Sem conexão com o servidor. Tente de novo.',
      ),
    );
    expect(recarregar).not.toHaveBeenCalled();
  });
});
