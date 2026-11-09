import { describe, expect, it } from 'vitest';
import { pendenciaDa } from './pendencia.ts';

const momento = new Date('2026-10-02T12:00:00Z');
const contaComum = { senhaTemporaria: false, exigeDoisPassos: false };

describe('pendenciaDa', () => {
  it('sem nada pendente, a sessão vale', () => {
    expect(pendenciaDa({ conta: contaComum, doisPassosAtivos: false, segundoPassoEm: null })).toBe(
      null,
    );
  });

  it('com os dois passos ativos, o código vem antes de tudo', () => {
    expect(
      pendenciaDa({
        conta: { senhaTemporaria: true, exigeDoisPassos: true },
        doisPassosAtivos: true,
        segundoPassoEm: null,
      }),
    ).toBe('segundo-passo');
  });

  it('depois do código, a senha temporária pede a troca', () => {
    expect(
      pendenciaDa({
        conta: { senhaTemporaria: true, exigeDoisPassos: true },
        doisPassosAtivos: true,
        segundoPassoEm: momento,
      }),
    ).toBe('trocar-senha');
  });

  it('a senha temporária vem antes do cadastro dos dois passos exigidos', () => {
    expect(
      pendenciaDa({
        conta: { senhaTemporaria: true, exigeDoisPassos: true },
        doisPassosAtivos: false,
        segundoPassoEm: null,
      }),
    ).toBe('trocar-senha');
  });

  it('a conta que exige os dois passos sem tê-los cadastra antes de seguir', () => {
    expect(
      pendenciaDa({
        conta: { senhaTemporaria: false, exigeDoisPassos: true },
        doisPassosAtivos: false,
        segundoPassoEm: null,
      }),
    ).toBe('cadastrar-dois-passos');
  });

  it('com o código já dado nesta sessão e nada mais, a sessão vale', () => {
    expect(
      pendenciaDa({
        conta: { senhaTemporaria: false, exigeDoisPassos: true },
        doisPassosAtivos: true,
        segundoPassoEm: momento,
      }),
    ).toBe(null);
  });
});
