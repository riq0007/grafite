// Os canais de fora da aplicação (spec notificacoes, "E-mail do crítico na hora", "Resumo diário por
// e-mail" e "Push por severidade"; change p3c-email-e-push, design, decisão 4).
import { describe, expect, it } from 'vitest';
import { PADRAO_DE_FABRICA } from '../preferencias/preferencias.ts';
import { canaisNaHora, type DestinoDosCanais, recebeResumo } from './canais.ts';

const SERVIDOR = { email: true, push: true };

/** A conta de fábrica, com a pessoa com e-mail e um aparelho inscrito. */
const destino = (
  dados: Partial<Omit<DestinoDosCanais, 'preferencias'>> = {},
  preferencias: Partial<DestinoDosCanais['preferencias']> = {},
): DestinoDosCanais => ({
  email: 'ana.souza@empresa.com.br',
  aparelhos: 1,
  ...dados,
  preferencias: { ...PADRAO_DE_FABRICA.notificacoes, ...preferencias },
});

describe('canais na hora', () => {
  it('o crítico vai por e-mail e por push, de fábrica', () => {
    expect(canaisNaHora('critico', destino(), SERVIDOR)).toEqual({ email: true, push: true });
  });

  it('a pessoa sem e-mail não recebe e-mail, e o push continua', () => {
    expect(canaisNaHora('critico', destino({ email: null }), SERVIDOR)).toEqual({
      email: false,
      push: true,
    });
  });

  it('o e-mail do crítico desligado não sai na hora', () => {
    expect(canaisNaHora('critico', destino({}, { emailCritico: false }), SERVIDOR).email).toBe(
      false,
    );
  });

  it('Atenção e Informação nunca vão por e-mail na hora', () => {
    expect(canaisNaHora('atencao', destino(), SERVIDOR).email).toBe(false);
    expect(canaisNaHora('info', destino(), SERVIDOR).email).toBe(false);
  });

  it('o push vai só nas severidades escolhidas', () => {
    expect(canaisNaHora('atencao', destino(), SERVIDOR).push).toBe(false);
    expect(canaisNaHora('atencao', destino({}, { pushAtencao: true }), SERVIDOR).push).toBe(true);
    expect(canaisNaHora('info', destino({}, { pushInformacao: true }), SERVIDOR).push).toBe(true);
    expect(canaisNaHora('critico', destino({}, { pushCritico: false }), SERVIDOR).push).toBe(false);
  });

  it('com o Foco ligado, só o Crítico vai para o push', () => {
    const comFoco = destino({}, { pushAtencao: true, pushInformacao: true, foco: true });
    expect(canaisNaHora('atencao', comFoco, SERVIDOR).push).toBe(false);
    expect(canaisNaHora('info', comFoco, SERVIDOR).push).toBe(false);
    expect(canaisNaHora('critico', comFoco, SERVIDOR).push).toBe(true);
  });

  it('sem aparelho inscrito, não há push', () => {
    expect(canaisNaHora('critico', destino({ aparelhos: 0 }), SERVIDOR).push).toBe(false);
  });

  it('o servidor sem o canal não manda por ele', () => {
    expect(canaisNaHora('critico', destino(), { email: false, push: true })).toEqual({
      email: false,
      push: true,
    });
    expect(canaisNaHora('critico', destino(), { email: true, push: false })).toEqual({
      email: true,
      push: false,
    });
  });
});

describe('resumo', () => {
  it('a conta com o resumo diário e a pessoa com e-mail recebe o resumo, de fábrica', () => {
    expect(recebeResumo(destino(), SERVIDOR)).toBe(true);
  });

  it('o resumo desligado, a pessoa sem e-mail ou o servidor sem e-mail não recebem', () => {
    expect(recebeResumo(destino({}, { resumo: 'desligado' }), SERVIDOR)).toBe(false);
    expect(recebeResumo(destino({ email: null }), SERVIDOR)).toBe(false);
    expect(recebeResumo(destino(), { email: false, push: true })).toBe(false);
  });

  it('o resumo não depende do push nem do Foco', () => {
    expect(recebeResumo(destino({ aparelhos: 0 }, { foco: true }), SERVIDOR)).toBe(true);
  });
});
