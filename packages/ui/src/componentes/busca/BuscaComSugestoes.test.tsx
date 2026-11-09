import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BuscaComSugestoes } from './BuscaComSugestoes.tsx';

afterEach(cleanup);

const locais = [
  { id: 'sede', rotulo: 'Sede' },
  { id: 'almoxarifado', rotulo: 'Almoxarifado central' },
];

describe('BuscaComSugestoes', () => {
  it('é uma caixa de combinação nomeada pelo rótulo visível', () => {
    render(<BuscaComSugestoes rotulo="Local" sugestoes={locais} placeholder="Buscar local" />);
    const busca = screen.getByRole('combobox', { name: 'Local' });
    expect(busca.getAttribute('placeholder')).toBe('Buscar local');
  });

  it('obrigatória e com erro de fora', () => {
    render(
      <BuscaComSugestoes rotulo="Local" sugestoes={locais} obrigatorio erro="Local desativado." />,
    );
    const busca = screen.getByRole('combobox', { name: 'Local' });
    expect((busca as HTMLInputElement).required).toBe(true);
    expect(busca.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Local desativado.')).toBeDefined();
  });
});
