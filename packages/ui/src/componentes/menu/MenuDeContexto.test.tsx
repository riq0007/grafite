// O menu de contexto (spec componentes-base, "Menu de contexto"): os mesmos itens com submenu e o
// mesmo teclado do menu com submenu, como o "Passar para…" do quadro dos chamados.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ItemDeMenu, Submenu } from './Menu.tsx';
import { type ItemDoMenuDeContexto, MenuDeContexto } from './MenuDeContexto.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** O menu aberto num ponto, com os itens dados. */
function abrir(itens: ItemDoMenuDeContexto[], aoFechar = vi.fn()) {
  render(
    <MenuDeContexto
      rotulo="Ações do chamado"
      posicao={{ x: 40, y: 40 }}
      itens={itens}
      aoFechar={aoFechar}
    />,
  );
  return { aoFechar, menu: screen.getByRole('menu', { name: 'Ações do chamado' }) };
}

/** A tecla de menu no elemento com o foco; falso quando o app ficou com o "contextmenu" dela. */
function teclaDeMenu(alvo: Element) {
  fireEvent.keyDown(alvo, { key: 'ContextMenu' });
  return fireEvent.contextMenu(alvo);
}

describe('MenuDeContexto', () => {
  it('o item com submenu abre a lista dele, com o texto de apoio, e escolher nela fecha o menu', async () => {
    const assumir = vi.fn();
    const passarAAna = vi.fn();
    const passarABruno = vi.fn();
    const { aoFechar, menu } = abrir([
      { id: 'assumir', rotulo: 'Assumir', aoEscolher: assumir },
      {
        id: 'passar',
        rotulo: 'Passar para…',
        itens: [
          { id: 'ana', rotulo: 'Ana Souza', descricao: '2 abertos', aoEscolher: passarAAna },
          { id: 'bruno', rotulo: 'Bruno Lima', descricao: '3 abertos', aoEscolher: passarABruno },
        ],
      },
    ]);
    const passar = within(menu).getByRole('menuitem', { name: 'Passar para…' });
    expect(passar.getAttribute('aria-haspopup')).toBe('menu');

    // A seta para a direita abre o submenu no primeiro item, como no menu com submenu.
    act(() => passar.focus());
    fireEvent.keyDown(passar, { key: 'ArrowRight' });
    const submenu = await screen.findByRole('menu', { name: 'Passar para…' });
    const ana = within(submenu).getByRole('menuitem', { name: /^Ana Souza/ });
    expect(ana.textContent).toBe('Ana Souza2 abertos');
    expect(
      within(submenu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Ana Souza2 abertos', 'Bruno Lima3 abertos']);

    fireEvent.click(within(submenu).getByRole('menuitem', { name: /^Bruno Lima/ }));
    expect(passarABruno).toHaveBeenCalledTimes(1);
    expect(passarAAna).not.toHaveBeenCalled();
    expect(assumir).not.toHaveBeenCalled();
    expect(aoFechar).toHaveBeenCalled();
  });

  it('o item sem submenu age e fecha, como antes', () => {
    const assumir = vi.fn();
    const { aoFechar, menu } = abrir([{ id: 'assumir', rotulo: 'Assumir', aoEscolher: assumir }]);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Assumir' }));
    expect(assumir).toHaveBeenCalledTimes(1);
    expect(aoFechar).toHaveBeenCalled();
  });
});

// Os itens do menu com submenu no lugar das ações, como no menu da mensagem do chat (change
// chat-com-chamados, decisão 15).
describe('MenuDeContexto com os itens do menu', () => {
  it('a escolha no submenu age e fecha o menu inteiro, uma vez só', async () => {
    const maisUm = vi.fn();
    const responder = vi.fn();
    const aoFechar = vi.fn();
    render(
      <MenuDeContexto rotulo="Ações da mensagem" posicao={{ x: 40, y: 40 }} aoFechar={aoFechar}>
        <ItemDeMenu onAction={responder}>Responder</ItemDeMenu>
        <Submenu rotulo="Reagir">
          <ItemDeMenu onAction={maisUm}>+1</ItemDeMenu>
          <ItemDeMenu>ok</ItemDeMenu>
        </Submenu>
      </MenuDeContexto>,
    );
    const menu = screen.getByRole('menu', { name: 'Ações da mensagem' });
    const reagir = within(menu).getByRole('menuitem', { name: 'Reagir' });
    act(() => reagir.focus());
    fireEvent.keyDown(reagir, { key: 'ArrowRight' });
    const submenu = await screen.findByRole('menu', { name: 'Reagir' });

    fireEvent.click(within(submenu).getByRole('menuitem', { name: '+1' }));
    expect(maisUm).toHaveBeenCalledTimes(1);
    expect(responder).not.toHaveBeenCalled();
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it('o Esc fecha o menu', () => {
    const aoFechar = vi.fn();
    render(
      <MenuDeContexto rotulo="Ações da mensagem" posicao={{ x: 40, y: 40 }} aoFechar={aoFechar}>
        <ItemDeMenu>Responder</ItemDeMenu>
      </MenuDeContexto>,
    );
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Responder' }), { key: 'Escape' });
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it('o foco volta a quem abriu, sem rolar, e só depois avisa, para a ação agir', async () => {
    const origem = document.createElement('div');
    origem.tabIndex = -1;
    document.body.append(origem);
    const ordem: string[] = [];
    const focar = vi.spyOn(origem, 'focus').mockImplementation(() => {
      ordem.push('foco');
    });
    render(
      <MenuDeContexto
        rotulo="Ações da mensagem"
        posicao={{ x: 40, y: 40 }}
        origem={origem}
        semRolar
        aoFechar={() => ordem.push('fechou')}
        aoVoltarOFoco={() => ordem.push('voltou')}
      >
        <ItemDeMenu onAction={() => ordem.push('escolheu')}>Responder</ItemDeMenu>
      </MenuDeContexto>,
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Responder' }));
    await waitFor(() => expect(ordem).toEqual(['escolheu', 'fechou', 'foco', 'voltou']));
    expect(focar).toHaveBeenCalledWith({ preventScroll: true });
    origem.remove();
  });

  // Ao soltar a tecla de menu, o Chromium no Windows manda o "contextmenu" ao item com o foco, já no
  // menu aberto pelo keydown: o app fica com ele, sem o menu do navegador por cima deste, como em
  // todo painel do kit (change chat-com-chamados, decisão 15, "As respostas do usuário de 22/11").
  it('o "contextmenu" da tecla de menu no item e no submenu fica com o app', async () => {
    render(
      <MenuDeContexto rotulo="Ações da mensagem" posicao={{ x: 40, y: 40 }} aoFechar={vi.fn()}>
        <ItemDeMenu>Responder</ItemDeMenu>
        <Submenu rotulo="Reagir">
          <ItemDeMenu>+1</ItemDeMenu>
        </Submenu>
      </MenuDeContexto>,
    );
    const menu = screen.getByRole('menu', { name: 'Ações da mensagem' });
    // O fireEvent devolve falso quando o evento foi impedido.
    expect(teclaDeMenu(within(menu).getByRole('menuitem', { name: 'Responder' }))).toBe(false);
    const reagir = within(menu).getByRole('menuitem', { name: 'Reagir' });
    act(() => reagir.focus());
    fireEvent.keyDown(reagir, { key: 'ArrowRight' });
    const submenu = await screen.findByRole('menu', { name: 'Reagir' });
    expect(teclaDeMenu(within(submenu).getByRole('menuitem', { name: '+1' }))).toBe(false);
    expect(screen.getByRole('menu', { name: 'Ações da mensagem' })).toBe(menu);
  });

  it('sem a volta sem rolar, o foco volta como antes', async () => {
    const origem = document.createElement('button');
    document.body.append(origem);
    const focar = vi.spyOn(origem, 'focus');
    render(
      <MenuDeContexto
        rotulo="Ações da mensagem"
        posicao={{ x: 40, y: 40 }}
        origem={origem}
        aoFechar={vi.fn()}
      >
        <ItemDeMenu>Responder</ItemDeMenu>
      </MenuDeContexto>,
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Responder' }));
    await waitFor(() => expect(focar).toHaveBeenCalledWith(undefined));
    origem.remove();
  });
});

// O botão direito com o menu aberto (spec componentes-base, "Botão direito com um menu, uma lista ou
// um popover aberto"; change chat-com-chamados, decisão 15): com o menu aberto, o resto da tela fica
// inerte, e o aperto do botão direito fora dele cai no corpo da página. O kit fecha o menu já no
// aperto, e o "contextmenu" do mesmo clique cai onde o ponteiro está, como se nada estivesse aberto.
describe('o botão direito fora do menu aberto', () => {
  /** Os elementos que o teste pôs na tela, fora do menu. */
  const naPagina: HTMLElement[] = [];
  afterEach(() => {
    // O cursor do texto no ponto, que o happy-dom não tem, e a plataforma, que alguns testes trocam.
    Reflect.deleteProperty(document, 'caretPositionFromPoint');
    Reflect.deleteProperty(navigator, 'platform');
    for (const elemento of naPagina.splice(0)) elemento.remove();
  });

  /** Um elemento da tela, fora do menu. */
  function naTela<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] {
    const elemento = document.createElement(tag);
    document.body.append(elemento);
    naPagina.push(elemento);
    return elemento;
  }

  const PONTO = { clientX: 300, clientY: 200 };
  /** O aperto do botão direito, que cai no corpo da página com a tela inerte atrás do menu. */
  const apertarFora = (opcoes: { button?: number; ctrlKey?: boolean } = {}, ponto = PONTO) =>
    fireEvent.pointerDown(document.body, { pointerType: 'mouse', button: 2, ...ponto, ...opcoes });
  /** O "contextmenu" do mesmo clique, onde o ponteiro está; falso quando foi impedido. */
  const soltarEm = (alvo: Element, ponto = PONTO) =>
    fireEvent.contextMenu(alvo, { button: 2, ...ponto });
  /** Dois quadros de pintura: o da volta do foco agendada pelo menu que fechou e o seguinte. */
  const doisQuadros = () =>
    act(
      () =>
        new Promise<void>((pronto) =>
          requestAnimationFrame(() => requestAnimationFrame(() => pronto())),
        ),
    );
  /** O cursor do texto no ponto, como o navegador o dá no campo. */
  const comOCursorEm = (campo: Element, offset: number) => {
    const noPonto = vi.fn(() => ({ offsetNode: campo, offset }));
    Object.defineProperty(document, 'caretPositionFromPoint', {
      configurable: true,
      value: noPonto,
    });
    return noPonto;
  };

  /** O menu da mensagem, que fecha de verdade, com a origem que recebe o foco de volta. */
  function MenuDaMensagem({ origem, aoFechar }: { origem: HTMLElement; aoFechar: () => void }) {
    const [posicao, definirPosicao] = useState<{ x: number; y: number } | null>({ x: 40, y: 40 });
    return (
      <MenuDeContexto
        rotulo="Ações da mensagem"
        posicao={posicao}
        origem={origem}
        aoFechar={() => {
          aoFechar();
          definirPosicao(null);
        }}
      >
        <ItemDeMenu>Responder</ItemDeMenu>
      </MenuDeContexto>
    );
  }

  function abrirOMenu() {
    const origem = naTela('div');
    origem.tabIndex = -1;
    const focar = vi.spyOn(origem, 'focus');
    const aoFechar = vi.fn();
    render(<MenuDaMensagem origem={origem} aoFechar={aoFechar} />);
    expect(screen.getByRole('menu', { name: 'Ações da mensagem' })).toBeTruthy();
    return { focar, aoFechar };
  }

  /** Uma linha com o menu dela no botão direito, como a da tabela. */
  function Linha({ nome }: { nome: string }) {
    const [posicao, definirPosicao] = useState<{ x: number; y: number } | null>(null);
    return (
      <>
        <button
          type="button"
          onContextMenu={(evento) => {
            evento.preventDefault();
            definirPosicao({ x: evento.clientX, y: evento.clientY });
          }}
        >
          {nome}
        </button>
        <MenuDeContexto
          rotulo={`Ações de ${nome}`}
          posicao={posicao}
          aoFechar={() => definirPosicao(null)}
        >
          <ItemDeMenu>Abrir</ItemDeMenu>
        </MenuDeContexto>
      </>
    );
  }

  /** Duas linhas com um menu só, como a tabela: ele abre onde o botão direito pediu. */
  function LinhasComUmMenu() {
    const [posicao, definirPosicao] = useState<{ x: number; y: number } | null>(null);
    return (
      <>
        {['Switch Rack 2', 'Impressora 139'].map((nome) => (
          <button
            key={nome}
            type="button"
            onContextMenu={(evento) => {
              evento.preventDefault();
              definirPosicao({ x: evento.clientX, y: evento.clientY });
            }}
          >
            {nome}
          </button>
        ))}
        <MenuDeContexto
          rotulo="Ações das linhas"
          posicao={posicao}
          aoFechar={() => definirPosicao(null)}
        >
          <ItemDeMenu>Abrir</ItemDeMenu>
          <ItemDeMenu>Copiar</ItemDeMenu>
        </MenuDeContexto>
      </>
    );
  }

  it('fecha o menu no aperto, e onde nada pede o menu, o clique só fecha, com o foco de volta', async () => {
    const { focar, aoFechar } = abrirOMenu();
    const texto = naTela('p');
    apertarFora();
    // Já no aperto, antes de o navegador escolher o alvo do "contextmenu".
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(soltarEm(texto)).toBe(false);
    await waitFor(() => expect(focar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    // O clique seguinte, sem nada aberto, fica com o navegador.
    fireEvent.pointerDown(texto, { pointerType: 'mouse', button: 2, ...PONTO });
    expect(soltarEm(texto)).toBe(true);
  });

  it('o menu que o mesmo clique abre fica com o foco, sem a volta à origem deste', async () => {
    const { focar } = abrirOMenu();
    render(<Linha nome="Switch Rack 2" />);
    apertarFora();
    expect(soltarEm(screen.getByRole('button', { name: 'Switch Rack 2' }))).toBe(false);
    expect(await screen.findByRole('menu', { name: 'Ações de Switch Rack 2' })).toBeTruthy();
    await doisQuadros();
    expect(focar).not.toHaveBeenCalled();
    expect(screen.getAllByRole('menu')).toHaveLength(1);
  });

  it('o menu só, da tabela, que abre de novo em outra linha enquanto sai, é um menu novo, com o foco', async () => {
    // A saída do painel espera a animação, como no navegador: o menu abre de novo antes de ela acabar.
    let terminarASaida = () => {};
    const saida = new Promise<void>((pronto) => {
      terminarASaida = pronto;
    });
    Object.defineProperty(Element.prototype, 'getAnimations', {
      configurable: true,
      value(this: Element) {
        return this.hasAttribute('data-exiting') ? [{ finished: saida }] : [];
      },
    });
    // O foco no painel do menu: no navegador, o React Aria o leva dali ao primeiro item.
    const focoNoMenu = () =>
      screen.getByRole('dialog', { name: 'Ações das linhas' }).contains(document.activeElement);
    try {
      render(<LinhasComUmMenu />);
      fireEvent.contextMenu(screen.getByRole('button', { name: 'Switch Rack 2' }), PONTO);
      await waitFor(() => expect(focoNoMenu()).toBe(true));
      apertarFora();
      const outra = screen.getByRole('button', { name: 'Impressora 139' });
      act(() => outra.focus());
      expect(soltarEm(outra, { clientX: 120, clientY: 260 })).toBe(false);
      await waitFor(() => expect(focoNoMenu()).toBe(true));
      expect(screen.getAllByRole('menu')).toHaveLength(1);
    } finally {
      terminarASaida();
      Reflect.deleteProperty(Element.prototype, 'getAnimations');
    }
  });

  it('dentro do menu, o botão direito num item fica com o app, e o menu fica aberto', () => {
    const { aoFechar } = abrirOMenu();
    const responder = screen.getByRole('menuitem', { name: 'Responder' });
    fireEvent.pointerDown(responder, { pointerType: 'mouse', button: 2, ...PONTO });
    expect(soltarEm(responder)).toBe(false);
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it('no campo em que se digita, o menu do navegador, com o foco e o cursor do texto no ponto', async () => {
    const { focar } = abrirOMenu();
    const caixa = naTela('textarea');
    caixa.value = 'Bom dia, equipe';
    const noPonto = comOCursorEm(caixa, 4);
    apertarFora();
    expect(soltarEm(caixa)).toBe(true);
    expect(noPonto).toHaveBeenCalledWith(300, 200);
    expect(document.activeElement).toBe(caixa);
    expect([caixa.selectionStart, caixa.selectionEnd]).toEqual([4, 4]);
    // O foco fica na caixa: o menu que fechou não o devolve à origem.
    await doisQuadros();
    expect(focar).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(caixa);
  });

  it('no Windows, onde o "contextmenu" vem ao soltar, depois da volta do foco, o campo fica com ele', async () => {
    const { focar } = abrirOMenu();
    const caixa = naTela('textarea');
    apertarFora();
    await waitFor(() => expect(focar).toHaveBeenCalledTimes(1));
    expect(soltarEm(caixa)).toBe(true);
    expect(document.activeElement).toBe(caixa);
  });

  it('no texto selecionado do campo, a seleção fica, para copiar', () => {
    abrirOMenu();
    const caixa = naTela('textarea');
    caixa.value = 'Bom dia, equipe';
    caixa.setSelectionRange(0, 7);
    comOCursorEm(caixa, 4);
    apertarFora();
    expect(soltarEm(caixa)).toBe(true);
    expect(document.activeElement).toBe(caixa);
    expect([caixa.selectionStart, caixa.selectionEnd]).toEqual([0, 7]);
  });

  it('no e-mail, que não tem o cursor do texto, fica só o foco, sem erro', () => {
    abrirOMenu();
    const email = naTela('input');
    email.type = 'email';
    // Como no navegador: o `selectionStart` do e-mail é nulo, e pôr o cursor nele lança um erro.
    Object.defineProperty(email, 'selectionStart', { configurable: true, get: () => null });
    const porOCursor = vi.spyOn(email, 'setSelectionRange').mockImplementation(() => {
      throw new DOMException('', 'InvalidStateError');
    });
    comOCursorEm(email, 2);
    apertarFora();
    expect(soltarEm(email)).toBe(true);
    expect(document.activeElement).toBe(email);
    expect(porOCursor).not.toHaveBeenCalled();
  });

  it('sem o cursor do texto no ponto no navegador, fica só o foco', () => {
    abrirOMenu();
    const caixa = naTela('textarea');
    caixa.value = 'Bom dia';
    caixa.setSelectionRange(7, 7);
    apertarFora();
    expect(soltarEm(caixa)).toBe(true);
    expect(document.activeElement).toBe(caixa);
    expect(caixa.selectionStart).toBe(7);
  });

  it('na caixa de marcar, o clique só fecha, sem o menu do navegador', () => {
    abrirOMenu();
    const marcar = naTela('input');
    marcar.type = 'checkbox';
    apertarFora();
    expect(soltarEm(marcar)).toBe(false);
  });

  it('no link, o menu do navegador, para abrir e copiar', () => {
    abrirOMenu();
    const link = naTela('a');
    link.href = '#chamado-1045';
    link.textContent = 'Chamado 1045';
    apertarFora();
    expect(soltarEm(link)).toBe(true);
  });

  it('no texto selecionado ao apertar, o menu do navegador; fora dele, o clique só fecha', () => {
    const texto = naTela('p');
    const trecho = { left: 250, right: 350, top: 180, bottom: 220 };
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => ({ cloneRange: () => ({ getClientRects: () => [trecho] }) }),
    } as unknown as Selection);
    abrirOMenu();
    apertarFora();
    expect(soltarEm(texto)).toBe(true);
    cleanup();
    abrirOMenu();
    const longe = { clientX: 500, clientY: 500 };
    apertarFora({}, longe);
    expect(soltarEm(texto, longe)).toBe(false);
  });

  it('a marca do clique cai numa tecla: o "contextmenu" seguinte, sem nada aberto, fica com o navegador', () => {
    abrirOMenu();
    const texto = naTela('p');
    apertarFora();
    fireEvent.keyDown(document.body, { key: 'Shift' });
    expect(soltarEm(texto)).toBe(true);
  });

  it('no macOS, o Ctrl+clique vale como o botão direito', () => {
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' });
    const { aoFechar } = abrirOMenu();
    apertarFora({ button: 0, ctrlKey: true });
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it('fora do macOS, o Ctrl+clique não é o botão direito', () => {
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Win32' });
    const { aoFechar } = abrirOMenu();
    apertarFora({ button: 0, ctrlKey: true });
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it('sem nada aberto, o botão direito fica com o navegador', () => {
    const texto = naTela('p');
    fireEvent.pointerDown(texto, { pointerType: 'mouse', button: 2, ...PONTO });
    expect(soltarEm(texto)).toBe(true);
  });
});
