// O carimbo de seção (spec componentes-base, "Carimbo de seção"; change componentes-v3, design,
// decisão 5).
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Carimbo } from './Carimbo.tsx';

afterEach(cleanup);

describe('Carimbo', () => {
  it('título lido pelo leitor de tela: nível 2 por padrão, com o texto', () => {
    render(<Carimbo>Suprimentos</Carimbo>);
    const titulo = screen.getByRole('heading', { level: 2, name: 'Suprimentos' });
    expect(titulo.textContent).toBe('Suprimentos');
  });

  it('o nível pedido', () => {
    render(<Carimbo nivel={3}>Contadores</Carimbo>);
    expect(screen.getByRole('heading', { level: 3, name: 'Contadores' })).toBeTruthy();
  });

  it('a linha que segue é desenho, fora do texto', () => {
    const { container } = render(<Carimbo>Backups</Carimbo>);
    const linha = container.querySelector('[data-parte="linha"]');
    expect(linha?.getAttribute('aria-hidden')).toBe('true');
    expect(linha?.textContent).toBe('');
  });
});
