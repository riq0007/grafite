// A caixa de escrever do chat (spec modulo-chat, "Caixa de escrever do chat"; spec chat, "Mensagem"
// e "Conversa direta"): Enter manda e Shift+Enter quebra a linha, o envio sem ação com a caixa vazia,
// o texto que fica quando a conta vai a outra conversa e volta, a recusa embaixo da caixa, a frase no
// lugar dela, os anexos, o "#" com a lista dos chamados e a direta que nasce com a primeira mensagem.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirOChat as abrir, comOChat, fecharOChat } from '../teste/chat.tsx';
import {
  AGORA,
  ANA,
  areaDasMensagens,
  CAMINHO,
  CONVERSA,
  mensagem,
  PAULO,
  recusada,
  servidorDaConversa,
  varias,
} from '../teste/conversaDoChat.ts';
import type { ServidorDeTeste } from '../teste/sessao.ts';
import type { MensagemDoChat } from './conversa.ts';

/** A caixa de texto da conversa aberta. */
const caixaDaEquipe = () =>
  screen.findByRole('textbox', { name: 'Escrever uma mensagem em Equipe Financeiro' });

/** Escreve na caixa, com o cursor no fim do texto. */
const escrever = (caixa: HTMLElement, texto: string) =>
  fireEvent.change(caixa, { target: { value: texto } });

/**
 * O servidor da conversa que aceita as mensagens: cada uma entra no fim, da conta da sessão, com o
 * que o pedido mandou, e o pedido fica guardado.
 */
function servidorQueRecebe(mudar: { mensagens?: MensagemDoChat[]; outros?: ServidorDeTeste } = {}) {
  const pedidos: unknown[] = [];
  const conversa = servidorDaConversa({
    mensagens: mudar.mensagens ?? varias(1, 3),
    outros: {
      [`POST ${CAMINHO}/mensagens`]: async (pedido) => {
        const corpo = (await pedido.json()) as { texto: string; respondeA?: string | null };
        pedidos.push(corpo);
        const nova = mensagem(conversa.estado.mensagens.length + 1, {
          autor: ANA,
          texto: corpo.texto.trim(),
          criadaEm: AGORA.toISOString(),
        });
        conversa.estado.mensagens.push(nova);
        return Response.json(nova, { status: 201 });
      },
      ...mudar.outros,
    },
  });
  return { ...conversa, pedidos };
}

/** Um chamado de que a conta participa, aberto, como a lista do chat o recebe. */
const chamado = (numero: number, titulo: string) => ({
  numero,
  titulo,
  tipo: { nome: 'Impressora', icone: 'impressora' },
  situacao: 'triagem',
  fechado: false,
  situacaoEmTexto: 'Aberto',
  abertoEm: '2026-11-18T12:00:00.000Z',
  resolvidoEm: null,
  atende: null,
  respostaNova: 0,
  ultimaMensagem: null,
});

const CHAMADOS = {
  'GET /api/chat/chamados': () =>
    Response.json({
      abertos: [
        chamado(1041, 'Sem acesso à pasta do Financeiro'),
        chamado(1044, 'Teclado com teclas falhando'),
        chamado(1045, 'Impressora manchando'),
      ],
      resolvidos: [chamado(1030, 'Instalar o Excel')],
      seguintes: false,
    }),
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: AGORA });
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
});

afterEach(() => {
  fecharOChat();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('a caixa de escrever', () => {
  it('Enter manda: a mensagem entra na conversa, e a caixa esvazia', async () => {
    const { servidor, pedidos } = servidorQueRecebe();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const caixa = await caixaDaEquipe();
    expect(screen.getByRole('button', { name: 'Enviar' }).hasAttribute('disabled')).toBe(true);
    escrever(caixa, 'Eu vou abrir um chamado agora.');
    fireEvent.keyDown(caixa, { key: 'Enter' });
    const area = await areaDasMensagens();
    expect(await within(area).findByText('Eu vou abrir um chamado agora.')).toBeTruthy();
    expect(pedidos).toEqual([{ texto: 'Eu vou abrir um chamado agora.', respondeA: null }]);
    await waitFor(() => expect((caixa as HTMLTextAreaElement).value).toBe(''));
  });

  it('Shift+Enter quebra a linha e não manda; o botão Enviar também manda', async () => {
    const { servidor, pedidos } = servidorQueRecebe();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const caixa = await caixaDaEquipe();
    escrever(caixa, 'Primeira linha');
    expect(fireEvent.keyDown(caixa, { key: 'Enter', shiftKey: true })).toBe(true);
    expect(pedidos).toEqual([]);
    escrever(caixa, 'Primeira linha\nSegunda linha');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() =>
      expect(pedidos).toEqual([{ texto: 'Primeira linha\nSegunda linha', respondeA: null }]),
    );
  });

  it('o texto fica na caixa quando a conta vai a outra tela do chat e volta', async () => {
    const { servidor } = servidorQueRecebe();
    const roteador = abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    escrever(await caixaDaEquipe(), 'Ainda escrevendo');
    await act(() => roteador.navigate({ href: '/chat' }));
    expect(await screen.findByText('Escolha uma conversa ou um chamado na lista.')).toBeTruthy();
    await act(() => roteador.navigate({ href: `/chat/c/${CONVERSA}` }));
    expect(((await caixaDaEquipe()) as HTMLTextAreaElement).value).toBe('Ainda escrevendo');
  });

  it('a recusa fica embaixo da caixa, com a frase dela, e o texto continua', async () => {
    const { servidor } = servidorDaConversa({
      outros: {
        [`POST ${CAMINHO}/mensagens`]: () => recusada({ texto: 'Use até 4.000 caracteres.' }),
      },
    });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const caixa = await caixaDaEquipe();
    escrever(caixa, 'Um texto longo demais');
    fireEvent.keyDown(caixa, { key: 'Enter' });
    expect((await screen.findByRole('alert')).textContent).toBe('Use até 4.000 caracteres.');
    expect(caixa.getAttribute('aria-invalid')).toBe('true');
    expect((caixa as HTMLTextAreaElement).value).toBe('Um texto longo demais');
    escrever(caixa, 'Um texto curto');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('no canal em que a conta não escreve, a frase fica no lugar da caixa', async () => {
    const { servidor } = servidorDaConversa({
      cabecalho: {
        tipo: 'canal',
        nome: 'Avisos da TI',
        pessoas: null,
        escreveGrupo: 'TI',
        escreve: false,
        recusa: 'Só TI escreve neste canal.',
      },
      mensagens: varias(1, 2),
    });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    expect(await screen.findByText('Só TI escreve neste canal.')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enviar' })).toBeNull();
  });

  it('o arquivo vai antes, com o nome e o tamanho, e segue com a mensagem', async () => {
    const { servidor, pedidos } = servidorQueRecebe({
      outros: {
        'POST /api/chat/anexos': (pedido) =>
          Response.json(
            {
              id: 'a-1',
              nome: new URL(pedido.url).searchParams.get('nome'),
              tipo: 'image/png',
              bytes: 2048,
            },
            { status: 201 },
          ),
      },
    });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const caixa = await caixaDaEquipe();
    const entrada = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!entrada) throw new Error('A caixa não anexa.');
    const foto = new File([new Uint8Array(2048)], 'impressora.png', { type: 'image/png' });
    fireEvent.change(entrada, { target: { files: [foto] } });
    const anexos = await screen.findByRole('list', { name: 'Anexos da mensagem' });
    expect(await within(anexos).findByText('impressora.png')).toBeTruthy();
    expect(within(anexos).getByText('2 KB')).toBeTruthy();
    escrever(caixa, 'Olha a folha');
    fireEvent.keyDown(caixa, { key: 'Enter' });
    await waitFor(() =>
      expect(pedidos).toEqual([{ texto: 'Olha a folha', anexos: ['a-1'], respondeA: null }]),
    );
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'Anexos da mensagem' })).toBeNull(),
    );
  });

  it('só com o anexo, a mensagem vai sem o texto (tarefa 4.18 do chat-com-chamados)', async () => {
    const { servidor, pedidos } = servidorQueRecebe({
      outros: {
        'POST /api/chat/anexos': () =>
          Response.json(
            { id: 'a-1', nome: 'impressora.png', tipo: 'image/png', bytes: 2048 },
            { status: 201 },
          ),
      },
    });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const caixa = await caixaDaEquipe();
    const entrada = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!entrada) throw new Error('A caixa não anexa.');
    fireEvent.change(entrada, { target: { files: [new File(['x'], 'impressora.png')] } });
    await screen.findByRole('button', { name: 'Tirar impressora.png' });
    const enviar = screen.getByRole('button', { name: 'Enviar' });
    expect(enviar.hasAttribute('disabled')).toBe(false);
    fireEvent.keyDown(caixa, { key: 'Enter' });
    await waitFor(() => expect(pedidos).toEqual([{ texto: '', anexos: ['a-1'], respondeA: null }]));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('o anexo que termina de subir enquanto a mensagem vai fica na caixa para a próxima', async () => {
    let responder: (resposta: Response) => void = () => {};
    const { servidor } = servidorDaConversa({
      mensagens: varias(1, 3),
      outros: {
        'POST /api/chat/anexos': (pedido) => {
          const nome = new URL(pedido.url).searchParams.get('nome') ?? '';
          return Response.json(
            { id: `a-${nome}`, nome, tipo: 'image/png', bytes: 2048 },
            { status: 201 },
          );
        },
        [`POST ${CAMINHO}/mensagens`]: () =>
          new Promise<Response>((resolver) => {
            responder = resolver;
          }),
      },
    });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const caixa = await caixaDaEquipe();
    const entrada = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!entrada) throw new Error('A caixa não anexa.');
    fireEvent.change(entrada, { target: { files: [new File(['x'], 'primeira.png')] } });
    await screen.findByRole('button', { name: 'Tirar primeira.png' });
    escrever(caixa, 'Olha a folha');
    fireEvent.keyDown(caixa, { key: 'Enter' });
    fireEvent.change(entrada, { target: { files: [new File(['x'], 'segunda.png')] } });
    await screen.findByRole('button', { name: 'Tirar segunda.png' });
    act(() =>
      responder(Response.json(mensagem(4, { autor: ANA, texto: 'Olha a folha' }), { status: 201 })),
    );
    await waitFor(() => expect((caixa as HTMLTextAreaElement).value).toBe(''));
    const anexos = screen.getByRole('list', { name: 'Anexos da mensagem' });
    expect(within(anexos).queryByText('primeira.png')).toBeNull();
    expect(within(anexos).getByText('segunda.png')).toBeTruthy();
  });

  it('"Tirar" tira o anexo antes de mandar', async () => {
    const { servidor } = servidorQueRecebe({
      outros: {
        'POST /api/chat/anexos': () =>
          Response.json(
            { id: 'a-1', nome: 'impressora.png', tipo: 'image/png', bytes: 2048 },
            { status: 201 },
          ),
      },
    });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    await caixaDaEquipe();
    const entrada = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!entrada) throw new Error('A caixa não anexa.');
    fireEvent.change(entrada, { target: { files: [new File(['x'], 'impressora.png')] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Tirar impressora.png' }));
    expect(screen.queryByRole('list', { name: 'Anexos da mensagem' })).toBeNull();
  });
});

describe('o "#" da caixa', () => {
  it('abre a lista dos chamados da conta, que a busca estreita, e cita o escolhido', async () => {
    const { servidor } = servidorQueRecebe({ outros: CHAMADOS });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const caixa = await caixaDaEquipe();
    escrever(caixa, 'a impressora está no #');
    const lista = await screen.findByRole('listbox', { name: 'Chamados para citar' });
    expect(
      within(lista)
        .getAllByRole('option')
        .map((opcao) => opcao.textContent),
    ).toEqual([
      '#1041Sem acesso à pasta do Financeiro',
      '#1044Teclado com teclas falhando',
      '#1045Impressora manchando',
      '#1030Instalar o Excel',
    ]);
    escrever(caixa, 'a impressora está no #104');
    await waitFor(() => expect(within(lista).getAllByRole('option')).toHaveLength(3));
    expect(caixa.getAttribute('aria-activedescendant')).toBe(
      within(lista).getByRole('option', { selected: true }).id,
    );
    fireEvent.keyDown(caixa, { key: 'ArrowDown' });
    fireEvent.keyDown(caixa, { key: 'ArrowDown' });
    expect(within(lista).getByRole('option', { selected: true }).textContent).toBe(
      '#1045Impressora manchando',
    );
    fireEvent.keyDown(caixa, { key: 'Enter' });
    expect((caixa as HTMLTextAreaElement).value).toBe('a impressora está no #1045 ');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('pelo título, e o clique também cita; Esc fecha a lista sem mudar o texto', async () => {
    const { servidor } = servidorQueRecebe({ outros: CHAMADOS });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const caixa = await caixaDaEquipe();
    escrever(caixa, '#tecl');
    fireEvent.keyDown(caixa, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect((caixa as HTMLTextAreaElement).value).toBe('#tecl');
    escrever(caixa, 'veja #impress');
    const lista = await screen.findByRole('listbox', { name: 'Chamados para citar' });
    fireEvent.click(within(lista).getByRole('option', { name: /Impressora manchando/ }));
    expect((caixa as HTMLTextAreaElement).value).toBe('veja #1045 ');
  });

  it('o Esc vale só para aquele "#": depois do envio, o "#" no mesmo lugar abre a lista', async () => {
    const { servidor, pedidos } = servidorQueRecebe({ outros: CHAMADOS });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const caixa = await caixaDaEquipe();
    escrever(caixa, '#tecl');
    await screen.findByRole('listbox', { name: 'Chamados para citar' });
    fireEvent.keyDown(caixa, { key: 'Escape' });
    fireEvent.keyDown(caixa, { key: 'Enter' });
    await waitFor(() => expect(pedidos).toEqual([{ texto: '#tecl', respondeA: null }]));
    await waitFor(() => expect((caixa as HTMLTextAreaElement).value).toBe(''));
    escrever(caixa, '#');
    expect(await screen.findByRole('listbox', { name: 'Chamados para citar' })).toBeTruthy();

    fireEvent.keyDown(caixa, { key: 'Escape' });
    escrever(caixa, '');
    escrever(caixa, '#');
    expect(await screen.findByRole('listbox', { name: 'Chamados para citar' })).toBeTruthy();
  });

  it('sem o módulo Chamados, o "#" não abre lista nenhuma', async () => {
    const pedidos: string[] = [];
    const { servidor } = servidorQueRecebe({
      outros: {
        'GET /api/chat/chamados': () => {
          pedidos.push('chamados');
          return CHAMADOS['GET /api/chat/chamados']();
        },
      },
    });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor, { modulosDesligados: ['chamados'] }));
    const caixa = await caixaDaEquipe();
    escrever(caixa, '#104');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(pedidos).toEqual([]);
  });
});

describe('a direta que ainda não nasceu', () => {
  it('mostra a pessoa escolhida, e a primeira mensagem faz a conversa nascer', async () => {
    const { servidor, estado } = servidorDaConversa({
      cabecalho: { tipo: 'direta', nome: 'Paulo Nunes', outra: PAULO, pessoas: null },
    });
    const pedidos: unknown[] = [];
    const roteador = abrir(
      '/chat',
      comOChat({
        ...servidor,
        [`POST /api/chat/diretas/${PAULO.conta}/mensagens`]: async (pedido) => {
          const corpo = (await pedido.json()) as { texto: string };
          pedidos.push(corpo);
          const primeira = mensagem(1, {
            autor: ANA,
            texto: corpo.texto,
            criadaEm: AGORA.toISOString(),
          });
          estado.mensagens.push(primeira);
          return Response.json({ conversa: CONVERSA, mensagem: primeira }, { status: 201 });
        },
      }),
    );
    await screen.findByText('Escolha uma conversa ou um chamado na lista.');
    await act(() =>
      roteador.navigate({
        href: `/chat/direta/${PAULO.conta}`,
        state: (antes) => ({ ...antes, pessoa: PAULO }),
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Paulo Nunes' })).toBeTruthy();
    expect(screen.getByText('Nenhuma mensagem ainda.')).toBeTruthy();
    const caixa = screen.getByRole('textbox', {
      name: 'Escrever uma mensagem para Paulo Nunes',
    });
    escrever(caixa, 'Oi, Paulo');
    fireEvent.keyDown(caixa, { key: 'Enter' });
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/chat/c/${CONVERSA}`));
    expect(pedidos).toEqual([{ texto: 'Oi, Paulo' }]);
    const area = await areaDasMensagens();
    expect(await within(area).findByText('Oi, Paulo')).toBeTruthy();
  });

  it('aberta sem a pessoa, pede a escolha de novo', async () => {
    abrir(`/chat/direta/${PAULO.conta}`, comOChat());
    expect(await screen.findByText('Escolha a pessoa de novo em Nova conversa.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir para o Chat' })).toBeTruthy();
  });

  it('com a conversa já nascida, vai a ela', async () => {
    const { servidor } = servidorDaConversa({
      cabecalho: { tipo: 'direta', nome: 'Paulo Nunes', outra: PAULO, pessoas: null },
      mensagens: [mensagem(1, { texto: 'Bom dia' })],
    });
    const roteador = abrir(
      `/chat/direta/${PAULO.conta}`,
      comOChat({
        ...servidor,
        'GET /api/chat/conversas': () =>
          Response.json({
            equipesECanais: [],
            recentes: [
              {
                id: CONVERSA,
                tipo: 'direta',
                nome: 'Paulo Nunes',
                naoLidas: 0,
                silenciada: false,
                ultimaMensagemEm: AGORA.toISOString(),
                outra: PAULO,
              },
            ],
          }),
      }),
    );
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/chat/c/${CONVERSA}`));
    expect(await screen.findByText('Bom dia')).toBeTruthy();
  });
});
