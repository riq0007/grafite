// O menu de contexto (spec componentes-base, "Menu de contexto"): os mesmos itens com submenu e o
// mesmo teclado do menu com submenu, como o "Passar para…" do quadro dos chamados.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ItemDeMenu, Submenu } from './Menu.tsx';
import { type ItemDoMenuDeContexto, MenuDeContexto } from './MenuDeContexto.tsx';

afterEach(cleanup);

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
  // menu aberto pelo keydown: sem o app ficar com ele, o menu do navegador abre por cima deste.
  it('sem o menu do navegador, o "contextmenu" no item e no submenu fica com o app', async () => {
    render(
      <MenuDeContexto
        rotulo="Ações da mensagem"
        posicao={{ x: 40, y: 40 }}
        aoFechar={vi.fn()}
        semMenuDoNavegador
      >
        <ItemDeMenu>Responder</ItemDeMenu>
        <Submenu rotulo="Reagir">
          <ItemDeMenu>+1</ItemDeMenu>
        </Submenu>
      </MenuDeContexto>,
    );
    const menu = screen.getByRole('menu', { name: 'Ações da mensagem' });
    // O fireEvent devolve falso quando o evento foi impedido.
    expect(fireEvent.contextMenu(within(menu).getByRole('menuitem', { name: 'Responder' }))).toBe(
      false,
    );
    const reagir = within(menu).getByRole('menuitem', { name: 'Reagir' });
    act(() => reagir.focus());
    fireEvent.keyDown(reagir, { key: 'ArrowRight' });
    const submenu = await screen.findByRole('menu', { name: 'Reagir' });
    expect(fireEvent.contextMenu(within(submenu).getByRole('menuitem', { name: '+1' }))).toBe(
      false,
    );
    expect(screen.getByRole('menu', { name: 'Ações da mensagem' })).toBe(menu);
  });

  it('sem pedir, o "contextmenu" no item segue para o navegador, como antes', () => {
    render(
      <MenuDeContexto rotulo="Ações do chamado" posicao={{ x: 40, y: 40 }} aoFechar={vi.fn()}>
        <ItemDeMenu>Assumir</ItemDeMenu>
      </MenuDeContexto>,
    );
    expect(fireEvent.contextMenu(screen.getByRole('menuitem', { name: 'Assumir' }))).toBe(true);
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
