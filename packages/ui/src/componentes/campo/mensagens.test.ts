import { describe, expect, it } from 'vitest';
import { mensagemDeValidacao } from './mensagens.ts';

const valido: ValidityState = {
  badInput: false,
  customError: false,
  patternMismatch: false,
  rangeOverflow: false,
  rangeUnderflow: false,
  stepMismatch: false,
  tooLong: false,
  tooShort: false,
  typeMismatch: false,
  valid: true,
  valueMissing: false,
};
const invalido = (falha: Partial<ValidityState>): ValidityState => ({
  ...valido,
  valid: false,
  ...falha,
});
// A mensagem nativa vem no idioma do navegador; o Grafite fala pt-BR em qualquer um.
const nativa = ['Please fill out this field.'];

describe('mensagemDeValidacao', () => {
  it('campo de texto obrigatório vazio', () => {
    expect(mensagemDeValidacao(invalido({ valueMissing: true }), nativa)).toBe(
      'Preencha este campo.',
    );
  });

  it('escolha obrigatória sem opção escolhida', () => {
    expect(mensagemDeValidacao(invalido({ valueMissing: true }), nativa, 'escolha')).toBe(
      'Escolha uma opção.',
    );
  });

  it('formato inválido (e-mail, padrão)', () => {
    expect(mensagemDeValidacao(invalido({ typeMismatch: true }), nativa)).toBe('Formato inválido.');
    expect(mensagemDeValidacao(invalido({ patternMismatch: true }), nativa)).toBe(
      'Formato inválido.',
    );
  });

  it('mensagem própria (validação do campo ou da API) prevalece sobre a nativa', () => {
    expect(
      mensagemDeValidacao(invalido({ customError: true }), ['Patrimônio já cadastrado.']),
    ).toBe('Patrimônio já cadastrado.');
  });

  it('falha nativa sem tradução própria cai numa mensagem genérica em pt-BR', () => {
    expect(mensagemDeValidacao(invalido({ badInput: true }), nativa)).toBe('Valor inválido.');
  });
});
