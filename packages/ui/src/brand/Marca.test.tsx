import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Marca } from './Marca.tsx';

afterEach(cleanup);

const pasta = dirname(fileURLToPath(import.meta.url));
const marcaSvg = readFileSync(join(pasta, 'marca.svg'), 'utf8');

const desenhar = (elemento: React.ReactElement) => {
  const svg = render(elemento).container.querySelector('svg');
  if (!svg) throw new Error('a marca não desenhou um <svg>');
  return svg;
};

describe('Marca', () => {
  it('é uma imagem com o nome do produto', () => {
    render(<Marca />);
    expect(screen.getByRole('img', { name: 'Grafite' })).toBeTruthy();
  });

  it('decorativa quando o nome já está escrito ao lado: fica oculta de leitores de tela', () => {
    const svg = desenhar(<Marca decorativa />);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
    expect(svg.getAttribute('aria-label')).toBeNull();
  });

  it('a completa tem o símbolo e a palavra; a versão de símbolo, só o símbolo', () => {
    const completa = desenhar(<Marca />);
    expect(completa.querySelectorAll('circle')).toHaveLength(1);
    expect(completa.querySelectorAll('path')).toHaveLength(2);
    cleanup();
    const simbolo = desenhar(<Marca variante="simbolo" />);
    expect(simbolo.querySelectorAll('circle')).toHaveLength(1);
    expect(simbolo.querySelectorAll('path')).toHaveLength(1);
    expect(simbolo.getAttribute('viewBox')).toBe('0 0 32 32');
  });

  it('herda a cor e mantém a proporção do desenho na altura pedida', () => {
    const simbolo = desenhar(<Marca variante="simbolo" altura={16} />);
    expect(simbolo.innerHTML).toContain('currentColor');
    expect(simbolo.getAttribute('height')).toBe('16');
    expect(simbolo.getAttribute('width')).toBe('16');
    cleanup();
    const completa = desenhar(<Marca altura={14} />);
    const [, , largura, altura] = (completa.getAttribute('viewBox') ?? '').split(' ').map(Number);
    expect(Number(completa.getAttribute('width'))).toBeCloseTo(
      (14 * (largura ?? 0)) / (altura ?? 1),
      1,
    );
  });

  it('é o mesmo desenho do marca.svg gerado a partir da fonte', () => {
    const svg = desenhar(<Marca />);
    const [, caixa] = marcaSvg.match(/viewBox="([^"]+)"/) ?? [];
    const [, posicaoDoSimbolo] = marcaSvg.match(/<g [^>]*transform="([^"]+)"/) ?? [];
    const [, posicaoDaPalavra, palavra] =
      marcaSvg.match(/<path fill="currentColor" transform="([^"]+)" d="([^"]+)"/) ?? [];
    expect(svg.getAttribute('viewBox')).toBe(caixa);
    expect(svg.querySelector('g')?.getAttribute('transform')).toBe(posicaoDoSimbolo);
    const caminhoDaPalavra = svg.querySelector(':scope > path');
    expect(caminhoDaPalavra?.getAttribute('transform')).toBe(posicaoDaPalavra);
    expect(caminhoDaPalavra?.getAttribute('d')).toBe(palavra);
  });
});
