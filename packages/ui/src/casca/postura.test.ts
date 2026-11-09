import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { escolherPostura, usePostura } from './postura.ts';

describe('escolherPostura', () => {
  it.each([
    [1366, true, 'computador'],
    [900, true, 'computador'],
    [768, true, 'computador'],
    [1024, false, 'tablet'],
    [768, false, 'tablet'],
    [767, true, 'celular'],
    [390, false, 'celular'],
  ] as const)('%i px com ponteiro fino = %s: %s', (largura, ponteiroFino, esperada) => {
    expect(escolherPostura(largura, ponteiroFino)).toBe(esperada);
  });
});

describe('usePostura', () => {
  const larguraOriginal = window.innerWidth;
  let ponteiroFino = true;
  const ouvintes = new Set<() => void>();

  afterEach(() => {
    vi.unstubAllGlobals();
    ouvintes.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: larguraOriginal });
  });

  function simularTela(largura: number, fino: boolean) {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: largura });
    ponteiroFino = fino;
    vi.stubGlobal('matchMedia', (consulta: string) => ({
      matches: consulta === '(pointer: fine)' ? ponteiroFino : false,
      media: consulta,
      addEventListener: (_: string, ouvinte: () => void) => ouvintes.add(ouvinte),
      removeEventListener: (_: string, ouvinte: () => void) => ouvintes.delete(ouvinte),
    }));
  }

  it('estreitar a janela passa ao celular, sem recarregar', () => {
    simularTela(1366, true);
    const { result } = renderHook(usePostura);
    expect(result.current).toBe('computador');
    act(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 700 });
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe('celular');
  });

  it('trocar o ponteiro fino pelo toque passa ao tablet', () => {
    simularTela(1024, true);
    const { result } = renderHook(usePostura);
    expect(result.current).toBe('computador');
    act(() => {
      ponteiroFino = false;
      for (const ouvinte of ouvintes) ouvinte();
    });
    expect(result.current).toBe('tablet');
  });
});

describe('limites de postura no CSS da casca', () => {
  it('toda media query e container query da casca usa um limite dos tokens', () => {
    const pasta = dirname(fileURLToPath(import.meta.url));
    const arquivos = readdirSync(pasta).filter((nome) => nome.endsWith('.module.css'));
    const consultas = arquivos.flatMap((nome) =>
      [...readFileSync(join(pasta, nome), 'utf8').matchAll(/@(?:media|container)[^{]*/g)].map(
        (encontrada) => `${nome}: ${encontrada[0].trim()}`,
      ),
    );
    const larguras = consultas.flatMap((consulta) =>
      [...consulta.matchAll(/(\d+(?:\.\d+)?)px/g)].map((numero) => ({
        consulta,
        px: Number(numero[1]),
      })),
    );
    expect(larguras.length).toBeGreaterThan(0);
    expect(larguras.filter(({ px }) => px !== 768 && px !== 1024)).toEqual([]);
  });
});
