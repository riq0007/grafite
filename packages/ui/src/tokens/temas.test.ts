import { describe, expect, it } from 'vitest';
import { paraHex } from './contraste.ts';
import { temas } from './temas.ts';

describe('temas', () => {
  it('são seis: três escuros e três claros, com Grafite como padrão de fábrica', () => {
    expect(Object.entries(temas).map(([id, t]) => [id, t.tom])).toEqual([
      ['grafite', 'escuro'],
      ['meia-noite', 'escuro'],
      ['oled', 'escuro'],
      ['nevoa', 'claro'],
      ['papel', 'claro'],
      ['alto-contraste', 'claro'],
    ]);
  });

  it('todos definem exatamente o mesmo conjunto de tokens semânticos de cor', () => {
    const conjuntos = Object.values(temas).map((t) => Object.keys(t.cores).sort().join(','));
    expect(new Set(conjuntos).size).toBe(1);
    expect(conjuntos[0]?.split(',').length).toBeGreaterThanOrEqual(13);
  });

  it('todo valor de cor é uma cor válida', () => {
    for (const [id, tema] of Object.entries(temas)) {
      for (const [token, valor] of Object.entries(tema.cores)) {
        expect(() => paraHex(valor), `${id}.${token} = ${valor}`).not.toThrow();
      }
    }
  });
});
