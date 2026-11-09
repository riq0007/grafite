import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RotuloDeSituacao, type Situacao } from './RotuloDeSituacao.tsx';

afterEach(cleanup);

describe('RotuloDeSituacao', () => {
  it('comunica a situação pelo texto; ícone e cor são complemento', () => {
    render(<RotuloDeSituacao situacao="atencao">Em manutenção</RotuloDeSituacao>);
    const rotulo = screen.getByText('Em manutenção').closest('[data-situacao]');
    expect(rotulo?.getAttribute('data-situacao')).toBe('atencao');
    expect(rotulo?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('cada situação tem ícone de forma própria, para distinguir sem depender da cor', () => {
    const situacoes: Situacao[] = ['neutra', 'sucesso', 'info', 'atencao', 'critico'];
    const formas = situacoes.map((situacao) => {
      const { container, unmount } = render(
        <RotuloDeSituacao situacao={situacao}>Texto</RotuloDeSituacao>,
      );
      const forma = container.querySelector('svg')?.getAttribute('class');
      unmount();
      return forma;
    });
    expect(formas.every(Boolean)).toBe(true);
    expect(new Set(formas).size).toBe(situacoes.length);
  });
});
