import { describe, expect, it } from 'vitest';
import { identificadorCurto, lerIdentificadorCurto } from './crockford.ts';

describe('identificador curto', () => {
  it('tem 6 caracteres do Crockford, sem I, L, O e U', () => {
    const gerado = identificadorCurto(Uint8Array.from([0, 18, 21, 24, 27, 255]));
    expect(gerado).toBe('0JNRVZ');
    expect(gerado).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
  });

  it('pede pelo menos 6 bytes', () => {
    expect(() => identificadorCurto(Uint8Array.from([1, 2, 3]))).toThrow();
  });

  it('lê o que a pessoa digitou: minúsculas, o I, o L e o O trocados, sem hífen', () => {
    expect(lerIdentificadorCurto('7k3-q9p')).toBe('7K3Q9P');
    expect(lerIdentificadorCurto(' abc0il ')).toBe('ABC011');
    expect(lerIdentificadorCurto('abcdeo')).toBe('ABCDE0');
  });

  it('recusa o tamanho errado e o U', () => {
    expect(lerIdentificadorCurto('ABC12')).toBeNull();
    expect(lerIdentificadorCurto('ABC1234')).toBeNull();
    expect(lerIdentificadorCurto('ABCU12')).toBeNull();
    expect(lerIdentificadorCurto('PC-FIN-09')).toBeNull();
  });
});
