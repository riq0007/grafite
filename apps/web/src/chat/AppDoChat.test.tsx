// O app do chat (spec modulo-chat, "App do chat", "Trilha do chat" e "Lista do Chat"): a entrada,
// que volta ao endereço pedido, a conta sem o chat, o módulo desligado, o servidor que não responde,
// a trilha, com os contadores, a lista do Chat e o menu da conta.
import { filaDeAvisos } from '@grafite/ui';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarCanalDeEventos } from '../eventos/canal.ts';
import { criarLojaDaSessao } from '../sessao/loja.ts';
import { pagina } from '../sessao/pagina.ts';
import { abrirOChat as abrir, CHAT_VAZIO, comOChat, fecharOChat } from '../teste/chat.tsx';
import {
  estadoDaSessaoAtiva,
  naOrganizacao,
  type ServidorDeTeste,
  sessaoAtiva,
  sessaoDesconhecida,
} from '../teste/sessao.ts';
import type { ChamadoDeQuemParticipa, ConversaNaLista, PessoaDoChat } from './consultas.ts';
import { naTelaDeUmItem, vistaDaTela } from './MolduraDoChat.tsx';

const CONVERSA = '0199a6e0-0000-7000-8000-00000000c0a1';

afterEach(() => {
  fecharOChat();
  vi.restoreAllMocks();
});

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
          ...CHAT_VAZIO,
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
    abrir('/chat/equipes', comOChat());
    const lugar = await trilha();
    expect(nomesDosLinks(lugar)).toEqual(['Chat', 'Equipes', 'Chamados', 'Avisos']);
    expect(within(lugar).getByRole('link', { current: 'page' }).textContent).toBe('Equipes');
    expect(await screen.findByRole('heading', { level: 1, name: 'Equipes' })).toBeTruthy();
  });

  it('cada item da trilha leva à vista dele, sem recarregar a página', async () => {
    const roteador = abrir('/chat', comOChat());
    const lugar = await trilha();
    expect(within(lugar).getByRole('link', { current: 'page' }).textContent).toBe('Chat');
    fireEvent.click(within(lugar).getByRole('link', { name: 'Avisos' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/chat/avisos'));
    expect(within(lugar).getByRole('link', { current: 'page' }).textContent).toBe('Avisos');
    expect(await screen.findByRole('heading', { level: 1, name: 'Avisos' })).toBeTruthy();
  });

  it.each([
    ['/chat/chamados/1041', 'Chat'],
    ['/chat/chamados/1041?vista=chamados', 'Chamados'],
    ['/chat/direta/0199a6e0-0000-7000-8000-0000000000c2', 'Chat'],
  ])('o endereço %s fica na vista %s', async (endereco, vista) => {
    abrir(endereco, comOChat());
    expect(within(await trilha()).getByRole('link', { current: 'page' }).textContent).toBe(vista);
  });

  it.each([
    ['/chat/Equipes', 'Equipes'],
    ['/chat/Chamados/1041?vista=chamados', 'Chamados'],
  ])(
    'o endereço com maiúsculas, como %s, marca a vista dele, como o roteador o casa',
    async (endereco, vista) => {
      abrir(endereco, comOChat());
      expect(within(await trilha()).getByRole('link', { current: 'page' }).textContent).toBe(vista);
    },
  );

  it('sem o módulo Chamados, a trilha fica sem Chamados', async () => {
    abrir('/chat', comOChat({}, { modulosDesligados: ['chamados'] }));
    expect(nomesDosLinks(await trilha())).toEqual(['Chat', 'Equipes', 'Avisos']);
  });

  it.each(['/chat/chamados', '/chat/chamados/1041?vista=chamados'])(
    'sem o módulo Chamados, a vista Chamados em %s diz que ele está desligado, sem pedir os chamados',
    async (endereco) => {
      const pedidos: string[] = [];
      const contar = (pedido: Request) => {
        pedidos.push(new URL(pedido.url).pathname);
        return Response.json({ abertos: [], resolvidos: [], seguintes: false });
      };
      abrir(
        endereco,
        comOChat(
          { 'GET /api/chat/chamados': contar, 'GET /api/chat/chamados/1041': contar },
          { modulosDesligados: ['chamados'] },
        ),
      );
      expect(
        await screen.findByText('O módulo Chamados está desligado nesta organização.'),
      ).toBeTruthy();
      expect(
        screen.getByText('Peça a quem define os padrões da organização para ligá-lo.'),
      ).toBeTruthy();
      expect(screen.queryByRole('heading', { level: 1, name: 'Chamados' })).toBeNull();
      expect(pedidos).toEqual([]);
    },
  );

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
    abrir('/chat/avisos', sessaoDesconhecida(naOrganizacao('chat.usar'), CHAT_VAZIO));
    expect(await screen.findByText('Sem conexão com o servidor.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ana Souza' })).toBeNull();
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(
      await within(await trilha()).findByRole('link', { name: 'Avisos', current: 'page' }),
    ).toBeTruthy();
  });

  it.each(['/chat/c/abc/outra', '/chat/equipes/abc/outra', '/chat/nada'])(
    'um endereço que não existe no chat, como %s, diz que a página não foi encontrada, sem vista marcada',
    async (endereco) => {
      abrir(endereco, comOChat());
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

const CONTA_DO_PAULO = '0199a6e0-0000-7000-8000-0000000000c2';
const CONTA_DA_BRUNA = '0199a6e0-0000-7000-8000-0000000000c3';
const CONVERSA_DA_BRUNA = '0199a6e0-0000-7000-8000-00000000c0a2';
const CANAL_DOS_AVISOS = '0199a6e0-0000-7000-8000-00000000c0a3';

/** Um chamado de quem participa, aberto, na triagem, com o que o teste mudar. */
const umChamado = (
  numero: number,
  titulo: string,
  mudar: Partial<ChamadoDeQuemParticipa> = {},
): ChamadoDeQuemParticipa => ({
  numero,
  titulo,
  tipo: { nome: 'Computador', icone: 'computador' },
  situacao: 'triagem',
  fechado: false,
  situacaoEmTexto: 'Aberto',
  abertoEm: '2026-11-18T12:00:00.000Z',
  resolvidoEm: null,
  atende: null,
  respostaNova: 0,
  ultimaMensagem: null,
  ...mudar,
});

/**
 * Os chamados de Ana: o 1045, o aberto mais novo, o 1041, que aguarda por ela, com uma resposta
 * nova, o 1044, em atendimento, e o 1030, resolvido, que ainda se reabre.
 */
const CHAMADOS_DA_ANA = {
  abertos: [
    umChamado(1044, 'O monitor pisca', {
      situacao: 'em-atendimento',
      situacaoEmTexto: 'Em andamento',
      abertoEm: '2026-11-19T09:00:00.000Z',
      atende: 'Bruna Alves',
    }),
    umChamado(1041, 'A impressora do segundo andar não imprime', {
      situacao: 'aguardando',
      situacaoEmTexto: 'Aguardando você',
      abertoEm: '2026-11-17T10:00:00.000Z',
      respostaNova: 1,
    }),
    umChamado(1045, 'Trocar o mouse', { abertoEm: '2026-11-20T08:00:00.000Z' }),
  ],
  resolvidos: [
    umChamado(1030, 'Instalar o Excel', {
      situacao: 'resolvido',
      situacaoEmTexto: 'Resolvido',
      abertoEm: '2026-11-10T08:00:00.000Z',
      resolvidoEm: '2026-11-12T15:00:00.000Z',
    }),
  ],
  seguintes: false,
};

const umaConversa = (
  id: string,
  nome: string,
  mudar: Partial<ConversaNaLista> = {},
): ConversaNaLista => ({
  id,
  tipo: 'direta',
  nome,
  naoLidas: 0,
  silenciada: false,
  ultimaMensagemEm: '2026-11-20T09:00:00.000Z',
  outra: null,
  ...mudar,
});

/**
 * As conversas de Ana: o canal dos avisos, silenciado, com mais de 99 não lidas, que a API conta até
 * 100, e a direta com Bruna, da TI.
 */
const CONVERSAS_DA_ANA = {
  equipesECanais: [
    umaConversa(CANAL_DOS_AVISOS, 'avisos-da-ti', {
      tipo: 'canal',
      naoLidas: 100,
      silenciada: true,
    }),
  ],
  recentes: [
    umaConversa(CONVERSA_DA_BRUNA, 'Bruna Alves (TI)', {
      naoLidas: 3,
      outra: { conta: CONTA_DA_BRUNA, nome: 'Bruna Alves', daTi: true, foto: null },
    }),
  ],
};

/** O servidor com os chamados e as conversas de Ana. */
const DA_ANA: ServidorDeTeste = {
  'GET /api/chat/chamados': () => Response.json(CHAMADOS_DA_ANA),
  'GET /api/chat/conversas': () => Response.json(CONVERSAS_DA_ANA),
};

/** Bruna, da TI, com quem Ana já fala, e Paulo, com quem ainda não. */
const PESSOAS: PessoaDoChat[] = [
  {
    conta: CONTA_DA_BRUNA,
    nome: 'Bruna Alves',
    daTi: true,
    foto: null,
    conversa: CONVERSA_DA_BRUNA,
  },
  { conta: CONTA_DO_PAULO, nome: 'Paulo Nunes', daTi: false, foto: null, conversa: null },
];

/** A busca das pessoas pelo nome, como a API a faz, com o que se buscou. */
const buscaDasPessoas =
  (buscas: string[] = []) =>
  (pedido: Request) => {
    const busca = new URL(pedido.url).searchParams.get('busca') ?? '';
    buscas.push(busca);
    return Response.json({
      pessoas: PESSOAS.filter(({ nome }) => nome.toLowerCase().includes(busca.toLowerCase())),
    });
  };

const listaDoChat = () => screen.findByRole('region', { name: 'Chat' });

/** A seção da lista, pelo título dela. */
const secao = (lista: HTMLElement, titulo: string) => {
  const lugar = within(lista).getByRole('heading', { level: 2, name: titulo }).parentElement;
  if (!lugar) throw new Error(`A seção ${titulo} não está na lista.`);
  return lugar;
};

const titulosDasSecoes = (lista: HTMLElement) =>
  within(lista)
    .getAllByRole('heading', { level: 2 })
    .map((titulo) => titulo.textContent);

const enderecos = (lugar: HTMLElement) =>
  within(lugar)
    .getAllByRole('link')
    .map((link) => link.getAttribute('href'));

/** O cartão do chamado, pelo número. */
const cartaoDoChamado = (lugar: HTMLElement, numero: number) => {
  const cartao = lugar.querySelector<HTMLElement>(`a[href="/chat/chamados/${numero}"]`);
  if (!cartao) throw new Error(`O chamado ${numero} não está na lista.`);
  return cartao;
};

/** O número à vista do contador do item e o tom dele. */
const contadorDe = (item: HTMLElement) => {
  const contador = item.querySelector('[data-tom]');
  return contador && [contador.textContent, contador.getAttribute('data-tom')];
};

/** Abre "Nova conversa" e digita no campo da pessoa. */
async function buscarNaNovaConversa(texto: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'Nova conversa' }));
  const dialogo = await screen.findByRole('dialog', { name: 'Nova conversa' });
  const campo = within(dialogo).getByRole('combobox', { name: 'Pessoa' });
  act(() => campo.focus());
  fireEvent.change(campo, { target: { value: texto } });
  return dialogo;
}

describe('a trilha e a lista do Chat', () => {
  it('a trilha conta as não lidas do chat, os chamados com resposta nova e os avisos não lidos', async () => {
    abrir(
      '/chat/equipes',
      comOChat({
        'GET /api/chat/resumo': () => Response.json({ naoLidas: 4, chamadosComRespostaNova: 1 }),
        'GET /api/notificacoes': () => Response.json({ itens: [], naoLidas: 2, proximo: null }),
      }),
    );
    const lugar = await trilha();
    const chat = await within(lugar).findByRole('link', { name: 'Chat, 4 não lidas' });
    const chamados = within(lugar).getByRole('link', { name: 'Chamados, 1 com resposta nova' });
    const avisos = await within(lugar).findByRole('link', { name: 'Avisos, 2 não lidos' });
    // O número à vista, no neutro, e o dos chamados, no azul do chamado.
    expect(contadorDe(chat)).toEqual(['4', 'neutro']);
    expect(contadorDe(chamados)).toEqual(['1', 'chamado']);
    expect(contadorDe(avisos)).toEqual(['2', 'neutro']);
    expect(contadorDe(within(lugar).getByRole('link', { name: 'Equipes' }))).toBeNull();
  });

  it('a lista mostra os chamados abertos, com o novo no alto, FECHADOS recolhido e as conversas', async () => {
    abrir('/chat', comOChat(DA_ANA), { chamadoNovo: 1045 });
    const lista = await listaDoChat();
    await within(lista).findByRole('heading', { level: 2, name: 'Chamados · 3' });
    await within(lista).findByRole('heading', { level: 2, name: 'Recentes' });
    expect(titulosDasSecoes(lista)).toEqual([
      'Chamados · 3',
      'Fechados · 1',
      'Equipes e canais',
      'Recentes',
    ]);

    // CHAMADOS: o que a conta acaba de abrir, com o contorno forte, e depois o que aguarda por ela.
    const chamados = secao(lista, 'Chamados · 3');
    expect(enderecos(chamados)).toEqual([
      '/chat/chamados/1045',
      '/chat/chamados/1041',
      '/chat/chamados/1044',
    ]);
    const novo = cartaoDoChamado(chamados, 1045);
    expect(novo.hasAttribute('data-novo')).toBe(true);
    expect(within(novo).getByText('Trocar o mouse')).toBeTruthy();
    expect(within(novo).getByText('Aberto')).toBeTruthy();
    expect(within(novo).getByText('#1045')).toBeTruthy();
    expect(contadorDe(novo)).toBeNull();
    expect(novo.getAttribute('aria-label')).toBe('Trocar o mouse, Aberto, chamado 1045');
    const aguardando = cartaoDoChamado(chamados, 1041);
    expect(aguardando.hasAttribute('data-novo')).toBe(false);
    expect(within(aguardando).getByText('Aguardando você')).toBeTruthy();
    expect(contadorDe(aguardando)).toEqual(['1', 'chamado']);
    expect(aguardando.getAttribute('aria-label')).toBe(
      'A impressora do segundo andar não imprime, Aguardando você, chamado 1041, 1 resposta nova',
    );
    expect(within(cartaoDoChamado(chamados, 1044)).getByText('Em andamento')).toBeTruthy();

    // FECHADOS, recolhido, abre com um clique.
    const fechados = within(lista).getByRole('button', { name: 'Fechados · 1' });
    expect(fechados.getAttribute('aria-expanded')).toBe('false');
    expect(within(lista).queryByText('Instalar o Excel')).toBeNull();
    fireEvent.click(fechados);
    expect(fechados.getAttribute('aria-expanded')).toBe('true');
    const resolvido = cartaoDoChamado(secao(lista, 'Fechados · 1'), 1030);
    expect(within(resolvido).getByText('Instalar o Excel')).toBeTruthy();
    expect(within(resolvido).getByText('Resolvido')).toBeTruthy();

    // As conversas, com o contador: o canal silenciado, acima de 99, e a direta com Bruna.
    const canal = within(secao(lista, 'Equipes e canais')).getByRole('link', {
      name: 'avisos-da-ti, silenciada, mais de 99 não lidas',
    });
    expect(canal.getAttribute('href')).toBe(`/chat/c/${CANAL_DOS_AVISOS}`);
    expect(contadorDe(canal)).toEqual(['99+', 'neutro']);
    const direta = within(secao(lista, 'Recentes')).getByRole('link', {
      name: 'Bruna Alves (TI), 3 não lidas',
    });
    expect(direta.getAttribute('href')).toBe(`/chat/c/${CONVERSA_DA_BRUNA}`);
    expect(direta.textContent).toContain('BA');
  });

  it('o chamado novo continua no alto quando o evento relê a lista e sai quando a lista sai da tela', async () => {
    const canal = criarCanalDeEventos();
    let leituras = 0;
    abrir(
      '/chat',
      comOChat({
        'GET /api/chat/chamados': () => {
          leituras += 1;
          return Response.json(CHAMADOS_DA_ANA);
        },
      }),
      { chamadoNovo: 1045, canal },
    );
    const lista = await listaDoChat();
    await within(lista).findByRole('heading', { level: 2, name: 'Chamados · 3' });
    act(() =>
      canal.publicar({
        id: '0199a6e0-0000-7000-8000-000000000021',
        tipo: 'chamados.mudaram',
        momento: '2026-11-20T12:00:00.000Z',
        alvo: null,
      }),
    );
    await waitFor(() => expect(leituras).toBe(2));
    const chamados = secao(lista, 'Chamados · 3');
    expect(enderecos(chamados)[0]).toBe('/chat/chamados/1045');
    expect(cartaoDoChamado(chamados, 1045).hasAttribute('data-novo')).toBe(true);

    const lugar = await trilha();
    fireEvent.click(within(lugar).getByRole('link', { name: 'Equipes' }));
    await screen.findByRole('heading', { level: 1, name: 'Equipes' });
    fireEvent.click(within(lugar).getByRole('link', { name: 'Chat' }));
    const deNovo = await listaDoChat();
    await within(deNovo).findByRole('heading', { level: 2, name: 'Chamados · 3' });
    // Na ordem de sempre: o que aguarda pela conta primeiro.
    expect(enderecos(secao(deNovo, 'Chamados · 3'))).toEqual([
      '/chat/chamados/1041',
      '/chat/chamados/1045',
      '/chat/chamados/1044',
    ]);
    expect(deNovo.querySelector('[data-novo]')).toBeNull();
  });

  it('FECHADOS abre sozinho quando o chamado do endereço é um dos fechados', async () => {
    abrir('/chat/chamados/1030', comOChat(DA_ANA));
    const lista = await listaDoChat();
    const fechados = await within(lista).findByRole('button', { name: 'Fechados · 1' });
    expect(fechados.getAttribute('aria-expanded')).toBe('true');
    expect(cartaoDoChamado(lista, 1030).getAttribute('aria-current')).toBe('page');
    // Quem o fecha o fecha.
    fireEvent.click(fechados);
    expect(fechados.getAttribute('aria-expanded')).toBe('false');
    expect(within(lista).queryByText('Instalar o Excel')).toBeNull();
  });

  it.each([
    ['a conversa', `/chat/c/${CONVERSA_DA_BRUNA}`, `/chat/c/${CONVERSA_DA_BRUNA}`],
    [
      'a conversa com o id em maiúsculas',
      `/chat/c/${CONVERSA_DA_BRUNA.toUpperCase()}`,
      `/chat/c/${CONVERSA_DA_BRUNA}`,
    ],
    ['o chamado', '/chat/chamados/1041', '/chat/chamados/1041'],
  ])('%s do endereço fica marcado na lista', async (_caso, endereco, marcado) => {
    abrir(endereco, comOChat(DA_ANA));
    const lista = await listaDoChat();
    await within(lista).findByRole('heading', { level: 2, name: 'Chamados · 3' });
    await within(lista).findByRole('heading', { level: 2, name: 'Recentes' });
    expect(
      within(lista)
        .getAllByRole('link', { current: 'page' })
        .map((link) => link.getAttribute('href')),
    ).toEqual([marcado]);
  });

  it('sem chamados abertos, diz "Nenhum chamado aberto.", e as seções vazias saem da lista', async () => {
    abrir('/chat', comOChat());
    const lista = await listaDoChat();
    expect(await within(lista).findByText('Nenhum chamado aberto.')).toBeTruthy();
    expect(titulosDasSecoes(lista)).toEqual(['Chamados · 0']);
  });

  it('sem o módulo Chamados, a lista fica só com as conversas, sem pedir os chamados', async () => {
    const pedidos: string[] = [];
    abrir(
      '/chat',
      comOChat(
        {
          ...DA_ANA,
          'GET /api/chat/chamados': () => {
            pedidos.push('chamados');
            return Response.json(CHAMADOS_DA_ANA);
          },
        },
        { modulosDesligados: ['chamados'] },
      ),
    );
    const lista = await listaDoChat();
    await within(lista).findByRole('heading', { level: 2, name: 'Recentes' });
    expect(titulosDasSecoes(lista)).toEqual(['Equipes e canais', 'Recentes']);
    expect(pedidos).toEqual([]);
  });

  it('a seção que não carrega diz o motivo e tenta de novo', async () => {
    let falhar = true;
    abrir(
      '/chat',
      comOChat({
        'GET /api/chat/conversas': () =>
          falhar
            ? Response.json(
                {
                  type: 'urn:grafite:problema:interno',
                  title: 'Erro interno',
                  status: 500,
                  detail: 'Erro interno.',
                  codigoDeRastreio: 'R7K2-9QXM',
                },
                { status: 500 },
              )
            : Response.json(CONVERSAS_DA_ANA),
      }),
    );
    const lista = await listaDoChat();
    const falha = await within(lista).findByRole('alert');
    expect(falha.textContent).toContain(
      'Não foi possível carregar as conversas. Informe à TI o código R7K2-9QXM.',
    );
    falhar = false;
    fireEvent.click(within(falha).getByRole('button', { name: 'Tentar de novo' }));
    expect(await within(lista).findByRole('heading', { level: 2, name: 'Recentes' })).toBeTruthy();
    expect(within(lista).queryByRole('alert')).toBeNull();
  });

  it('"Nova conversa" acha a pessoa pelo nome e abre a direta, que ainda não nasceu', async () => {
    const buscas: string[] = [];
    const roteador = abrir('/chat', comOChat({ 'GET /api/chat/pessoas': buscaDasPessoas(buscas) }));
    const dialogo = await buscarNaNovaConversa('pau');
    await waitFor(() =>
      expect(screen.getAllByRole('option').map((opcao) => opcao.textContent)).toEqual([
        'Paulo Nunes',
      ]),
    );
    expect(buscas.at(-1)).toBe('pau');
    fireEvent.click(screen.getByRole('option', { name: 'Paulo Nunes' }));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe(`/chat/direta/${CONTA_DO_PAULO}`),
    );
    expect(dialogo.isConnected).toBe(false);
  });

  it('"Nova conversa" com quem a conta já fala abre a mesma conversa', async () => {
    const roteador = abrir('/chat', comOChat({ 'GET /api/chat/pessoas': buscaDasPessoas() }));
    await buscarNaNovaConversa('bru');
    fireEvent.click(await screen.findByRole('option', { name: 'Bruna Alves (TI)' }));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe(`/chat/c/${CONVERSA_DA_BRUNA}`),
    );
  });

  it('"Nova conversa" diz quando ninguém com o nome usa o chat', async () => {
    abrir('/chat', comOChat({ 'GET /api/chat/pessoas': buscaDasPessoas() }));
    const dialogo = await buscarNaNovaConversa('xavier');
    expect(await within(dialogo).findByText('Ninguém com esse nome usa o chat.')).toBeTruthy();
  });
});

describe('a vista da tela', () => {
  const conversa = (id: string) => ({
    routeId: '/chat/c/$conversa',
    pathname: `/chat/c/${id}`,
    search: {},
  });

  it('no meio da troca de conversa, fica na vista Chat, com as rotas de antes ou as novas', () => {
    // O roteador troca o endereço antes das rotas casadas, e o endereço resolvido depois delas.
    const antes = { pathname: '/chat/c/a' };
    const depois = { pathname: '/chat/c/b' };
    expect(
      vistaDaTela({ location: depois, resolvedLocation: antes, matches: [conversa('a')] }),
    ).toBe('chat');
    expect(
      vistaDaTela({ location: depois, resolvedLocation: antes, matches: [conversa('b')] }),
    ).toBe('chat');
  });

  it('o começo de um endereço que não existe não é de nenhuma vista', () => {
    const fora = { pathname: '/chat/avisos/outra' };
    const avisos = { routeId: '/chat/avisos', pathname: '/chat/avisos', search: {} };
    expect(vistaDaTela({ location: fora, resolvedLocation: fora, matches: [avisos] })).toBeNull();
  });

  it('o começo de um endereço que não existe não é a tela de um item', () => {
    // Sem isso, o celular esconderia a barra de baixo da página não encontrada, sem a seta de voltar.
    const item = { routeId: '/chat/c/$conversa', pathname: '/chat/c/abc', search: {} };
    const fora = { pathname: '/chat/c/abc/outra' };
    expect(naTelaDeUmItem({ location: fora, resolvedLocation: fora, matches: [item] })).toBe(false);
    const dentro = { pathname: '/chat/c/abc' };
    expect(naTelaDeUmItem({ location: dentro, resolvedLocation: dentro, matches: [item] })).toBe(
      true,
    );
  });

  it('o chamado é da vista Chat e, aberto pela vista Chamados, dela', () => {
    const local = { pathname: '/chat/chamados/1041' };
    const chamado = (search: object) => ({
      routeId: '/chat/chamados/$numero',
      pathname: '/chat/chamados/1041',
      search,
    });
    expect(vistaDaTela({ location: local, matches: [chamado({})] })).toBe('chat');
    expect(vistaDaTela({ location: local, matches: [chamado({ vista: 'chamados' })] })).toBe(
      'chamados',
    );
  });
});

describe('o menu da conta', () => {
  const abrirOMenu = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Ana Souza' }));
    return screen.findByRole('menu', { name: 'Ana Souza' });
  };

  it('fica no pé da trilha, com as iniciais, o tema e "Sair"', async () => {
    abrir('/chat', comOChat());
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
        CHAT_VAZIO,
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
      comOChat({
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
      comOChat({
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
      comOChat({
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
