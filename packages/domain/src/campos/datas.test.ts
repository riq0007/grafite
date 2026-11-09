import { describe, expect, it } from 'vitest';
import { lerData, mostrarData } from './datas.ts';

const aceita = (valor: unknown) => ({ ok: true, valor });
const recusa = (erro: string) => ({ ok: false, erro });
const INVALIDA = recusa('Data inválida: use dd/mm/aaaa.');
const FORA = recusa('Use uma data entre 1900 e 2200.');

describe('lerData', () => {
  it.each([
    ['09/10/2026', '2026-10-09'],
    ['9/1/2026', '2026-01-09'],
    [' 09/10/2026 ', '2026-10-09'],
    ['2026-10-09', '2026-10-09'],
    ['2026-10-09T13:45:00Z', '2026-10-09'],
    ['29/02/2024', '2024-02-29'],
    ['31/12/2200', '2200-12-31'],
    ['01/01/1900', '1900-01-01'],
  ])('lê o texto %j', (entrada, valor) => {
    expect(lerData(entrada)).toEqual(aceita(valor));
  });

  it.each([
    [45658, '2025-01-01'],
    [45658.75, '2025-01-01'],
    [61, '1900-03-01'],
    [44927, '2023-01-01'],
  ])('lê o número de série do Excel %j', (entrada, valor) => {
    expect(lerData(entrada)).toEqual(aceita(valor));
  });

  it('lê a data de uma célula de planilha', () => {
    expect(lerData(new Date(Date.UTC(2025, 0, 1)))).toEqual(aceita('2025-01-01'));
  });

  it.each([
    '31/02/2026',
    '29/02/2026',
    '2026-13-01',
    'ontem',
    '09-10-2026',
    '45658',
    60,
    1,
    -5,
    true,
  ])('recusa %j', (entrada) => {
    expect(lerData(entrada)).toEqual(INVALIDA);
  });

  it.each(['31/12/1899', '01/01/2201', '2201-01-01', 110_000])(
    'recusa %j, fora de 1900 a 2200',
    (entrada) => {
      expect(lerData(entrada)).toEqual(FORA);
    },
  );

  it.each(['', '  ', null, undefined])('o vazio %j é a falta do valor', (entrada) => {
    expect(lerData(entrada)).toEqual(aceita(null));
  });

  it('mostra em dd/mm/aaaa', () => {
    expect(mostrarData('2026-10-09')).toBe('09/10/2026');
  });
});
