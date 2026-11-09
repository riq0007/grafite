import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { iconeDoTipo, iconesDeAtivo } from './ativos.ts';
import { Icone } from './Icone.tsx';

afterEach(cleanup);

describe('ícones de tipo de ativo', () => {
  it('existe ícone próprio para os 11 tipos da spec', () => {
    expect(Object.keys(iconesDeAtivo)).toEqual([
      'impressora',
      'computador',
      'notebook',
      'monitor',
      'switch',
      'rack',
      'controle-de-acesso',
      'camera',
      'storage',
      'nobreak',
      'generico',
    ]);
  });

  it('tipo sem ícone próprio usa o ícone genérico', () => {
    expect(iconesDeAtivo.generico).toBeDefined();
    expect(iconeDoTipo('drone')).toBe(iconesDeAtivo.generico);
    expect(iconeDoTipo('switch')).toBe(iconesDeAtivo.switch);
  });

  it('todos seguem a grade de 24 px e o traço do projeto', () => {
    expect(Object.keys(iconesDeAtivo)).toHaveLength(11);
    for (const [tipo, icone] of Object.entries(iconesDeAtivo)) {
      const { container, unmount } = render(<Icone icone={icone} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('viewBox'), tipo).toBe('0 0 24 24');
      expect(svg?.getAttribute('stroke-width'), tipo).toBe('1.7');
      expect(svg?.querySelectorAll('path, rect, circle, ellipse').length, tipo).toBeGreaterThan(0);
      unmount();
    }
  });
});
