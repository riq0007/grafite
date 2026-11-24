// As vistas Chamados, Equipes e Avisos do app do chat (spec modulo-chat, "Vista Chamados" e "Equipes
// e Avisos na tela"; spec notificacoes, "Aparelhos do push"; change chat-com-chamados, tarefa 4.7):
// os grupos pela vez de quem age, com FECHADOS recolhido, que carrega mais; quem participa da
// equipe, com "Abrir a conversa"; e, nos Avisos, "Receber neste aparelho", com o motivo em texto, e o
// "Abrir" do endereço da casca numa janela nova.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AmbienteDoPush } from '../notificacoes/push.ts';
import { abrirOChat, comOChat, fecharOChat } from '../teste/chat.tsx';
import type { ChamadoDeQuemParticipa } from './consultas.ts';

beforeEach(() => {
  // Só o relógio: as horas da lista são as de 11/11/2026, 10:51 em São Paulo, como no m10.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-11T13:51:00Z'));
});

afterEach(() => {
  fecharOChat();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const IMPRESSORA = { nome: 'Impressora', icone: 'impressora' } as const;
const PASTA = { nome: 'Acesso', icone: 'cadeado' } as const;

const chamado = (
  numero: number,
  titulo: string,
  mudar: Partial<ChamadoDeQuemParticipa> = {},
): ChamadoDeQuemParticipa => ({
  numero,
  titulo,
  tipo: IMPRESSORA,
  situacao: 'em-atendimento',
  fechado: false,
  situacaoEmTexto: 'Em andamento',
  abertoEm: '2026-11-10T20:05:00Z',
  resolvidoEm: null,
  atende: 'Bruno Lima',
  pelaTi: false,
  respostaNova: 0,
  ultimaMensagem: null,
  ...mudar,
});

const resolvido = (numero: number, resolvidoEm: string) =>
  chamado(numero, `Chamado resolvido ${numero}`, {
    situacao: 'resolvido',
    fechado: true,
    situacaoEmTexto: 'Fechado',
    resolvidoEm,
  });

const DO_M10 = {
  abertos: [
    chamado(1041, 'Sem acesso à pasta do Financeiro', {
      tipo: PASTA,
      situacao: 'aguardando',
      situacaoEmTexto: 'Aguardando você',
      abertoEm: '2026-11-10T20:05:00Z',
      atende: 'Ana Souza',
      respostaNova: 1,
      ultimaMensagem: {
        autor: 'Ana Souza',
        minha: false,
        comeco: 'Não achei uma pasta com esse nome na sua conta.',
        em: '2026-11-11T12:21:00Z',
      },
    }),
    chamado(1045, 'Impressora manchando', {
      abertoEm: '2026-11-11T13:32:00Z',
      ultimaMensagem: {
        autor: 'Bruno Lima',
        minha: false,
        comeco: 'Já vi aqui. O sistema mostra o nível do toner.',
        em: '2026-11-11T13:50:00Z',
      },
    }),
    chamado(1044, 'Teclado com teclas falhando', { abertoEm: '2026-11-11T12:00:00Z' }),
  ],
  resolvidos: [resolvido(1030, '2026-11-02T13:00:00Z')],
  seguintes: false,
};

const listaDosChamados = () => screen.findByRole('region', { name: 'Chamados' });
const titulosDosGrupos = (lista: HTMLElement) =>
  within(lista)
    .getAllByRole('heading', { level: 2 })
    .map((titulo) => titulo.textContent);

describe('a vista Chamados', () => {
  it('mostra os abertos e os grupos pela vez de quem age, com FECHADOS recolhido', async () => {
    abrirOChat(
      '/chat/chamados',
      comOChat({ 'GET /api/chat/chamados': () => Response.json(DO_M10) }),
    );
    const lista = await listaDosChamados();
    expect(await within(lista).findByText('3 abertos')).toBeTruthy();
    expect(titulosDosGrupos(lista)).toEqual([
      'Aguardando você · 1',
      'Em andamento · 2',
      'Fechados · 1',
    ]);
    expect(
      within(lista).getByRole('button', { name: 'Fechados · 1' }).getAttribute('aria-expanded'),
    ).toBe('false');
    // Os grupos na ordem da tela; em EM ANDAMENTO, o aberto mais novo primeiro. Os cartões levam a
    // vista na busca, para a lista dela ficar ao lado do chamado.
    const enderecos = within(lista)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(enderecos).toEqual([
      '/chat/chamados/1041?vista=chamados',
      '/chat/chamados/1045?vista=chamados',
      '/chat/chamados/1044?vista=chamados',
    ]);
  });

  it('cada chamado tem a hora e o começo da última mensagem, com o primeiro nome de quem a escreveu', async () => {
    abrirOChat(
      '/chat/chamados',
      comOChat({ 'GET /api/chat/chamados': () => Response.json(DO_M10) }),
    );
    const lista = await listaDosChamados();
    const do1041 = await within(lista).findByRole('link', {
      name: /^Sem acesso à pasta do Financeiro, Aguardando você, chamado 1041, 1 resposta nova/,
    });
    expect(
      within(do1041).getByText('Ana: Não achei uma pasta com esse nome na sua conta.'),
    ).toBeTruthy();
    expect(within(do1041).getByText('09:21')).toBeTruthy();
    // Sem mensagem, a hora é a da abertura, e o começo não aparece.
    const do1044 = within(lista).getByRole('link', { name: /chamado 1044/ });
    expect(within(do1044).getByText('09:00')).toBeTruthy();
  });

  it('FECHADOS carrega os resolvidos seguintes e para quando acabam', async () => {
    const pedidos: (string | null)[] = [];
    abrirOChat(
      '/chat/chamados',
      comOChat({
        'GET /api/chat/chamados': (pedido) => {
          const antes = new URL(pedido.url).searchParams.get('resolvidosAntes');
          pedidos.push(antes);
          return Response.json(
            antes === null
              ? {
                  abertos: [],
                  resolvidos: [resolvido(1030, '2026-11-02T13:00:00Z')],
                  seguintes: true,
                }
              : {
                  abertos: [],
                  resolvidos: [resolvido(1012, '2026-10-20T13:00:00Z')],
                  seguintes: false,
                },
          );
        },
      }),
    );
    const lista = await listaDosChamados();
    expect(await within(lista).findByText('nenhum aberto')).toBeTruthy();
    fireEvent.click(within(lista).getByRole('button', { name: 'Fechados · 1+' }));
    fireEvent.click(within(lista).getByRole('button', { name: 'Carregar mais' }));
    expect(await within(lista).findByRole('button', { name: 'Fechados · 2' })).toBeTruthy();
    expect(within(lista).getByRole('link', { name: /chamado 1012/ })).toBeTruthy();
    expect(within(lista).queryByRole('button', { name: 'Carregar mais' })).toBeNull();
    expect(pedidos).toEqual([null, '1030']);
  });

  it('o chamado aberto pela vista fica marcado, com a lista dela ao lado', async () => {
    abrirOChat(
      '/chat/chamados/1045?vista=chamados',
      comOChat({
        'GET /api/chat/chamados': () => Response.json(DO_M10),
        'GET /api/chat/chamados/1045': () => new Response(null, { status: 404 }),
      }),
    );
    const lista = await listaDosChamados();
    expect((await within(lista).findByRole('link', { current: 'page' })).getAttribute('href')).toBe(
      '/chat/chamados/1045?vista=chamados',
    );
  });
});

const FINANCEIRO = '0199a6e0-0000-7000-8000-0000000000e1';
const AVISOS_DA_TI = '0199a6e0-0000-7000-8000-0000000000e2';

describe('a vista Equipes', () => {
  it('lista as equipes e os canais e mostra quem participa, com "Abrir a conversa"', async () => {
    const roteador = abrirOChat(
      '/chat/equipes',
      comOChat({
        'GET /api/chat/equipes': () =>
          Response.json({
            itens: [
              { id: AVISOS_DA_TI, tipo: 'canal', nome: 'avisos-da-ti', pessoas: 312 },
              { id: FINANCEIRO, tipo: 'equipe', nome: 'Financeiro', pessoas: 2 },
            ],
          }),
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
      }),
    );
    expect(await screen.findByText('Escolha uma equipe ou um canal na lista.')).toBeTruthy();
    const lista = await screen.findByRole('region', { name: 'Equipes' });
    expect(
      await within(lista).findByRole('link', { name: 'avisos-da-ti, canal, 312 pessoas' }),
    ).toBeTruthy();
    fireEvent.click(within(lista).getByRole('link', { name: 'Financeiro, equipe, 2 pessoas' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Financeiro' })).toBeTruthy();
    expect(screen.getByText('Equipe · 2 pessoas')).toBeTruthy();
    const quem = screen.getByRole('region', { name: 'Quem participa' });
    // Pelo nome, com o "(TI)" de quem atende, ao lado das iniciais.
    expect((await within(quem).findAllByRole('listitem')).map((item) => item.textContent)).toEqual([
      'ASAna Souza (TI)',
      'FRFernanda Rocha',
    ]);
    expect(within(lista).getByRole('link', { current: 'page' }).getAttribute('aria-label')).toBe(
      'Financeiro, equipe, 2 pessoas',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abrir a conversa' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/chat/c/${FINANCEIRO}`));
  });

  it('a equipe de que a conta não participa diz que não foi encontrada, sem pedir quem participa', async () => {
    abrirOChat(`/chat/equipes/${FINANCEIRO}`, comOChat());
    expect(await screen.findByText('Equipe ou canal não encontrado.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir para as Equipes' })).toBeTruthy();
  });
});

const CHAVE_PUBLICA = `B${'A'.repeat(86)}`;
const DESTE = 'https://fcm.googleapis.com/fcm/send/este';

/** O celular com o push, ainda sem permissão, cuja inscrição aponta para DESTE. */
function celularComPush(): AmbienteDoPush {
  let permissao: NotificationPermission = 'default';
  let inscrito = false;
  return {
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    temPush: true,
    instalado: true,
    permissao: () => permissao,
    pedirPermissao: async () => {
      permissao = 'granted';
      return permissao;
    },
    registro: async () => ({
      pushManager: {
        subscribe: async () => {
          inscrito = true;
          return {
            endpoint: DESTE,
            toJSON: () => ({
              endpoint: DESTE,
              keys: { p256dh: `B${'C'.repeat(86)}`, auth: 'D'.repeat(22) },
            }),
          };
        },
        getSubscription: async () =>
          inscrito ? { endpoint: DESTE, unsubscribe: async () => true } : null,
      },
    }),
  };
}

const canaisComOPush = (aparelhos: unknown[]) => ({
  email: { situacao: 'sem-configuracao', endereco: null },
  push: { situacao: 'ligado', chavePublica: CHAVE_PUBLICA, aparelhos },
});

const neste = () => screen.findByRole('region', { name: 'Neste aparelho' });

describe('a vista Avisos', () => {
  it('"Receber neste aparelho" inscreve o celular, e os Avisos dizem que ele recebe', async () => {
    let aparelhos: unknown[] = [];
    abrirOChat(
      '/chat/avisos',
      comOChat({
        'GET /api/conta/canais': () => Response.json(canaisComOPush(aparelhos)),
        'POST /api/conta/push': () => {
          aparelhos = [
            {
              id: '0199d3a0-0000-7000-8000-0000000000f1',
              aparelho: 'Chrome no Android',
              endpoint: DESTE,
              criadaEm: '2026-11-11T13:51:00Z',
              ultimoEnvioEm: null,
            },
          ];
          return Response.json(aparelhos[0], { status: 201 });
        },
      }),
      { ambiente: celularComPush() },
    );
    const parte = await neste();
    expect(
      await within(parte).findByText('Este aparelho ainda não recebe os avisos.'),
    ).toBeTruthy();
    const botao = within(parte).getByRole('button', { name: 'Receber neste aparelho' });
    botao.focus();
    fireEvent.click(botao);
    const frase = await within(parte).findByText('Este aparelho recebe os avisos.');
    expect(within(parte).queryByRole('button', { name: 'Receber neste aparelho' })).toBeNull();
    // O botão saiu com o foco nele: o foco vai à frase, que diz o resultado.
    await waitFor(() => expect(document.activeElement).toBe(frase));
  });

  it('no iPhone fora do app instalado, diz o motivo, sem "Receber neste aparelho"', async () => {
    abrirOChat(
      '/chat/avisos',
      comOChat({ 'GET /api/conta/canais': () => Response.json(canaisComOPush([])) }),
      {
        ambiente: {
          ...celularComPush(),
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
          temPush: false,
          instalado: false,
        },
      },
    );
    const parte = await neste();
    expect(
      await within(parte).findByText(
        'No iPhone e no iPad, os avisos chegam com o Grafite ou o app do chat instalado na tela de início.',
      ),
    ).toBeTruthy();
    expect(within(parte).queryByRole('button', { name: 'Receber neste aparelho' })).toBeNull();
  });

  it('"Abrir" no endereço da casca abre o Grafite numa janela nova, e o chat fica onde estava', async () => {
    const abrirJanela = vi.spyOn(window, 'open').mockReturnValue(null);
    const roteador = abrirOChat(
      '/chat/avisos',
      comOChat({
        'GET /api/notificacoes': () =>
          Response.json({
            itens: [
              {
                id: '0199d3a0-0000-7000-8000-0000000000a1',
                severidade: 'info',
                titulo: 'Chamado #1043 com você',
                descricao: 'Trocar o mouse',
                origem: 'Chamados',
                destino: '/chamados/1043',
                criadaEm: '2026-11-11T13:40:00Z',
                lida: false,
                alerta: null,
              },
            ],
            naoLidas: 1,
            proximo: null,
          }),
        'POST /api/notificacoes/0199d3a0-0000-7000-8000-0000000000a1/leitura': () =>
          new Response(null, { status: 204 }),
      }),
    );
    const notificacoes = await screen.findByRole('region', { name: 'Notificações' });
    await within(notificacoes).findByText('Chamado #1043 com você');
    fireEvent.click(within(notificacoes).getByRole('button', { name: 'Abrir' }));
    expect(abrirJanela).toHaveBeenCalledWith('/chamados/1043', '_blank', 'noopener');
    expect(roteador.state.location.pathname).toBe('/chat/avisos');
  });
});
