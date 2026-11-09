// A tendência e a contagem (spec visualizacao-de-dados, "Tendência" e "Contagem"; change
// visualizacoes-de-dados, design, decisões 6 e 7).
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Contagem } from './Contagem.tsx';
import { Tendencia } from './Tendencia.tsx';

afterEach(cleanup);

const rostos = [
  { momento: '2026-10-01T03:00:00Z', valor: 380 },
  { momento: '2026-10-15T03:00:00Z', valor: 401 },
  { momento: '2026-10-30T03:00:00Z', valor: 412 },
];

describe('Tendencia', () => {
  it('rostos de um controle: a linha, o último valor e o período', () => {
    const { container } = render(
      <Tendencia rotulo="Rostos" pontos={rostos} unidade="rostos" periodo="30 dias" />,
    );
    expect(screen.getByRole('img', { name: 'Rostos: de 380 a 412 em 30 dias' })).toBeTruthy();
    expect(screen.getByText('412')).toBeTruthy();
    expect(screen.getByText('30 dias')).toBeTruthy();
    expect(container.querySelector('path')?.getAttribute('d')?.startsWith('M')).toBe(true);
    expect(container.querySelector('[data-parte="projecao"]')).toBeNull();
  });

  it('a projeção tracejada', () => {
    const { container } = render(
      <Tendencia
        rotulo="Toner preto"
        pontos={rostos.map((p) => ({ ...p, valor: 100 - p.valor / 10 }))}
        unidade="%"
        periodo="30 dias"
        projecao={{ momento: '2026-11-20T03:00:00Z', valor: 0 }}
      />,
    );
    expect(container.querySelector('[data-parte="projecao"]')).toBeTruthy();
  });

  it('sem pontos, só o texto', () => {
    render(<Tendencia rotulo="Rostos" pontos={[]} periodo="30 dias" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Sem dado')).toBeTruthy();
  });
});

describe('Contagem', () => {
  it('rostos com a capacidade: o número, a régua da ocupação e a variação', () => {
    const { container } = render(
      <Contagem
        rotulo="Rostos"
        valor={412}
        unidade="rostos"
        capacidade={3000}
        variacao={{ valor: 3, desde: 'o backup anterior' }}
      />,
    );
    expect(container.textContent).toContain('412');
    expect(container.textContent).toContain('de 3.000');
    expect(screen.getByRole('meter', { name: 'Rostos: ocupação' })).toBeTruthy();
    expect(screen.getByText('+3 desde o backup anterior')).toBeTruthy();
  });

  it('a variação sem cor, com o sinal escrito', () => {
    const { rerender } = render(
      <Contagem rotulo="Usuários" valor={98} variacao={{ valor: -2, desde: 'ontem' }} />,
    );
    expect(screen.getByText('−2 desde ontem')).toBeTruthy();
    rerender(<Contagem rotulo="Usuários" valor={98} variacao={{ valor: 0, desde: 'ontem' }} />);
    expect(screen.getByText('Sem mudança desde ontem')).toBeTruthy();
  });

  it('os milhares do pt-BR e o sem valor', () => {
    const { rerender, container } = render(<Contagem rotulo="Páginas" valor={12500} />);
    expect(screen.getByText('12.500')).toBeTruthy();
    rerender(<Contagem rotulo="Páginas" valor={null} semValor="Sem leitura" />);
    expect(screen.getByText('Sem leitura')).toBeTruthy();
    expect(container.textContent).not.toMatch(/\d/);
  });
});
