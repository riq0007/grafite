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
import { noCelular } from '../teste/postura.ts';
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
        'Selecionar',
        'Transformar em chamado',
        'Silenciar a conversa',
      ]),
    ).toEqual([0, 1, 2, 3, 4, 5]);
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

  it('pelo "Mais", o diálogo abre depois de o menu fechar, e "Cancelar" devolve o foco ao "Mais"', async () => {
    const { servidor } = servidorDoMenu();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor, {}, ['chamados.pedir']));
    const item = await comOMouse('Mensagem 2');
    const mais = within(item).getByRole('button', { name: 'Mais' });
    const menu = await abrirOMais(item);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Transformar em chamado' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Transformar em chamado' });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Transformar em chamado' })).toBeNull(),
    );
    // O React Aria devolve o foco no quadro seguinte ao do fechamento.
    await waitFor(() => expect(document.activeElement).toBe(mais));
  });

  it('a mensagem que já virou chamado dá "Já virou o #1045", sem ação, e o atalho a ignora', async () => {
    const virada = mensagem(2, {
      chamado: { numero: 1045, abrir: true, mensagem: null, mensagens: 1 },
    });
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

  it('o destino do salto fica marcado até o próximo clique ou a próxima tecla', async () => {
    const resposta = mensagem(4, {
      autor: TATIANA,
      texto: 'Aqui também manchou',
      respondida: { id: id(2), autor: 'Paulo Nunes', comeco: 'Mensagem 2' },
    });
    const { servidor } = servidorDoMenu({ mensagens: [...varias(1, 3), resposta] });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const respondida = await screen.findByRole('link', { name: /Paulo Nunes/ });
    const destino = document.querySelector(`[data-mensagem="${id(2)}"]`) as HTMLElement;
    // O foco que o clique põe na mensagem não é o do teclado, que o :focus-visible pinta.
    fireEvent.click(respondida);
    expect(destino.hasAttribute('data-saltada')).toBe(true);
    fireEvent.pointerDown(document.body);
    expect(destino.hasAttribute('data-saltada')).toBe(false);

    fireEvent.click(respondida);
    expect(destino.hasAttribute('data-saltada')).toBe(true);
    fireEvent.keyDown(destino, { key: 'ArrowDown' });
    expect(destino.hasAttribute('data-saltada')).toBe(false);
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

// O botão direito e a tecla de menu na mensagem (pedido do usuário de 22/11; change
// chat-com-chamados, decisão 15, "Os pedidos do usuário de 22/11"): o mesmo menu do "Mais".
describe('o botão direito e a tecla de menu', () => {
  /** O botão direito do mouse no elemento; devolve falso quando a conversa ficou com ele. */
  const botaoDireito = (alvo: Element, ponto = { clientX: 120, clientY: 80 }) => {
    fireEvent.pointerDown(alvo, { pointerType: 'mouse', button: 2, ...ponto });
    return fireEvent.contextMenu(alvo, { button: 2, ...ponto });
  };
  const doMenu = (autor = 'Paulo Nunes') =>
    screen.findByRole('menu', { name: `Ações da mensagem de ${autor}` });
  const presa = (item: HTMLElement) => item.querySelector('[data-presa]') !== null;

  it('o botão direito abre o menu do "Mais", com a mensagem marcada, e o Esc devolve o foco a ela', async () => {
    const { servidor } = servidorDoMenu();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor, {}, ['chamados.pedir']));
    const item = await mensagemNaTela('Mensagem 2');
    const focar = vi.spyOn(item, 'focus');
    expect(botaoDireito(within(item).getByText('Mensagem 2'))).toBe(false);
    const menu = await doMenu();
    expect(
      posicoes(menu, [
        'Responder',
        'Reagir',
        'Copiar link da mensagem',
        'Selecionar',
        'Transformar em chamado',
        'Silenciar a conversa',
      ]),
    ).toEqual([0, 1, 2, 3, 4, 5]);
    // Os mesmos itens do "Mais": o azul do chamado e o atalho.
    const transformar = within(menu).getByRole('menuitem', { name: 'Transformar em chamado' });
    expect(transformar.dataset.informativo).toBe('true');
    expect(descricao(transformar)).toContain('Shift');
    // A mensagem fica com o foco, sem rolar a conversa, e marcada, com a barra presa.
    expect(focar).toHaveBeenCalledWith({ preventScroll: true });
    expect(presa(item)).toBe(true);

    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(item));
    expect(focar).toHaveBeenLastCalledWith({ preventScroll: true });
    await waitFor(() => expect(presa(item)).toBe(false));
  });

  it('no link, no texto selecionado e depois de um toque, fica o menu do navegador', async () => {
    const resposta = mensagem(4, {
      autor: TATIANA,
      texto: 'Aqui também manchou',
      respondida: { id: id(2), autor: 'Paulo Nunes', comeco: 'Mensagem 2' },
      reacoes: [{ texto: 'ok', contas: [{ conta: ANA.conta, nome: ANA.nome }], minha: true }],
    });
    const { servidor } = servidorDoMenu({ mensagens: [...varias(1, 3), resposta] });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const item = await mensagemNaTela('Aqui também manchou');
    expect(botaoDireito(within(item).getByRole('link', { name: /Paulo Nunes/ }))).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();

    // O texto selecionado vale como estava ao apertar o botão.
    const caixa = { left: 100, right: 200, top: 60, bottom: 100 };
    const selecao = vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => ({ cloneRange: () => ({ getClientRects: () => [caixa] }) }),
    } as unknown as Selection);
    const texto = within(item).getByText('Aqui também manchou');
    expect(botaoDireito(texto, { clientX: 150, clientY: 80 })).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
    // Fora do trecho selecionado, o menu da mensagem.
    expect(botaoDireito(texto, { clientX: 260, clientY: 80 })).toBe(false);
    selecao.mockRestore();
    fireEvent.keyDown(await doMenu('Tatiana Ramos'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    // Segurar a reação com o dedo não é o toque longo da mensagem: o menu fica com o navegador.
    const reacao = within(item).getByRole('button', { name: 'ok: você' });
    fireEvent.pointerDown(reacao, { pointerType: 'touch', isPrimary: true });
    expect(fireEvent.contextMenu(reacao)).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('a tecla de menu e o Shift+F10, na mensagem com o foco ou num botão dela, abrem o menu nela', async () => {
    const { servidor } = servidorDoMenu();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const item = await mensagemNaTela('Mensagem 2');
    act(() => item.focus());
    expect(fireEvent.keyDown(item, { key: 'ContextMenu' })).toBe(false);
    // O foco no primeiro item, como no Chromium, o happy-dom não dá: ele fica no painel.
    const menu = await doMenu();
    // Ao soltar a tecla, o Chromium no Windows manda o "contextmenu" ao item com o foco, já no menu:
    // o app fica com ele, sem o menu do navegador por cima deste.
    expect(fireEvent.contextMenu(within(menu).getByRole('menuitem', { name: 'Responder' }))).toBe(
      false,
    );
    expect(await doMenu()).toBe(menu);
    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(item));

    expect(fireEvent.keyDown(item, { key: 'F10', shiftKey: true })).toBe(false);
    fireEvent.keyDown(await doMenu(), { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(item));

    // Num botão da mensagem, o mesmo menu, junto do "Mais": sem isso, o navegador mandaria o
    // "contextmenu" ao botão, e o menu abriria no canto dele.
    const mais = within(item).getByRole('button', { name: 'Mais' });
    act(() => mais.focus());
    expect(fireEvent.keyDown(mais, { key: 'ContextMenu' })).toBe(false);
    fireEvent.keyDown(await doMenu(), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(item));
  });

  it('a tecla de menu num link da mensagem fica com o navegador', async () => {
    const resposta = mensagem(4, {
      autor: TATIANA,
      texto: 'Aqui também manchou',
      respondida: { id: id(2), autor: 'Paulo Nunes', comeco: 'Mensagem 2' },
    });
    const { servidor } = servidorDoMenu({ mensagens: [...varias(1, 3), resposta] });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const item = await mensagemNaTela('Aqui também manchou');
    const link = within(item).getByRole('link', { name: /Paulo Nunes/ });
    act(() => link.focus());
    expect(fireEvent.keyDown(link, { key: 'ContextMenu' })).toBe(true);
    expect(fireEvent.keyDown(link, { key: 'F10', shiftKey: true })).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  /**
   * O aperto do botão direito com o menu aberto, que cai no corpo da página com a conversa inerte:
   * o kit fecha o menu já no aperto, e o "contextmenu" do clique cai no que está no ponto.
   */
  const apertarComOMenuAberto = (ponto: { clientX: number; clientY: number }) =>
    fireEvent.pointerDown(document.body, { pointerType: 'mouse', button: 2, ...ponto });
  /** Dois quadros de pintura: o da volta do foco agendada pelo menu que fechou e o seguinte. */
  const doisQuadros = () =>
    act(
      () =>
        new Promise<void>((pronto) =>
          requestAnimationFrame(() => requestAnimationFrame(() => pronto())),
        ),
    );

  it('com o menu aberto, o botão direito em outra mensagem abre o menu dela, sem o do navegador', async () => {
    const daTatiana = mensagem(4, { autor: TATIANA, texto: 'Aqui também manchou' });
    const { servidor } = servidorDoMenu({ mensagens: [...varias(1, 3), daTatiana] });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const primeira = await mensagemNaTela('Mensagem 2');
    const outra = await mensagemNaTela('Aqui também manchou');
    botaoDireito(within(primeira).getByText('Mensagem 2'));
    await doMenu();
    const focarAPrimeira = vi.spyOn(primeira, 'focus');
    const ponto = { clientX: 200, clientY: 300 };
    apertarComOMenuAberto(ponto);
    expect(
      fireEvent.contextMenu(within(outra).getByText('Aqui também manchou'), {
        button: 2,
        ...ponto,
      }),
    ).toBe(false);
    await doMenu('Tatiana Ramos');
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(presa(outra)).toBe(true);
    expect(presa(primeira)).toBe(false);
    // O menu que fechou não devolve o foco à mensagem dele no quadro seguinte: o menu novo fica com
    // ele, aberto.
    await doisQuadros();
    expect(focarAPrimeira).not.toHaveBeenCalled();
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(screen.getByRole('menu', { name: 'Ações da mensagem de Tatiana Ramos' })).toBeTruthy();
  });

  it('com o menu aberto, o botão direito na caixa fecha o menu, e a caixa fica com o foco e o menu do navegador', async () => {
    const { servidor } = servidorDoMenu();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const item = await mensagemNaTela('Mensagem 2');
    botaoDireito(within(item).getByText('Mensagem 2'));
    await doMenu();
    const caixa = screen.getByRole('textbox', {
      name: 'Escrever uma mensagem em Equipe Financeiro',
    });
    const ponto = { clientX: 200, clientY: 600 };
    apertarComOMenuAberto(ponto);
    expect(fireEvent.contextMenu(caixa, { button: 2, ...ponto })).toBe(true);
    expect(document.activeElement).toBe(caixa);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    // O foco fica na caixa, para colar ali: o menu que fechou não o devolve à mensagem.
    await doisQuadros();
    expect(document.activeElement).toBe(caixa);
    await waitFor(() => expect(presa(item)).toBe(false));
  });

  it('com o menu aberto, o botão direito onde nada pede o menu só fecha o menu, com o foco de volta', async () => {
    const { servidor } = servidorDoMenu();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const item = await mensagemNaTela('Mensagem 2');
    botaoDireito(within(item).getByText('Mensagem 2'));
    await doMenu();
    const ponto = { clientX: 200, clientY: 20 };
    apertarComOMenuAberto(ponto);
    expect(fireEvent.contextMenu(document.body, { button: 2, ...ponto })).toBe(false);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(item));
    await waitFor(() => expect(presa(item)).toBe(false));
  });

  it('"Responder" põe o foco na caixa depois de o menu sair', async () => {
    const { servidor } = servidorDoMenu();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const item = await mensagemNaTela('Mensagem 2');
    const caixa = screen.getByRole('textbox', {
      name: 'Escrever uma mensagem em Equipe Financeiro',
    });
    const comOMenu: boolean[] = [];
    const focar = caixa.focus.bind(caixa);
    vi.spyOn(caixa, 'focus').mockImplementation((opcoes) => {
      comOMenu.push(screen.queryByRole('menu') !== null);
      focar(opcoes);
    });
    botaoDireito(within(item).getByText('Mensagem 2'));
    fireEvent.click(within(await doMenu()).getByRole('menuitem', { name: 'Responder' }));
    await waitFor(() => expect(document.activeElement).toBe(caixa));
    expect(comOMenu).toEqual([false]);
    expect(screen.getByRole('button', { name: 'Tirar a mensagem respondida' })).toBeTruthy();
    await waitFor(() => expect(presa(item)).toBe(false));
  });

  it('o transformar abre o diálogo depois de o menu sair, e "Cancelar" devolve o foco à mensagem', async () => {
    const { servidor } = servidorDoMenu();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor, {}, ['chamados.pedir']));
    const item = await mensagemNaTela('Mensagem 2');
    botaoDireito(within(item).getByText('Mensagem 2'));
    const menu = await doMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Transformar em chamado' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Transformar em chamado' });
    expect(within(dialogo).getByText('Mensagem 2')).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Transformar em chamado' })).toBeNull(),
    );
    await waitFor(() => expect(document.activeElement).toBe(item));
  });

  it('a reação escrita abre depois de o menu sair, e a mensagem fica marcada até ela sair', async () => {
    const { servidor } = servidorDoMenu();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const item = await mensagemNaTela('Mensagem 2');
    botaoDireito(within(item).getByText('Mensagem 2'));
    const reagir = within(await doMenu()).getByRole('menuitem', { name: 'Reagir' });
    act(() => reagir.focus());
    fireEvent.keyDown(reagir, { key: 'ArrowRight' });
    const submenu = await screen.findByRole('menu', { name: 'Reagir' });
    fireEvent.click(within(submenu).getByRole('menuitem', { name: 'Escrever a reação…' }));
    const popover = await screen.findByRole('dialog', { name: 'Escrever a reação' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(presa(item)).toBe(true);
    fireEvent.click(within(popover).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Escrever a reação' })).toBeNull(),
    );
    await waitFor(() => expect(presa(item)).toBe(false));
  });

  // Na janela estreita, o submenu "Reagir" não cabe ao lado do menu, de nenhum dos lados, e sairia
  // da tela: as reações ficam no próprio menu, com o nome "Reagir" em cima, no menu do botão direito
  // e no do "Mais".
  it('na janela estreita, as reações ficam no próprio menu, sem o submenu', async () => {
    noCelular();
    const { servidor, reacoes } = servidorDoMenu();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const item = await mensagemNaTela('Mensagem 2');
    botaoDireito(within(item).getByText('Mensagem 2'));
    const menu = await doMenu();
    expect(within(menu).queryByRole('menuitem', { name: 'Reagir' })).toBeNull();
    const reagir = within(menu).getByRole('group', { name: 'Reagir' });
    expect(
      within(reagir)
        .getAllByRole('menuitemcheckbox')
        .map((reacao) => reacao.textContent),
    ).toEqual(['+1', 'ok', 'visto']);
    expect(
      posicoes(menu, [
        'Responder',
        'Escrever a reação…',
        'Copiar link da mensagem',
        'Silenciar a conversa',
      ]),
    ).toEqual([0, 1, 2, 3]);
    fireEvent.click(within(reagir).getByRole('menuitemcheckbox', { name: '+1' }));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(reacoes).toEqual([{ mensagem: id(2), texto: '+1' }]));

    const mais = await abrirOMais(item);
    expect(within(mais).queryByRole('menuitem', { name: 'Reagir' })).toBeNull();
    expect(within(mais).getByRole('group', { name: 'Reagir' })).toBeTruthy();
  });
});
