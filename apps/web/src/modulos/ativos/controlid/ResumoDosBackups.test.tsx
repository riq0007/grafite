// O resumo dos backups na web (spec backup-do-control-id, "Histórico dos backups" e "Resumo dos
// backups por controle"; change suprimentos-rostos-e-backups, design, decisão 7).
import type { components } from '@grafite/api-client';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ResumoDoControle, UltimosDias } from './ResumoDosBackups.tsx';

afterEach(cleanup);

type Resumo = components['schemas']['ResumoDosBackups']['controles'][number];

const trintaDias = (semNada: number, falhas = 0): Resumo['dias'] =>
  Array.from({ length: 30 }, (_, i) => ({
    data: `2026-10-${String(i + 1).padStart(2, '0')}`,
    situacao: i >= 30 - semNada ? 'nada' : i < falhas ? 'falha' : 'ok',
  }));

const resumo = (patrimonio: string, extras: Partial<Resumo> = {}): Resumo => ({
  controle: { id: patrimonio, rotulo: `Controle ${patrimonio}`, patrimonio },
  dias: trintaDias(0),
  ultimo: {
    concluidoEm: '2026-10-29T05:01:00.000Z',
    situacao: 'sucesso',
    usuarios: 98,
    rostos: 412,
  },
  anterior: { usuarios: 100, rostos: 409 },
  rostos: [
    { momento: '2026-10-01T05:01:00.000Z', valor: 380 },
    { momento: '2026-10-28T05:01:00.000Z', valor: 409 },
    { momento: '2026-10-29T05:01:00.000Z', valor: 412 },
  ],
  ...extras,
});

describe('o resumo de um controle na ficha', () => {
  it('rostos na ficha: as contagens com a variação, a tendência e a faixa', () => {
    render(<ResumoDoControle resumo={resumo('PAT-00778')} />);
    expect(screen.getByText('412')).toBeTruthy();
    expect(screen.getByText('+3 desde o backup anterior')).toBeTruthy();
    expect(screen.getByText('98')).toBeTruthy();
    expect(screen.getByText('−2 desde o backup anterior')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Rostos: de 380 a 412 em 30 dias' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Backups dos últimos 30 dias' })).toBeTruthy();
    expect(screen.getByText('30 de 30 dias com backup')).toBeTruthy();
  });

  it('sem backup bom ainda, as contagens dizem por quê, sem zero', () => {
    const { container } = render(
      <ResumoDoControle
        resumo={resumo('PAT-00779', {
          ultimo: null,
          anterior: null,
          rostos: [],
          dias: trintaDias(30),
        })}
      />,
    );
    expect(screen.getAllByText('Nenhum backup ainda').length).toBe(2);
    expect(within(container).queryByText('0')).toBeNull();
  });

  it('as fotos com erro deixam os rostos sem dado', () => {
    render(
      <ResumoDoControle
        resumo={resumo('PAT-00780', {
          ultimo: {
            concluidoEm: '2026-10-29T05:01:00.000Z',
            situacao: 'parcial',
            usuarios: 40,
            rostos: null,
          },
          anterior: null,
          rostos: [],
        })}
      />,
    );
    expect(screen.getByText('Sem dado')).toBeTruthy();
    expect(screen.getByText('40')).toBeTruthy();
  });
});

describe('os últimos 30 dias na tela dos backups', () => {
  it('controle sem backup: quem tem mais dias sem backup vem primeiro', () => {
    render(
      <UltimosDias
        controles={[
          resumo('PAT-00778'),
          resumo('PAT-00779', { dias: trintaDias(5) }),
          resumo('PAT-00780', { dias: trintaDias(1, 2) }),
        ]}
      />,
    );
    // A tabela base, com os rostos e os usuários como número (change tabelas-consistentes).
    const tabela = screen.getByRole('grid', { name: 'Últimos 30 dias' });
    expect(
      within(tabela).getByRole('columnheader', { name: 'Rostos' }).getAttribute('data-especie'),
    ).toBe('numero');
    const linhas = within(tabela).getAllByRole('row').slice(1);
    expect(linhas.map((linha) => within(linha).getByRole('rowheader').textContent)).toEqual([
      'Controle PAT-00779PAT-00779',
      'Controle PAT-00780PAT-00780',
      'Controle PAT-00778PAT-00778',
    ]);
    const primeira = within(linhas[0] as HTMLElement);
    expect(primeira.getByText('25 de 30 dias com backup')).toBeTruthy();
    expect(primeira.getByText('412')).toBeTruthy();
    expect(primeira.getByText('98')).toBeTruthy();
  });
});
