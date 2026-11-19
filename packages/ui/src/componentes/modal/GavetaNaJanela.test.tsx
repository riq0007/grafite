// A gaveta dentro da janela (change chamados-da-ti, design, "O rascunho, o duplicar e a situação
// (tarefa 5.20)"; m08): abre no elemento da tela, com o nome do título de dentro, prende o foco,
// fecha com Esc e com o clique no véu, e não com o clique dentro dela.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GavetaNaJanela } from './GavetaNaJanela.tsx';

afterEach(cleanup);

/** A tela com a lista à esquerda e a gaveta aberta nela, como a dos tipos de chamado. */
function Tela({
  aoMudarAberta,
  aberta = true,
  semTela = false,
}: {
  aoMudarAberta: (aberta: boolean) => void;
  aberta?: boolean;
  semTela?: boolean;
}) {
  const [tela, definirTela] = useState<HTMLElement | null>(null);
  return (
    <div>
      <button type="button">Fora da tela</button>
      <div ref={definirTela} data-testid="tela">
        <button type="button">Na lista</button>
      </div>
      <GavetaNaJanela
        aberta={aberta}
        aoMudarAberta={aoMudarAberta}
        dentroDe={semTela ? null : tela}
        idDoTitulo="titulo-da-gaveta"
      >
        <h2 id="titulo-da-gaveta">Equipamento novo</h2>
        <input aria-label="Nome do tipo" />
        <button type="button">Criar o tipo</button>
      </GavetaNaJanela>
    </div>
  );
}

/** Um clique com o ponteiro, do aperto à soltura, no elemento. */
function clicar(elemento: Element) {
  for (const evento of ['pointerDown', 'mouseDown', 'pointerUp', 'mouseUp', 'click'] as const) {
    fireEvent[evento](elemento, { button: 0, pointerId: 1, pointerType: 'mouse' });
  }
}

describe('GavetaNaJanela', () => {
  it('abre dentro do elemento da tela, com o nome do título, e leva o foco para dentro', async () => {
    render(<Tela aoMudarAberta={vi.fn()} />);
    const gaveta = await screen.findByRole('dialog', { name: 'Equipamento novo' });
    expect(screen.getByTestId('tela').contains(gaveta)).toBe(true);
    await waitFor(() => expect(gaveta.contains(document.activeElement)).toBe(true));
  });

  it('fecha com Esc e com o clique no véu, e não com o clique dentro dela', async () => {
    const aoMudarAberta = vi.fn();
    render(<Tela aoMudarAberta={aoMudarAberta} />);
    const gaveta = await screen.findByRole('dialog', { name: 'Equipamento novo' });

    clicar(within(gaveta).getByRole('button', { name: 'Criar o tipo' }));
    expect(aoMudarAberta).not.toHaveBeenCalled();

    fireEvent.keyDown(within(gaveta).getByRole('textbox', { name: 'Nome do tipo' }), {
      key: 'Escape',
    });
    expect(aoMudarAberta).toHaveBeenCalledWith(false);

    aoMudarAberta.mockClear();
    // O véu é a camada em volta da gaveta, dentro da tela, fora da gaveta.
    const veu = gaveta.parentElement?.parentElement as HTMLElement;
    expect(veu).not.toBe(screen.getByTestId('tela'));
    expect(screen.getByTestId('tela').contains(veu)).toBe(true);
    clicar(veu);
    expect(aoMudarAberta).toHaveBeenCalledWith(false);
  });

  it('fechada, ou sem o elemento da tela, não desenha nada', () => {
    const { rerender } = render(<Tela aoMudarAberta={vi.fn()} aberta={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<Tela aoMudarAberta={vi.fn()} semTela />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
