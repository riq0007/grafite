// A faixa de dias (spec visualizacao-de-dados, "Faixa de dias"; change visualizacoes-de-dados, design,
// decisão 5).
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DiaDaFaixa } from './calculos.ts';
import { FaixaDeDias } from './FaixaDeDias.tsx';

afterEach(cleanup);

const trintaDias = (): DiaDaFaixa[] =>
  Array.from({ length: 30 }, (_, i) => ({
    data: `2026-10-${String(i + 1).padStart(2, '0')}`,
    situacao: i === 4 || i === 11 ? 'falha' : i === 28 || i === 29 ? 'nada' : 'ok',
  }));

describe('FaixaDeDias', () => {
  it('dias sem backup: só o contorno, e o resumo em texto', () => {
    const { container } = render(
      <FaixaDeDias rotulo="Backups dos últimos 30 dias" dias={trintaDias()} oQue="backup" />,
    );
    const lista = screen.getByRole('list', { name: 'Backups dos últimos 30 dias' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(30);
    expect(container.querySelectorAll('[data-situacao="nada"]')).toHaveLength(2);
    expect(screen.getByText('26 de 30 dias com backup · 2 falhas')).toBeTruthy();
    expect(screen.getByText('30/10: sem backup')).toBeTruthy();
    expect(screen.getByText('01/10: concluído')).toBeTruthy();
  });

  it('leitura sem a cor: a falha tem o X, e o parcial, o meio cheio', () => {
    const { container } = render(
      <FaixaDeDias
        rotulo="Backups"
        oQue="backup"
        dias={[
          { data: '2026-10-01', situacao: 'falha', detalhe: 'O controle não respondeu.' },
          { data: '2026-10-02', situacao: 'parcial' },
        ]}
      />,
    );
    const falha = container.querySelector('[data-situacao="falha"]');
    const parcial = container.querySelector('[data-situacao="parcial"]');
    expect(falha?.querySelector('[data-parte="x"]')).toBeTruthy();
    expect(parcial?.querySelector('[data-parte="meio"]')).toBeTruthy();
    expect(falha?.getAttribute('title')).toBe('01/10: falha. O controle não respondeu.');
    expect(screen.getByText('02/10: parcial')).toBeTruthy();
  });

  it('do mais antigo ao mais recente, em qualquer ordem de chegada', () => {
    render(
      <FaixaDeDias
        rotulo="Backups"
        oQue="backup"
        dias={[
          { data: '2026-10-03', situacao: 'ok' },
          { data: '2026-10-01', situacao: 'nada' },
          { data: '2026-10-02', situacao: 'falha' },
        ]}
      />,
    );
    const itens = within(screen.getByRole('list', { name: 'Backups' })).getAllByRole('listitem');
    expect(itens.map((item) => item.textContent)).toEqual([
      '01/10: sem backup',
      '02/10: falha',
      '03/10: concluído',
    ]);
  });
});
