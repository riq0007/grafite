import { describe, expect, it } from 'vitest';
import { normalizarUsuario, validarUsuario } from './usuario.ts';

describe('normalizarUsuario', () => {
  it.each([
    ['  Joao.Silva ', 'joao.silva'],
    ['ANA', 'ana'],
    ['\tbruno_lima\n', 'bruno_lima'],
  ])('%j vira %j', (digitado, esperado) => {
    expect(normalizarUsuario(digitado)).toBe(esperado);
  });
});

describe('validarUsuario', () => {
  it.each(['joao.silva', 'ana_souza-2', 'abc', 'a'.repeat(64), '1ana', '  Joao.Silva '])(
    'aceita %j',
    (usuario) => {
      expect(validarUsuario(usuario)).toBeNull();
    },
  );

  it.each([
    ['ab', 'Use de 3 a 64 caracteres.'],
    ['a'.repeat(65), 'Use de 3 a 64 caracteres.'],
    ['   ', 'Use de 3 a 64 caracteres.'],
    ['joão silva', 'Use só letras sem acento, números, ponto (.), hífen (-) e sublinhado (_).'],
    ['ana@empresa', 'Use só letras sem acento, números, ponto (.), hífen (-) e sublinhado (_).'],
    ['.helena', 'Comece por uma letra ou um número.'],
    ['_ana', 'Comece por uma letra ou um número.'],
  ])('recusa %j: %s', (usuario, motivo) => {
    expect(validarUsuario(usuario)).toBe(motivo);
  });
});
