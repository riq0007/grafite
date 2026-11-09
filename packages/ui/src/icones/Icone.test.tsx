import { cleanup, render, screen } from '@testing-library/react';
import { Search } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { BotaoDeIcone, Icone } from './Icone.tsx';

afterEach(cleanup);

describe('Icone', () => {
  it('é decorativo por padrão: oculto de leitores de tela e sem papel de imagem', () => {
    const { container } = render(<Icone icone={Search} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
  });

  it('com rótulo, vira imagem com nome acessível', () => {
    render(<Icone icone={Search} rotulo="Buscar" />);
    expect(screen.getByRole('img', { name: 'Buscar' })).toBeTruthy();
  });

  it('usa o traço do projeto e herda a cor do contexto', () => {
    const { container } = render(<Icone icone={Search} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('stroke-width')).toBe('1.7');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
  });
});

describe('BotaoDeIcone', () => {
  it('é anunciado pelo nome da ação, e o ícone fica oculto', () => {
    const { container } = render(<BotaoDeIcone icone={Search} rotulo="Buscar" />);
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeTruthy();
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
