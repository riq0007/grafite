// O menu da mensagem (spec modulo-chat, "Menu da mensagem"; spec chat, "Reações", "Link da
// mensagem" e "Silenciar uma conversa"; spec chamados, "Abrir um chamado pelo chat"): a barra com o
// mouse ou o foco, "Transformar em chamado" só a quem pode abrir pelo chat, o Ctrl+Shift+T, as
// reações, o link, o silenciar, o responder, a ida à respondida e as setas entre as mensagens.
import { filaDeAvisos } from '@grafite/ui';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirOChat as abrir, comOChat, fecharOChat } from '../teste/chat.tsx';
import {
  AGORA,
  ANA,
  CAMINHO,
  CONVERSA,
  id,
  mensagem,
  mensagemNaTela,
  recusada,
  servidorDaConversa,
  TATIANA,
  varias,
} from '../teste/conversaDoChat.ts';
import type { ServidorDeTeste } from '../teste/sessao.ts';
import type { ConversaAberta } from './consultas.ts';
import type { MensagemDoChat } from './conversa.ts';

/** O Ctrl+Shift+T, no elemento com o foco; devolve falso quando a tela ficou com o atalho. */
const atalho = (alvo: Element) =>
  fireEvent.keyDown(alvo, { key: 'T', code: 'KeyT', ctrlKey: true, shiftKey: true });

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);

/** O texto do que descreve o elemento, como o atalho e "Já virou o #1045". */
const descricao = (elemento: HTMLElement) =>
  (elemento.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((alvo) => document.getElementById(alvo)?.textContent ?? '')
    .join(' ');

/** A reação da conta da sessão, dada ou tirada, como a API a devolve. */
function comAReacao(alvo: MensagemDoChat, texto: string): MensagemDoChat {
  const ja = alvo.reacoes.find((reacao) => reacao.texto === texto);
  if (!ja) {
    const nova = { texto, contas: [{ conta: ANA.conta, nome: ANA.nome }], minha: true };
    return { ...alvo, reacoes: [...alvo.reacoes, nova] };
  }
  const contas = ja.minha
    ? ja.contas.filter(({ conta }) => conta !== ANA.conta)
    : [...ja.contas, { conta: ANA.conta, nome: ANA.nome }];
  return {
    ...alvo,
    reacoes:
      contas.length === 0
        ? alvo.reacoes.filter((reacao) => reacao !== ja)
        : alvo.reacoes.map((reacao) =>
            reacao === ja ? { ...reacao, contas, minha: !ja.minha } : reacao,
          ),
  };
}

/**
 * A conversa com o reagir de cada mensagem, que recusa o texto de mais de 20 caracteres, e o
 * silenciar, com o que cada pedido mandou.
 */
function servidorDoMenu({
  mensagens = varias(1, 3),
  cabecalho = {},
  outros = {},
}: {
  mensagens?: MensagemDoChat[];
  cabecalho?: Partial<ConversaAberta>;
  outros?: ServidorDeTeste;
} = {}) {
  const reacoes: { mensagem: string; texto: string }[] = [];
  const silencios: boolean[] = [];
  const reagir = (alvo: string) => async (pedido: Request) => {
    const { texto } = (await pedido.json()) as { texto: string };
    reacoes.push({ mensagem: alvo, texto });
    if (texto.trim().length > 20) return recusada({ texto: 'Use até 20 caracteres.' });
    const atual = conversa.estado.mensagens.find((item) => item.id === alvo) as MensagemDoChat;
    const depois = comAReacao(atual, texto.trim());
    conversa.estado.mensagens = conversa.estado.mensagens.map((item) =>
      item.id === alvo ? depois : item,
    );
    return Response.json(depois);
  };
  const conversa = servidorDaConversa({
    mensagens,
    cabecalho,
    outros: {
      ...Object.fromEntries(
        mensagens.map((item) => [`POST /api/chat/mensagens/${item.id}/reacoes`, reagir(item.id)]),
      ),
      [`PUT ${CAMINHO}/silenciada`]: async (pedido) => {
        const { silenciada } = (await pedido.json()) as { silenciada: boolean };
        silencios.push(silenciada);
        return Response.json({ silenciada });
      },
      ...outros,
    },
  });
  return { ...conversa, reacoes, silencios };
}

/** A mensagem com o mouse em cima, que mostra a barra dela. */
async function comOMouse(texto: string) {
  const item = await mensagemNaTela(texto);
  fireEvent.pointerOver(item);
  return item;
}

/** O menu "Mais" da barra da mensagem. */
async function abrirOMais(item: HTMLElement, autor = 'Paulo Nunes') {
  fireEvent.click(within(item).getByRole('button', { name: 'Mais' }));
  return screen.findByRole('menu', { name: `Ações da mensagem de ${autor}` });
}

/** A posição de cada item no menu, pelo nome. */
const posicoes = (menu: HTMLElement, nomes: string[]) => {
  const todos = within(menu).getAllByRole('menuitem');
  return nomes.map((nome) => todos.indexOf(within(menu).getByRole('menuitem', { name: nome })));
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

describe('Transformar em chamado, só a quem pode abrir pelo chat', () => {
  it('com o chamados.pedir, "Mais" dá o item no azul do chamado, com o Ctrl+Shift+T', async () => {
    const { servidor } = servidorDoMenu();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor, {}, ['chamados.pedir']));
    const menu = await abrirOMais(await comOMouse('Mensagem 2'));
    expect(
      posicoes(menu, [
        'Responder',
        'Reagir',
        'Copiar link da mensagem',
        'Transformar em chamado',
        'Silenciar a conversa',
      ]),
    ).toEqual([0, 1, 2, 3, 4]);
    const transformar = within(menu).getByRole('menuitem', { name: 'Transformar em chamado' });
    expect(transformar.dataset.informativo).toBe('true');
    expect(descricao(transformar)).toContain('Shift');
  });

  it('sem o chamados.pedir, o item não aparece, e o Ctrl+Shift+T não abre nada', async () => {
    const { servidor } = servidorDoMenu();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const item = await comOMouse('Mensagem 2');
    const menu = await abrirOMais(item);
    expect(within(menu).queryByRole('menuitem', { name: 'Transformar em chamado' })).toBeNull();
    fireEvent.keyDown(menu, { key: 'Escape' });
    act(() => item.focus());
    expect(atalho(item)).toBe(true);
    expect(screen.queryByRole('dialog', { name: 'Transformar em chamado' })).toBeNull();
  });

  it('com o módulo Chamados desligado, o item também não aparece', async () => {
    const { servidor } = servidorDoMenu();
    abrir(
      `/chat/c/${CONVERSA}`,
      comOChat(servidor, { modulosDesligados: ['chamados'] }, ['chamados.pedir']),
    );
    const menu = await abrirOMais(await comOMouse('Mensagem 2'));
    expect(within(menu).queryByRole('menuitem', { name: 'Transformar em chamado' })).toBeNull();
  });

  it('Ctrl+Shift+T abre o transformar na mensagem com o foco, citada com o nome e a hora', async () => {
    const { servidor } = servidorDoMenu();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor, {}, ['chamados.pedir']));
    const item = await mensagemNaTela('Mensagem 2');
    act(() => item.focus());
    expect(atalho(item)).toBe(false);
    const dialogo = await screen.findByRole('dialog', { name: 'Transformar em chamado' });
    expect(within(dialogo).getByText('Paulo Nunes')).toBeTruthy();
    expect(within(dialogo).getByText('09:02')).toBeTruthy();
    expect(within(dialogo).getByText('Mensagem 2')).toBeTruthy();
  });

  it('sem o foco numa mensagem, o Ctrl+Shift+T vale para a do mouse', async () => {
    const { servidor } = servidorDoMenu();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor, {}, ['chamados.pedir']));
    await comOMouse('Mensagem 1');
    atalho(document.body);
    const dialogo = await screen.findByRole('dialog', { name: 'Transformar em chamado' });
    expect(within(dialogo).getByText('Mensagem 1')).toBeTruthy();
  });

  it('a mensagem que já virou chamado dá "Já virou o #1045", sem ação, e o atalho a ignora', async () => {
    const virada = mensagem(2, { chamado: { numero: 1045, abrir: true, mensagem: null } });
    const { servidor } = servidorDoMenu({ mensagens: [mensagem(1), virada, mensagem(3)] });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor, {}, ['chamados.pedir']));
    const item = await comOMouse('Mensagem 2');
    const menu = await abrirOMais(item);
    const transformar = within(menu).getByRole('menuitem', { name: 'Transformar em chamado' });
    expect(transformar.getAttribute('aria-disabled')).toBe('true');
    expect(descricao(transformar)).toContain('Já virou o #1045');
    fireEvent.keyDown(menu, { key: 'Escape' });
    act(() => item.focus());
    expect(atalho(item)).toBe(true);
    expect(screen.queryByRole('dialog', { name: 'Transformar em chamado' })).toBeNull();
  });
});

describe('as reações', () => {
  it('"Reagir" dá o "+1", e a cápsula da conta o tira de novo', async () => {
    const { servidor, reacoes } = servidorDoMenu();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const item = await comOMouse('Mensagem 2');
    fireEvent.click(within(item).getByRole('button', { name: 'Reagir' }));
    const menu = await screen.findByRole('menu', { name: 'Reagir' });
    fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: '+1' }));
    const capsula = await within(item).findByRole('button', { name: '+1: você' });
    expect(capsula.getAttribute('aria-pressed')).toBe('true');
    expect(capsula.textContent).toContain('+1 · 1');
    fireEvent.click(capsula);
    await waitFor(() =>
      expect(within(item).queryByRole('button', { name: '+1: você' })).toBeNull(),
    );
    expect(reacoes).toEqual([
      { mensagem: id(2), texto: '+1' },
      { mensagem: id(2), texto: '+1' },
    ]);
  });

  it('a cápsula de outra pessoa soma a reação da conta, com quem reagiu na dica', async () => {
    const reagida = mensagem(2, {
      reacoes: [
        { texto: 'ok', contas: [{ conta: TATIANA.conta, nome: TATIANA.nome }], minha: false },
      ],
    });
    const { servidor } = servidorDoMenu({ mensagens: [mensagem(1), reagida, mensagem(3)] });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const item = await mensagemNaTela('Mensagem 2');
    const capsula = within(item).getByRole('button', { name: 'ok: Tatiana Ramos' });
    expect(capsula.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(capsula);
    const somada = await within(item).findByRole('button', { name: 'ok: Tatiana Ramos e você' });
    expect(somada.getAttribute('aria-pressed')).toBe('true');
    expect(somada.title).toBe('Tatiana Ramos e você');
  });

  it('a reação escrita: a recusa fica no campo, e a aceita entra na mensagem', async () => {
    const { servidor } = servidorDoMenu();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const item = await comOMouse('Mensagem 2');
    fireEvent.click(within(item).getByRole('button', { name: 'Reagir' }));
    const menu = await screen.findByRole('menu', { name: 'Reagir' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Escrever a reação…' }));
    const popover = await screen.findByRole('dialog', { name: 'Escrever a reação' });
    const campo = within(popover).getByRole('textbox', { name: 'Reação' });
    fireEvent.change(campo, { target: { value: 'Uma reação longa demais' } });
    fireEvent.click(within(popover).getByRole('button', { name: 'Reagir' }));
    expect(await within(popover).findByText('Use até 20 caracteres.')).toBeTruthy();
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(campo, { target: { value: 'Também manchou' } });
    fireEvent.click(within(popover).getByRole('button', { name: 'Reagir' }));
    expect(await within(item).findByRole('button', { name: 'Também manchou: você' })).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Escrever a reação' })).toBeNull(),
    );
  });
});

describe('o resto do menu', () => {
  it('"Copiar link da mensagem" copia o endereço do chat na mensagem', async () => {
    const escrever = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: escrever },
      configurable: true,
    });
    const { servidor } = servidorDoMenu();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const menu = await abrirOMais(await comOMouse('Mensagem 2'));
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Copiar link da mensagem' }));
    await waitFor(() =>
      expect(escrever).toHaveBeenCalledWith(
        `${window.location.origin}/chat/c/${CONVERSA}?m=${id(2)}`,
      ),
    );
    await waitFor(() => expect(avisos()).toContain('Link copiado.'));
  });

  it('"Silenciar a conversa" silencia, e o menu passa a "Voltar a ouvir a conversa"', async () => {
    const { servidor, silencios } = servidorDoMenu();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const item = await comOMouse('Mensagem 2');
    let menu = await abrirOMais(item);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Silenciar a conversa' }));
    await waitFor(() => expect(avisos()).toContain('Conversa silenciada.'));
    menu = await abrirOMais(item);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Voltar a ouvir a conversa' }));
    await waitFor(() => expect(avisos()).toContain('A conversa volta a notificar.'));
    expect(silencios).toEqual([true, false]);
  });

  it('"Responder" põe a mensagem em cima da caixa, e a resposta vai com ela', async () => {
    const pedidos: unknown[] = [];
    const { servidor } = servidorDoMenu({
      outros: {
        [`POST ${CAMINHO}/mensagens`]: async (pedido) => {
          const corpo = (await pedido.json()) as { texto: string };
          pedidos.push(corpo);
          return Response.json(mensagem(4, { autor: ANA, texto: corpo.texto }), { status: 201 });
        },
      },
    });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const item = await comOMouse('Mensagem 2');
    fireEvent.click(within(item).getByRole('button', { name: 'Responder' }));
    const caixa = screen.getByRole('textbox', {
      name: 'Escrever uma mensagem em Equipe Financeiro',
    });
    await waitFor(() => expect(document.activeElement).toBe(caixa));
    expect(screen.getByRole('button', { name: 'Tirar a mensagem respondida' })).toBeTruthy();
    fireEvent.change(caixa, { target: { value: 'Aqui também manchou' } });
    fireEvent.keyDown(caixa, { key: 'Enter' });
    await waitFor(() =>
      expect(pedidos).toEqual([{ texto: 'Aqui também manchou', respondeA: id(2) }]),
    );
  });

  it('"Responder" pelo "Mais" põe o foco na caixa depois de o menu fechar', async () => {
    const { servidor } = servidorDoMenu();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const item = await comOMouse('Mensagem 2');
    const caixa = screen.getByRole('textbox', {
      name: 'Escrever uma mensagem em Equipe Financeiro',
    });
    // Com o menu aberto, o resto da página fica inerte, e o foco na caixa não pegaria.
    const comOMenu: boolean[] = [];
    const focar = caixa.focus.bind(caixa);
    vi.spyOn(caixa, 'focus').mockImplementation((opcoes) => {
      comOMenu.push(screen.queryByRole('menu') !== null);
      focar(opcoes);
    });
    const menu = await abrirOMais(item);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Responder' }));
    await waitFor(() => expect(document.activeElement).toBe(caixa));
    expect(comOMenu).toEqual([false]);
    expect(screen.getByRole('button', { name: 'Tirar a mensagem respondida' })).toBeTruthy();
  });

  it('no canal em que a conta só lê, a barra reage, sem o responder', async () => {
    const { servidor } = servidorDoMenu({
      cabecalho: {
        tipo: 'canal',
        nome: 'Avisos da TI',
        pessoas: null,
        escreveGrupo: 'TI',
        escreve: false,
        recusa: 'Só TI escreve neste canal.',
      },
    });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const item = await comOMouse('Mensagem 2');
    expect(within(item).getByRole('button', { name: 'Reagir' })).toBeTruthy();
    expect(within(item).queryByRole('button', { name: 'Responder' })).toBeNull();
    const menu = await abrirOMais(item);
    expect(within(menu).queryByRole('menuitem', { name: 'Responder' })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: 'Reagir' })).toBeTruthy();
  });

  it('na equipe arquivada, a barra só copia o link e silencia, e as reações não são botões', async () => {
    const reagida = mensagem(2, {
      reacoes: [
        { texto: '+1', contas: [{ conta: TATIANA.conta, nome: TATIANA.nome }], minha: false },
      ],
    });
    const { servidor } = servidorDoMenu({
      mensagens: [mensagem(1), reagida, mensagem(3)],
      cabecalho: { arquivada: true, escreve: false, recusa: 'Esta equipe foi arquivada.' },
    });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const item = await comOMouse('Mensagem 2');
    expect(within(item).queryByRole('button', { name: 'Reagir' })).toBeNull();
    expect(within(item).queryByRole('button', { name: 'Responder' })).toBeNull();
    expect(within(item).queryByRole('button', { name: '+1: Tatiana Ramos' })).toBeNull();
    expect(within(item).getByText('+1 · 1')).toBeTruthy();
    const menu = await abrirOMais(item);
    expect(within(menu).getAllByRole('menuitem').length).toBe(2);
    expect(within(menu).getByRole('menuitem', { name: 'Copiar link da mensagem' })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: 'Silenciar a conversa' })).toBeTruthy();
  });
});

describe('o teclado e a respondida', () => {
  it('as setas, o Home e o End andam pelas mensagens, e só a da vez fica no Tab', async () => {
    const { servidor } = servidorDoMenu();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const m3 = await mensagemNaTela('Mensagem 3');
    const m1 = await mensagemNaTela('Mensagem 1');
    const m2 = await mensagemNaTela('Mensagem 2');
    expect([m1, m2, m3].map(({ tabIndex }) => tabIndex)).toEqual([-1, -1, 0]);
    act(() => m3.focus());
    fireEvent.keyDown(m3, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(m2);
    expect([m1, m2, m3].map(({ tabIndex }) => tabIndex)).toEqual([-1, 0, -1]);
    expect(within(m2).getByRole('button', { name: 'Mais' })).toBeTruthy();
    fireEvent.keyDown(m2, { key: 'Home' });
    expect(document.activeElement).toBe(m1);
    fireEvent.keyDown(m1, { key: 'End' });
    expect(document.activeElement).toBe(m3);
    fireEvent.keyDown(m3, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(m3);
  });

  it('a respondida no trecho leva à mensagem, com o foco nela, sem abrir a conversa de novo', async () => {
    const resposta = mensagem(4, {
      autor: TATIANA,
      texto: 'Aqui também manchou',
      respondida: { id: id(2), autor: 'Paulo Nunes', comeco: 'Mensagem 2' },
    });
    const { servidor, estado } = servidorDoMenu({ mensagens: [...varias(1, 3), resposta] });
    const roteador = abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    fireEvent.click(await screen.findByRole('link', { name: /Paulo Nunes/ }));
    expect(document.activeElement).toBe(document.querySelector(`[data-mensagem="${id(2)}"]`));
    expect(roteador.state.location.href).toBe(`/chat/c/${CONVERSA}`);
    expect(estado.paginas).toHaveLength(1);
  });

  it('a respondida fora do trecho abre a conversa nela', async () => {
    const resposta = mensagem(60, {
      autor: TATIANA,
      texto: 'Aqui também manchou',
      respondida: { id: id(2), autor: 'Paulo Nunes', comeco: 'Mensagem 2' },
    });
    const { servidor } = servidorDoMenu({ mensagens: [...varias(1, 59), resposta] });
    const roteador = abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    fireEvent.click(await screen.findByRole('link', { name: /Paulo Nunes/ }));
    await waitFor(() =>
      expect(roteador.state.location.href).toBe(`/chat/c/${CONVERSA}?m=${id(2)}`),
    );
    expect(await mensagemNaTela('Mensagem 2')).toBeTruthy();
  });
});
