import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MiniaturaDeAtivo } from './MiniaturaDeAtivo.tsx';

afterEach(cleanup);

const origem = (container: HTMLElement) =>
  container.querySelector('[data-origem]')?.getAttribute('data-origem');

describe('MiniaturaDeAtivo', () => {
  it('usa a imagem do ativo quando ela existe', () => {
    const { container } = render(
      <MiniaturaDeAtivo tipo="impressora" imagemDoAtivo="ativo.png" imagemDoModelo="modelo.png" />,
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe('ativo.png');
    expect(origem(container)).toBe('ativo');
  });

  it('sem imagem do ativo, usa a do modelo', () => {
    const { container } = render(
      <MiniaturaDeAtivo tipo="impressora" imagemDoModelo="modelo.png" />,
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe('modelo.png');
    expect(origem(container)).toBe('modelo');
  });

  it('sem nenhuma imagem, usa a genérica do tipo', () => {
    const { container } = render(<MiniaturaDeAtivo tipo="nobreak" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('lucide-nobreak');
    expect(origem(container)).toBe('generica');
  });

  it('tipo sem ícone próprio usa a genérica de ativo', () => {
    const { container } = render(<MiniaturaDeAtivo tipo="drone" />);
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('lucide-ativo');
  });

  it('imagem que não carrega dá lugar à próxima da fila', () => {
    const { container } = render(
      <MiniaturaDeAtivo tipo="nobreak" imagemDoAtivo="quebrada.png" imagemDoModelo="modelo.png" />,
    );
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('modelo.png');
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(origem(container)).toBe('generica');
  });

  it('é decorativa por padrão; com rótulo, ganha texto alternativo', () => {
    const decorativa = render(<MiniaturaDeAtivo tipo="nobreak" imagemDoModelo="modelo.png" />);
    expect(decorativa.container.querySelector('img')?.getAttribute('alt')).toBe('');
    decorativa.unmount();
    const nomeada = render(<MiniaturaDeAtivo tipo="nobreak" rotulo="Nobreak 3 kVA" />);
    expect(nomeada.getByRole('img', { name: 'Nobreak 3 kVA' })).toBeDefined();
  });
});
