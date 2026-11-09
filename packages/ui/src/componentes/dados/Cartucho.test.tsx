// O cartucho (spec visualizacao-de-dados, "Cartucho"; change visualizacoes-de-dados, design, decisão 4).
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Cartucho } from './Cartucho.tsx';

afterEach(cleanup);

describe('Cartucho', () => {
  it('toner preto num tema escuro: a letra K, o corpo até 15% e o texto', () => {
    const { container } = render(
      <Cartucho nome="Preto" tinta="preto" nivel={{ tipo: 'medido', percentual: 15 }} />,
    );
    const medidor = screen.getByRole('meter', { name: 'Preto' });
    expect(medidor.getAttribute('aria-valuenow')).toBe('15');
    expect(medidor.getAttribute('aria-valuetext')).toBe('15%');
    expect(screen.getByText('K')).toBeTruthy();
    expect(screen.getByText('Preto')).toBeTruthy();
    expect(container.textContent).toContain('15%');
    expect(container.querySelector<HTMLElement>('[data-parte="nivel"]')?.style.height).toBe('15%');
    expect(container.firstElementChild?.getAttribute('data-tinta')).toBe('preto');
  });

  it('a letra de cada tinta', () => {
    const letras = { ciano: 'C', magenta: 'M', amarelo: 'Y', preto: 'K' } as const;
    for (const [tinta, letra] of Object.entries(letras)) {
      render(
        <Cartucho
          nome={tinta}
          tinta={tinta as keyof typeof letras}
          nivel={{ tipo: 'medido', percentual: 50 }}
        />,
      );
      expect(screen.getByText(letra)).toBeTruthy();
      cleanup();
    }
  });

  it('nível que a impressora não mede: hachurado, sem percentual', () => {
    const { container } = render(
      <Cartucho nome="Preto" tinta="preto" nivel={{ tipo: 'ha-suprimento' }} />,
    );
    expect(screen.queryByRole('meter')).toBeNull();
    expect(screen.getByRole('img', { name: 'Preto: há suprimento' })).toBeTruthy();
    expect(screen.getByText('Há suprimento')).toBeTruthy();
    expect(container.textContent).not.toContain('%');
    expect(container.firstElementChild?.hasAttribute('data-hachurado')).toBe(true);
  });

  it('sem dado e inconsistente, em texto, com o corpo vazio', () => {
    const { container, rerender } = render(
      <Cartucho nome="Ciano" tinta="ciano" nivel={{ tipo: 'sem-dado' }} />,
    );
    expect(screen.getByRole('img', { name: 'Ciano: sem dado' })).toBeTruthy();
    expect(screen.getByText('Sem dado')).toBeTruthy();
    expect(container.querySelector('[data-parte="nivel"]')).toBeNull();
    rerender(<Cartucho nome="Ciano" tinta="ciano" nivel={{ tipo: 'inconsistente', valor: 120 }} />);
    expect(screen.getByRole('img', { name: 'Ciano: inconsistente, 120%' })).toBeTruthy();
    expect(screen.getByText('Inconsistente')).toBeTruthy();
    expect(container.textContent).toContain('120%');
  });

  it('sem tinta, como o cilindro, a placa fica neutra e sem letra', () => {
    const { container } = render(
      <Cartucho nome="Cilindro" tinta={null} nivel={{ tipo: 'medido', percentual: 60 }} />,
    );
    expect(container.firstElementChild?.getAttribute('data-tinta')).toBe('neutra');
    expect(container.querySelector('[data-parte="placa"]')?.textContent).toBe('');
  });

  it('a estimativa e o limite', () => {
    const { container } = render(
      <Cartucho
        nome="Magenta"
        tinta="magenta"
        nivel={{ tipo: 'medido', percentual: 38 }}
        estimativa="Acaba em cerca de 21 dias"
        limite={10}
      />,
    );
    expect(screen.getByText('Acaba em cerca de 21 dias')).toBeTruthy();
    expect(container.querySelector<HTMLElement>('[data-parte="limite"]')?.style.bottom).toBe('10%');
  });
});
