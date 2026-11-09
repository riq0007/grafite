import { describe, expect, it } from 'vitest';
import { compor, contraste, paraHex } from './contraste.ts';

describe('contraste (WCAG 2.2)', () => {
  it.each([
    ['#777777', '#ffffff', 4.48],
    ['#767676', '#ffffff', 4.54],
    ['#000000', '#ffffff', 21],
    ['#ffffff', '#ffffff', 1],
  ])('%s sobre %s = %f:1', (frente, fundo, esperado) => {
    expect(contraste(frente, fundo)).toBeCloseTo(esperado, 2);
  });

  it('não depende da ordem das cores', () => {
    expect(contraste('#ffffff', '#777777')).toBeCloseTo(contraste('#777777', '#ffffff'), 10);
  });

  it('aceita hex curto', () => {
    expect(contraste('#000', '#fff')).toBeCloseTo(21, 2);
  });
});

describe('compor (cor translúcida sobre fundo opaco)', () => {
  it('preto a 50% sobre branco vira cinza médio', () => {
    expect(compor('rgba(0, 0, 0, 0.5)', '#ffffff')).toBe('#808080');
  });

  it('branco a 7% sobre #111113 clareia pouco', () => {
    // 0,07 × 255 + 0,93 × 17 = 33,66 → 34 (#22); 0,93 × 19 + 17,85 = 35,52 → 36 (#24)
    expect(compor('rgba(255, 255, 255, 0.07)', '#111113')).toBe('#222224');
  });

  it('cor opaca não muda', () => {
    expect(compor('#5aa2ff', '#000000')).toBe('#5aa2ff');
  });
});

describe('paraHex', () => {
  it('normaliza hex curto e maiúsculas', () => {
    expect(paraHex('#FfF')).toBe('#ffffff');
  });
});
