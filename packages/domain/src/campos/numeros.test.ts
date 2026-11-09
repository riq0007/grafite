import { describe, expect, it } from 'vitest';
import { lerDecimal, lerInteiro, lerMoeda, mostrarDecimal, mostrarMoeda } from './numeros.ts';

const aceita = (valor: unknown) => ({ ok: true, valor });
const recusa = (erro: string) => ({ ok: false, erro });

describe('lerInteiro', () => {
  it.each([
    ['1024', 1024],
    ['1.024', 1024],
    ['1.234.567', 1234567],
    [' 42 ', 42],
    ['-5', -5],
    [1024, 1024],
    ['0', 0],
  ])('lê %j', (entrada, valor) => {
    expect(lerInteiro(entrada, {})).toEqual(aceita(valor));
  });

  it.each(['', '   ', null, undefined])('o vazio %j é a falta do valor, e não zero', (entrada) => {
    expect(lerInteiro(entrada, {})).toEqual(aceita(null));
  });

  it.each(['3,5', '1.5', 'abc', '12.34.5', 3.5, Number.NaN, Number.POSITIVE_INFINITY, true])(
    'recusa %j',
    (entrada) => {
      expect(lerInteiro(entrada, {})).toEqual(recusa('Use um número inteiro, como 1.024.'));
    },
  );

  it('recusa mais de 15 algarismos', () => {
    expect(lerInteiro('1234567890123456', {})).toEqual(recusa('Use até 15 algarismos.'));
    expect(lerInteiro('123456789012345', {})).toEqual(aceita(123456789012345));
  });

  it.each([
    [{ minimo: 1, maximo: 64 }, 128, 'Use um número de 1 a 64.'],
    [{ minimo: 1, maximo: 64 }, 0, 'Use um número de 1 a 64.'],
    [{ minimo: 1 }, 0, 'Use um número a partir de 1.'],
    [{ maximo: 64 }, 65, 'Use um número até 64.'],
    [{ minimo: 0, maximo: 100_000 }, 100_001, 'Use um número de 0 a 100.000.'],
  ])('com os limites %j, recusa %j', (configuracao, entrada, erro) => {
    expect(lerInteiro(entrada, configuracao)).toEqual(recusa(erro));
  });

  it('aceita os próprios limites', () => {
    expect(lerInteiro(1, { minimo: 1, maximo: 64 })).toEqual(aceita(1));
    expect(lerInteiro('64', { minimo: 1, maximo: 64 })).toEqual(aceita(64));
  });
});

describe('lerDecimal', () => {
  it.each([
    ['3,5', 3.5],
    ['1.234,56', 1234.56],
    ['1234,56', 1234.56],
    ['1.5', 1.5],
    ['1234.56', 1234.56],
    ['1.024', 1024],
    ['-0,5', -0.5],
    ['0,10', 0.1],
    ['3,500', 3.5],
    [3.5, 3.5],
    [7, 7],
  ])('lê %j', (entrada, valor) => {
    expect(lerDecimal(entrada, {})).toEqual(aceita(valor));
  });

  it.each(['abc', '1,2,3', '12.34,5', '1 234,56', 'R$ 3,50'])('recusa %j', (entrada) => {
    expect(lerDecimal(entrada, {})).toEqual(recusa('Use um número, como 3,5.'));
  });

  it('recusa as casas a mais, sem arredondar', () => {
    expect(lerDecimal('1,234', {})).toEqual(recusa('Use até 2 casas decimais.'));
    expect(lerDecimal('1,234', { casas: 3 })).toEqual(aceita(1.234));
    expect(lerDecimal('3,5', { casas: 1 })).toEqual(aceita(3.5));
    expect(lerDecimal('3,55', { casas: 1 })).toEqual(recusa('Use até 1 casa decimal.'));
    expect(lerDecimal('3,5', { casas: 0 })).toEqual(recusa('Use um número sem casas decimais.'));
    expect(lerDecimal(0.1 + 0.2, {})).toEqual(recusa('Use até 2 casas decimais.'));
  });

  it('recusa mais de 15 algarismos, contando as casas', () => {
    expect(lerDecimal('12.345.678.901.234,56', {})).toEqual(recusa('Use até 15 algarismos.'));
    expect(lerDecimal('1.234.567.890.123,45', {})).toEqual(aceita(1234567890123.45));
  });

  it('recusa fora dos limites, com os números em pt-BR', () => {
    expect(lerDecimal('0,4', { minimo: 0.5, maximo: 10 })).toEqual(
      recusa('Use um número de 0,5 a 10.'),
    );
  });
});

describe('lerMoeda', () => {
  it.each([
    ['R$ 1.234,56', 1234.56],
    ['R$1.234,56', 1234.56],
    ['R$ 1.234,56', 1234.56],
    ['1234,56', 1234.56],
    ['1.234', 1234],
    ['  R$  10 ', 10],
    ['R$ 0,00', 0],
    [1234.56, 1234.56],
    ['9.999.999.999,99', 9999999999.99],
  ])('lê %j', (entrada, valor) => {
    expect(lerMoeda(entrada)).toEqual(aceita(valor));
  });

  it.each(['dez reais', '1234,567', 'R$ 1,2,3', 10.005])('recusa %j', (entrada) => {
    expect(lerMoeda(entrada)).toEqual(recusa('Use um valor em reais, como R$ 1.234,56.'));
  });

  it.each(['-10', 10_000_000_000])('recusa %j, fora dos limites', (entrada) => {
    expect(lerMoeda(entrada)).toEqual(recusa('Use um valor de R$ 0,00 a R$ 9.999.999.999,99.'));
  });

  it('o vazio é a falta do valor', () => {
    expect(lerMoeda('')).toEqual(aceita(null));
  });
});

describe('mostrar os números', () => {
  it.each([
    [1024, '1.024'],
    [1234.56, '1.234,56'],
    [-0.5, '-0,5'],
    [3, '3'],
    [1234567890123.4, '1.234.567.890.123,4'],
  ])('mostra o decimal %j como %j', (valor, texto) => {
    expect(mostrarDecimal(valor)).toBe(texto);
  });

  it.each([
    [1234.56, 'R$ 1.234,56'],
    [0, 'R$ 0,00'],
    [10, 'R$ 10,00'],
    [10.5, 'R$ 10,50'],
    [9999999999.99, 'R$ 9.999.999.999,99'],
  ])('mostra a moeda %j como %j', (valor, texto) => {
    expect(mostrarMoeda(valor)).toBe(texto);
  });
});
