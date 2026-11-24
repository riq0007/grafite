// O transformar em chamado (spec modulo-chat, "Transformar em chamado na tela" e "Lista do Chat";
// spec chamados, "Abrir um chamado pelo chat"): o pedido com o tipo, o título, a pessoa da conta e o
// primeiro sugerido; aberto, o diálogo fecha, o aviso diz o número e o chamado entra no alto de
// CHAMADOS; a recusa fica no campo dela, com o foco no primeiro campo recusado.
import { filaDeAvisos } from '@grafite/ui';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirOChat as abrir, comOChat, fecharOChat } from '../teste/chat.tsx';
import {
  AGORA,
  CONVERSA,
  id,
  mensagem,
  mensagemNaTela,
  recusada,
  servidorDaConversa,
} from '../teste/conversaDoChat.ts';
import { CONTA_DE_EXEMPLO } from '../teste/sessao.ts';
import type {
  AtivoSugeridoPeloChat,
  ChamadoDeQuemParticipa,
  TipoParaAbrirPeloChat,
} from './consultas.ts';

const IMPRESSORA: TipoParaAbrirPeloChat = {
  id: '0199a6e0-0000-7000-8000-0000000c0003',
  nome: 'Impressora',
  icone: 'impressora',
  frase: null,
  pedeOAtivo: true,
};
const SOFTWARE: TipoParaAbrirPeloChat = {
  id: '0199a6e0-0000-7000-8000-0000000c0005',
  nome: 'Software',
  icone: 'janela',
  frase: null,
  pedeOAtivo: false,
};
const DO_FINANCEIRO: AtivoSugeridoPeloChat = {
  id: '0199a6e0-0000-7000-8000-000000000700',
  nome: 'Impressora Financeiro',
  patrimonio: 'PAT-00137',
};
const DA_RECEPCAO: AtivoSugeridoPeloChat = {
  id: '0199a6e0-0000-7000-8000-000000000701',
  nome: 'Impressora Recepção',
  patrimonio: 'PAT-00112',
};

/** Um chamado aberto da conta, na lista do Chat. */
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
  pelaTi: false,
  respostaNova: 0,
  ultimaMensagem: null,
  ...mudar,
});

/**
 * A equipe com as mensagens 1 a 3 e os chamados da conta: o 1041, que aguarda por ela, e o 1044.
 * Aberto, o 1045 entra na lista, como o mais novo; a recusa, quando o teste a dá, volta no lugar.
 */
function servidorDoTransformar({
  sugeridos = [DO_FINANCEIRO, DA_RECEPCAO],
  recusa,
  tipos = [IMPRESSORA, SOFTWARE],
  antesDosTipos,
  antesDosSugeridos,
}: {
  sugeridos?: AtivoSugeridoPeloChat[];
  recusa?: Record<string, string>;
  tipos?: TipoParaAbrirPeloChat[];
  /** A resposta dos tipos espera por ela, para o teste ver os tipos carregando. */
  antesDosTipos?: Promise<unknown>;
  /** A resposta dos sugeridos espera por ela, para o teste ver os sugeridos carregando. */
  antesDosSugeridos?: Promise<unknown>;
} = {}) {
  const pedidos: unknown[] = [];
  const sugestoes: string[] = [];
  const abertos = [
    umChamado(1044, 'O monitor pisca', {
      situacao: 'em-atendimento',
      situacaoEmTexto: 'Em andamento',
      abertoEm: '2026-11-19T09:00:00.000Z',
    }),
    umChamado(1041, 'Sem acesso à pasta do Financeiro', {
      situacao: 'aguardando',
      situacaoEmTexto: 'Aguardando você',
      abertoEm: '2026-11-17T10:00:00.000Z',
    }),
  ];
  const { servidor } = servidorDaConversa({
    mensagens: [mensagem(1), mensagem(2), mensagem(3)],
    outros: {
      'GET /api/chat/chamados': () => Response.json({ abertos, resolvidos: [], seguintes: false }),
      'GET /api/chat/chamados/tipos': async () => {
        await antesDosTipos;
        return Response.json({ itens: tipos });
      },
      'GET /api/chat/chamados/sugestoes': async (pedido) => {
        sugestoes.push(new URL(pedido.url).searchParams.toString());
        await antesDosSugeridos;
        return Response.json({ ativos: sugeridos });
      },
      [`POST /api/chat/mensagens/${id(2)}/chamado`]: async (pedido) => {
        pedidos.push(await pedido.json());
        if (recusa) return recusada(recusa);
        abertos.push(
          umChamado(1045, 'Impressora manchando', {
            tipo: { nome: 'Impressora', icone: 'impressora' },
            abertoEm: AGORA.toISOString(),
          }),
        );
        return Response.json({ numero: 1045 }, { status: 201 });
      },
    },
  });
  return { servidor, pedidos, sugestoes };
}

/** O diálogo aberto pelo Ctrl+Shift+T na mensagem 2, com os tipos carregados ou não. */
async function abrirODialogo({ esperarOsTipos = true } = {}) {
  const item = await mensagemNaTela('Mensagem 2');
  act(() => item.focus());
  fireEvent.keyDown(item, { key: 'T', code: 'KeyT', ctrlKey: true, shiftKey: true });
  const dialogo = await screen.findByRole('dialog', { name: 'Transformar em chamado' });
  if (esperarOsTipos) await within(dialogo).findByRole('radio', { name: 'Impressora' });
  return dialogo;
}

const semAcao = (botao: HTMLElement) => botao.hasAttribute('disabled');

/** Uma promessa que o teste resolve quando quer. */
function presa() {
  let soltar = () => {};
  const promessa = new Promise<void>((resolver) => {
    soltar = resolver;
  });
  return { promessa, soltar };
}

const escreverOTitulo = (dialogo: HTMLElement, texto: string) =>
  fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Título' }), {
    target: { value: texto },
  });

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: AGORA });
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
});

afterEach(() => {
  fecharOChat();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Transformar em chamado', () => {
  it('o pedido leva o tipo, o título, a pessoa da conta e o primeiro sugerido; aberto, o chamado entra no alto de CHAMADOS', async () => {
    const { servidor, pedidos } = servidorDoTransformar();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor, {}, ['chamados.pedir']));
    const lista = await screen.findByRole('region', { name: 'Chat' });
    await within(lista).findByRole('heading', { level: 2, name: 'Chamados · 2' });
    const dialogo = await abrirODialogo();
    expect(
      within(within(dialogo).getByRole('group', { name: 'No nome de' })).getByText('Ana Souza'),
    ).toBeTruthy();

    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Impressora' }));
    escreverOTitulo(dialogo, 'Impressora manchando');
    const ativo = await within(dialogo).findByRole('group', { name: 'Ativo sugerido' });
    expect(within(ativo).getByText('Impressora Financeiro')).toBeTruthy();
    expect(within(ativo).getByText('PAT-00137')).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Abrir chamado' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Transformar em chamado' })).toBeNull(),
    );
    expect(pedidos).toEqual([
      {
        tipo: IMPRESSORA.id,
        titulo: 'Impressora manchando',
        pessoa: CONTA_DE_EXEMPLO.pessoaId,
        ativo: DO_FINANCEIRO.id,
      },
    ]);
    expect(avisos()).toContain('Chamado #1045 aberto.');

    // O 1045 entra no alto, com o contorno forte, antes do que aguarda pela conta.
    const titulo = await within(lista).findByRole('heading', { level: 2, name: 'Chamados · 3' });
    const chamados = titulo.parentElement as HTMLElement;
    expect(
      within(chamados)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/chat/chamados/1045', '/chat/chamados/1041', '/chat/chamados/1044']);
    expect(chamados.querySelector('a[href="/chat/chamados/1045"]')?.hasAttribute('data-novo')).toBe(
      true,
    );
  });

  it('com CHAMADOS recolhido, o chamado aberto abre a seção, com ele no alto', async () => {
    localStorage.setItem('grafite.chat.chamadosRecolhidos', 'sim');
    const { servidor } = servidorDoTransformar();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor, {}, ['chamados.pedir']));
    const lista = await screen.findByRole('region', { name: 'Chat' });
    const recolhida = await within(lista).findByRole('button', { name: 'Chamados · 2' });
    expect(recolhida.getAttribute('aria-expanded')).toBe('false');
    const dialogo = await abrirODialogo();
    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Impressora' }));
    escreverOTitulo(dialogo, 'Impressora manchando');
    await within(dialogo).findByRole('group', { name: 'Ativo sugerido' });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Abrir chamado' }));

    const aberta = await within(lista).findByRole('button', {
      name: 'Chamados · 3',
      expanded: true,
    });
    const chamados = aberta.closest('h2')?.parentElement as HTMLElement;
    expect(chamados.querySelector('a[href="/chat/chamados/1045"]')?.hasAttribute('data-novo')).toBe(
      true,
    );
  });

  it('o tipo que não pede o ativo não mostra o ativo sugerido nem o manda', async () => {
    const { servidor, pedidos, sugestoes } = servidorDoTransformar();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor, {}, ['chamados.pedir']));
    const dialogo = await abrirODialogo();
    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Software' }));
    escreverOTitulo(dialogo, 'Instalar o leitor de PDF');
    expect(within(dialogo).queryByText('Ativo sugerido')).toBeNull();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Abrir chamado' }));
    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(pedidos[0]).toMatchObject({ tipo: SOFTWARE.id, ativo: null });
    expect(sugestoes).toEqual([]);
  });

  it('as recusas ficam nos campos, e o foco vai ao primeiro recusado', async () => {
    const { servidor } = servidorDoTransformar({
      recusa: { tipo: 'Escolha o tipo.', titulo: 'Escreva o título.' },
    });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor, {}, ['chamados.pedir']));
    const dialogo = await abrirODialogo();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Abrir chamado' }));
    expect(await within(dialogo).findByText('Escolha o tipo.')).toBeTruthy();
    expect(within(dialogo).getByText('Escreva o título.')).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(dialogo).getByRole('radio', { name: 'Impressora' }),
      ),
    );
  });

  it('sem sugeridos, a recusa aparece logo e, recusado o pedido, o foco vai ao tipo, para trocá-lo', async () => {
    const { servidor, pedidos } = servidorDoTransformar({
      sugeridos: [],
      recusa: {
        ativo:
          'Nenhum ativo desse tipo está com Ana Souza ou no local dela. Escolha outro tipo ou escreva à TI.',
      },
    });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor, {}, ['chamados.pedir']));
    const dialogo = await abrirODialogo();
    const impressora = within(dialogo).getByRole('radio', { name: 'Impressora' });
    fireEvent.click(impressora);
    escreverOTitulo(dialogo, 'Impressora manchando');
    expect(
      await within(dialogo).findByText(
        'Nenhum ativo desse tipo está com Ana Souza ou no local dela. Escolha outro tipo ou escreva à TI.',
      ),
    ).toBeTruthy();
    const abrirChamado = within(dialogo).getByRole('button', { name: 'Abrir chamado' });
    act(() => abrirChamado.focus());
    fireEvent.click(abrirChamado);
    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(pedidos[0]).toMatchObject({ ativo: null });
    await waitFor(() => expect(document.activeElement).toBe(impressora));
  });

  it('"Abrir chamado" fica sem ação enquanto os tipos e os sugeridos carregam', async () => {
    const osTipos = presa();
    const osSugeridos = presa();
    const { servidor, pedidos } = servidorDoTransformar({
      antesDosTipos: osTipos.promessa,
      antesDosSugeridos: osSugeridos.promessa,
    });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor, {}, ['chamados.pedir']));
    const dialogo = await abrirODialogo({ esperarOsTipos: false });
    const abrirChamado = within(dialogo).getByRole('button', { name: 'Abrir chamado' });
    escreverOTitulo(dialogo, 'Impressora manchando');
    expect(within(dialogo).getByText('Carregando os tipos…')).toBeTruthy();
    expect(semAcao(abrirChamado)).toBe(true);

    osTipos.soltar();
    fireEvent.click(await within(dialogo).findByRole('radio', { name: 'Impressora' }));
    // Os sugeridos da Impressora carregando: o pedido iria sem o ativo, que aparece em seguida.
    expect(await within(dialogo).findByText('Carregando os ativos sugeridos…')).toBeTruthy();
    expect(semAcao(abrirChamado)).toBe(true);
    fireEvent.click(abrirChamado);

    osSugeridos.soltar();
    expect(await within(dialogo).findByText('Impressora Financeiro')).toBeTruthy();
    expect(semAcao(abrirChamado)).toBe(false);
    expect(pedidos).toEqual([]);
  });

  it('sem nenhum tipo que abre pelo chat, "Abrir chamado" fica sem ação', async () => {
    const { servidor } = servidorDoTransformar({ tipos: [] });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor, {}, ['chamados.pedir']));
    const dialogo = await abrirODialogo({ esperarOsTipos: false });
    expect(
      await within(dialogo).findByText(
        'Nenhum tipo de chamado está disponível para abrir pelo chat. Escreva à TI.',
      ),
    ).toBeTruthy();
    expect(semAcao(within(dialogo).getByRole('button', { name: 'Abrir chamado' }))).toBe(true);
  });

  it('a recusa de um campo que não está na tela fica acima das ações', async () => {
    const { servidor, pedidos } = servidorDoTransformar({
      recusa: { ativo: 'Escolha o ativo.', conversa: 'A conversa foi arquivada.' },
    });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor, {}, ['chamados.pedir']));
    const dialogo = await abrirODialogo();
    // O Software não pede o ativo: a linha do ativo não está na tela.
    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Software' }));
    escreverOTitulo(dialogo, 'Instalar o leitor de PDF');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Abrir chamado' }));
    await waitFor(() => expect(pedidos).toHaveLength(1));
    const recusa = await within(dialogo).findByRole('alert');
    expect(recusa.textContent).toBe('Escolha o ativo. A conversa foi arquivada.');
  });

  it('a recusa da pessoa fica no "No nome de", com o foco em "Trocar a pessoa"', async () => {
    const { servidor } = servidorDoTransformar({ recusa: { pessoa: 'Escolha a pessoa.' } });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor, {}, ['chamados.pedir']));
    const dialogo = await abrirODialogo();
    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Software' }));
    escreverOTitulo(dialogo, 'Instalar o leitor de PDF');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Abrir chamado' }));
    expect(await within(dialogo).findByText('Escolha a pessoa.')).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(dialogo).getByRole('button', { name: 'Trocar a pessoa' }),
      ),
    );
  });
});
