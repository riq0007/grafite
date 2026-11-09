import { describe, expect, it } from 'vitest';
import { lerTexto } from './textos.ts';

const aceita = (valor: unknown) => ({ ok: true, valor });
const recusa = (erro: string) => ({ ok: false, erro });

describe('lerTexto', () => {
  it.each([
    ['Sala do servidor', 'Sala do servidor'],
    ['  Sala   3  ', 'Sala   3'],
    [12345, '12345'],
  ])('lê %j', (entrada, valor) => {
    expect(lerTexto(entrada, 200)).toEqual(aceita(valor));
  });

  it.each(['', '   ', null, undefined])('o vazio %j é a falta do valor', (entrada) => {
    expect(lerTexto(entrada, 200)).toEqual(aceita(null));
  });

  it('conta os caracteres, e não os bytes', () => {
    expect(lerTexto('é'.repeat(200), 200)).toEqual(aceita('é'.repeat(200)));
    expect(lerTexto('😀'.repeat(200), 200)).toEqual(aceita('😀'.repeat(200)));
  });

  it('recusa o texto longo demais', () => {
    expect(lerTexto('a'.repeat(201), 200)).toEqual(recusa('Use até 200 caracteres.'));
    expect(lerTexto('a'.repeat(5001), 5000)).toEqual(recusa('Use até 5.000 caracteres.'));
    expect(lerTexto('a'.repeat(5000), 5000)).toEqual(aceita('a'.repeat(5000)));
  });

  it.each([true, { texto: 'a' }, ['a']])('recusa o que não é texto: %j', (entrada) => {
    expect(lerTexto(entrada, 200)).toEqual(recusa('Use um texto.'));
  });
});
