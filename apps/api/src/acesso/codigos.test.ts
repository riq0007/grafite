import { describe, expect, it } from 'vitest';
import {
  gerarCodigosDeRecuperacao,
  gerarSenhaTemporaria,
  hashDoCodigo,
  normalizarCodigoDeRecuperacao,
  pareceCodigoDeRecuperacao,
} from './codigos.ts';

/** O alfabeto de Crockford: sem I, L, O e U, que se confundem ao ler. */
const CROCKFORD_MINUSCULO = '[0-9a-hjkmnp-tv-z]';
const CROCKFORD_MAIUSCULO = '[0-9A-HJKMNP-TV-Z]';

describe('códigos de recuperação', () => {
  it('são 10, no formato xxxxx-xxxxx do alfabeto de Crockford, todos diferentes', () => {
    const codigos = gerarCodigosDeRecuperacao();
    expect(codigos).toHaveLength(10);
    for (const codigo of codigos) {
      expect(codigo).toMatch(new RegExp(`^${CROCKFORD_MINUSCULO}{5}-${CROCKFORD_MINUSCULO}{5}$`));
    }
    expect(new Set(codigos).size).toBe(10);
  });

  it.each([
    ['A7K2M-9QX4T', 'A7K2M9QX4T'],
    ['a7k2m 9qx4t', 'A7K2M9QX4T'],
    ['  a7k2m9qx4t ', 'A7K2M9QX4T'],
    ['l1o0i-abcde', '11001ABCDE'],
  ])('%j é lido como %j', (digitado, normalizado) => {
    expect(normalizarCodigoDeRecuperacao(digitado)).toBe(normalizado);
  });

  it('o hash é o mesmo para o código escrito de outro jeito, e outro para outro código', () => {
    expect(hashDoCodigo('a7k2m-9qx4t')).toEqual(hashDoCodigo('A7K2M9QX4T'));
    expect(hashDoCodigo('a7k2m-9qx4t')).not.toEqual(hashDoCodigo('a7k2m-9qx4v'));
    expect(hashDoCodigo('a7k2m-9qx4t')).toHaveLength(32);
  });

  it.each([
    ['a7k2m-9qx4t', true],
    ['A7K2M9QX4T', true],
    ['123456', false],
    ['a7k2m-9qx4', false],
    ['u7k2m-9qx4t', false],
  ])('%j parece código de recuperação: %s', (digitado, parece) => {
    expect(pareceCodigoDeRecuperacao(digitado)).toBe(parece);
  });
});

describe('senha temporária', () => {
  it('tem 16 caracteres do alfabeto de Crockford, em grupos de 4', () => {
    expect(gerarSenhaTemporaria()).toMatch(
      new RegExp(`^${CROCKFORD_MAIUSCULO}{4}(-${CROCKFORD_MAIUSCULO}{4}){3}$`),
    );
  });

  it('muda a cada geração', () => {
    expect(gerarSenhaTemporaria()).not.toBe(gerarSenhaTemporaria());
  });
});
