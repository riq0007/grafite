// O medidor (spec visualizacao-de-dados, "Medidor"; change visualizacoes-de-dados, design, decisão 3).
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Medidor } from './Medidor.tsx';

afterEach(cleanup);

describe('Medidor', () => {
  it('nível do toner com o limite da regra', () => {
    const { container } = render(
      <Medidor
        rotulo="Toner preto"
        valor={38}
        tinta="preto"
        limite={{ valor: 10, rotulo: 'Alerta abaixo de 10%' }}
      />,
    );
    const medidor = screen.getByRole('meter', { name: 'Toner preto' });
    expect(medidor.getAttribute('aria-valuenow')).toBe('38');
    expect(medidor.getAttribute('aria-valuemin')).toBe('0');
    expect(medidor.getAttribute('aria-valuemax')).toBe('100');
    expect(medidor.getAttribute('aria-valuetext')).toBe('38%');
    expect(screen.getByText('Alerta abaixo de 10%')).toBeTruthy();
    const nivel = container.querySelector<HTMLElement>('[data-parte="nivel"]');
    const cursor = container.querySelector<HTMLElement>('[data-parte="limite"]');
    expect(nivel?.style.width).toBe('38%');
    expect(cursor?.style.left).toBe('10%');
    expect(container.firstElementChild?.getAttribute('data-tinta')).toBe('preto');
  });

  it('sem valor, só o motivo, sem a régua e sem zero', () => {
    const { container } = render(<Medidor rotulo="Toner preto" valor={null} semValor="Sem dado" />);
    expect(screen.queryByRole('meter')).toBeNull();
    expect(screen.getByText('Sem dado')).toBeTruthy();
    expect(container.textContent).not.toContain('0');
  });

  it('fora da faixa, a régua fica na ponta e o texto mostra o valor de verdade', () => {
    const { container } = render(<Medidor rotulo="Inconsistente" valor={130} />);
    const medidor = screen.getByRole('meter', { name: 'Inconsistente' });
    expect(medidor.getAttribute('aria-valuenow')).toBe('100');
    expect(medidor.getAttribute('aria-valuetext')).toBe('130%');
    expect(container.querySelector<HTMLElement>('[data-parte="nivel"]')?.style.width).toBe('100%');
  });

  it('outra unidade e outro máximo, com os milhares do pt-BR', () => {
    render(<Medidor rotulo="Ocupação" valor={1412} maximo={3000} unidade="rostos" />);
    const medidor = screen.getByRole('meter', { name: 'Ocupação' });
    expect(medidor.getAttribute('aria-valuemax')).toBe('3000');
    expect(medidor.getAttribute('aria-valuetext')).toBe('1.412 rostos');
  });

  it('as marcas de 25 em 25%, ou as pedidas', () => {
    const { container, rerender } = render(<Medidor rotulo="Nível" valor={50} />);
    expect(container.querySelectorAll('[data-parte="marca"]')).toHaveLength(3);
    rerender(<Medidor rotulo="Nível" valor={50} marcas={[50]} />);
    expect(container.querySelectorAll('[data-parte="marca"]')).toHaveLength(1);
  });
});
