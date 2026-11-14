import { describe, expect, it } from 'vitest';
import { contraste, paraHex } from './contraste.ts';
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

  it('o texto secundário tem 7:1 sobre a afundada, e só a Névoa e o Papel mudam com o piso', () => {
    expect(
      Object.fromEntries(Object.entries(temas).map(([id, tema]) => [id, tema.cores.texto2])),
    ).toEqual({
      grafite: '#a4a5a9',
      'meia-noite': '#9da6b5',
      oled: '#b0b0b0',
      nevoa: '#4d4f52',
      papel: '#534e47',
      'alto-contraste': '#424242',
    });
    for (const [id, tema] of Object.entries(temas)) {
      expect(
        contraste(tema.cores.texto2, tema.cores.superficieAfundada),
        id,
      ).toBeGreaterThanOrEqual(7);
    }
  });

  it('todo valor de cor é uma cor válida', () => {
    for (const [id, tema] of Object.entries(temas)) {
      for (const [token, valor] of Object.entries(tema.cores)) {
        expect(() => paraHex(valor), `${id}.${token} = ${valor}`).not.toThrow();
      }
    }
  });
});
