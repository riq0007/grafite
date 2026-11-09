import { describe, expect, it } from 'vitest';
import { normalizarTexto } from './texto.ts';

describe('normalizarTexto', () => {
  it.each([
    ['EM MANUTENÇÃO', 'em manutencao'],
    ['  São   Paulo ', 'sao paulo'],
    ['Açúcar\tÂmbar\nÓleo', 'acucar ambar oleo'],
    ['', ''],
  ])('%j vira %j', (entrada, esperado) => {
    expect(normalizarTexto(entrada)).toBe(esperado);
  });
});
