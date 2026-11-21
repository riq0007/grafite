// A janela do chat à vista (change chat-com-chamados, design, "A leitura" e decisão 6): a aba
// visível, a janela com o foco e a tela do chat na frente dela. Na casca, um cadastro numa aba da
// janela deixa a tela montada atrás, e ela não está à vista.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextoDaTelaNaFrente } from '../notificacoes/destinosAVista.tsx';
import { useJanelaAVista } from './janela.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Situacao() {
  return <p>{useJanelaAVista() ? 'à vista' : 'fora de vista'}</p>;
}

describe('a janela do chat à vista', () => {
  it('fica à vista com a aba visível, o foco e a tela na frente, como no app do chat', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    render(<Situacao />);
    expect(screen.getByText('à vista')).toBeTruthy();
  });

  it('sem o foco da janela, fica fora de vista', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    render(<Situacao />);
    expect(screen.getByText('fora de vista')).toBeTruthy();
  });

  it('com um cadastro na frente da tela, na casca, fica fora de vista, mesmo com o foco', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    render(
      <ContextoDaTelaNaFrente.Provider value={false}>
        <Situacao />
      </ContextoDaTelaNaFrente.Provider>,
    );
    expect(screen.getByText('fora de vista')).toBeTruthy();
  });
});
