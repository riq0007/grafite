import { describe, expect, it } from 'vitest';
import { AMBIENTES, ambienteConhecido } from './ambiente.ts';

describe('ambientes', () => {
  it('são o desenvolvimento, o teste e a produção', () => {
    expect(AMBIENTES).toEqual(['desenvolvimento', 'teste', 'producao']);
  });

  it.each([
    ['producao', true],
    ['teste', true],
    ['desenvolvimento', true],
    ['produção', false],
    ['homologacao', false],
    ['', false],
  ] as const)('reconhece %j: %s', (texto, conhecido) => {
    expect(ambienteConhecido(texto)).toBe(conhecido);
  });
});
