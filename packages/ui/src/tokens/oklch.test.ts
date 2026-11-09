import { describe, expect, it } from 'vitest';
import { dentroDoGamute, oklchParaHex, paraOklch } from './oklch.ts';

describe('oklchParaHex', () => {
  it('o branco e o preto', () => {
    expect(oklchParaHex({ l: 1, c: 0, h: 0 })).toBe('#ffffff');
    expect(oklchParaHex({ l: 0, c: 0, h: 0 })).toBe('#000000');
  });

  it('o vermelho do sRGB', () => {
    expect(oklchParaHex({ l: 0.627955, c: 0.257683, h: 29.2339 })).toBe('#ff0000');
  });

  it('fora do gamute, perde croma e guarda a luminosidade e a matiz', () => {
    const pedido = { l: 0.7, c: 0.4, h: 145 };
    expect(dentroDoGamute(pedido)).toBe(false);
    const entregue = paraOklch(oklchParaHex(pedido));
    expect(entregue.l).toBeCloseTo(0.7, 2);
    expect(Math.abs(entregue.h - 145)).toBeLessThan(2);
    expect(entregue.c).toBeLessThan(0.4);
    expect(entregue.c).toBeGreaterThan(0.1);
  });

  it('a luminosidade fora de 0 a 1 é limitada', () => {
    expect(oklchParaHex({ l: 1.2, c: 0, h: 0 })).toBe('#ffffff');
    expect(oklchParaHex({ l: -0.1, c: 0, h: 0 })).toBe('#000000');
  });
});

describe('paraOklch', () => {
  it('o branco tem luminosidade 1 e croma 0', () => {
    const branco = paraOklch('#ffffff');
    expect(branco.l).toBeCloseTo(1, 4);
    expect(branco.c).toBeCloseTo(0, 4);
  });

  it.each(['#111113', '#2f6fe4', '#f2b44c', '#0f6536', '#fbf9f5', '#ff7a6e'])(
    '%s vai e volta igual',
    (hex) => {
      expect(oklchParaHex(paraOklch(hex))).toBe(hex);
    },
  );
});

describe('dentroDoGamute', () => {
  it('o cinza médio cabe, o verde de croma 0,4 não', () => {
    expect(dentroDoGamute({ l: 0.6, c: 0, h: 0 })).toBe(true);
    expect(dentroDoGamute({ l: 0.6, c: 0.4, h: 145 })).toBe(false);
  });
});
