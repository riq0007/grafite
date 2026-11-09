// A lista de dados de uma ficha (spec componentes-base, "Lista de dados"; change
// cabecalhos-e-fichas, design, decisão 3).
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ListaDeDados } from './ListaDeDados.tsx';

afterEach(cleanup);

describe('ListaDeDados', () => {
  it('dados da ordem de serviço: cada rótulo como termo e cada valor como definição', () => {
    render(
      <ListaDeDados
        itens={[
          { rotulo: 'Ativo', valor: 'Impressora 139 · PAT-00139' },
          { rotulo: 'Local', valor: '—' },
          { rotulo: 'Problema', valor: <strong>Mancha na impressão</strong> },
        ]}
      />,
    );
    expect(screen.getAllByRole('term').map((termo) => termo.textContent)).toEqual([
      'Ativo',
      'Local',
      'Problema',
    ]);
    expect(screen.getAllByRole('definition').map((definicao) => definicao.textContent)).toEqual([
      'Impressora 139 · PAT-00139',
      '—',
      'Mancha na impressão',
    ]);
  });
});
