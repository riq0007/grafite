// O menu de contexto (spec componentes-base, "Menu de contexto"): os mesmos itens com submenu e o
// mesmo teclado do menu com submenu, como o "Passar para…" do quadro dos chamados.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
