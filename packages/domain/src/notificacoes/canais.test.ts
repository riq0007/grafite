// Os canais de fora da aplicação (spec notificacoes, "E-mail do crítico na hora", "Resumo diário por
// e-mail" e "Push por severidade"; change p3c-email-e-push, design, decisão 4).
import { describe, expect, it } from 'vitest';
import { PADRAO_DE_FABRICA } from '../preferencias/preferencias.ts';
import { canaisNaHora, type DestinoDosCanais, recebeResumo } from './canais.ts';
import type { SeveridadeDaNotificacao } from './notificacoes.ts';

const SERVIDOR = { email: true, push: true };

/** A notificação que não é mensagem, na severidade dada. */
const de = (severidade: SeveridadeDaNotificacao) => ({ severidade, mensagem: false });

/** A notificação de uma mensagem, do chat ou de um chamado, sempre na Informação. */
const MENSAGEM = { severidade: 'info', mensagem: true } as const;

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
    expect(canaisNaHora(de('critico'), destino(), SERVIDOR)).toEqual({ email: true, push: true });
  });

  it('a pessoa sem e-mail não recebe e-mail, e o push continua', () => {
    expect(canaisNaHora(de('critico'), destino({ email: null }), SERVIDOR)).toEqual({
      email: false,
      push: true,
    });
  });

  it('o e-mail do crítico desligado não sai na hora', () => {
    expect(canaisNaHora(de('critico'), destino({}, { emailCritico: false }), SERVIDOR).email).toBe(
      false,
    );
  });

  it('Atenção e Informação nunca vão por e-mail na hora', () => {
    expect(canaisNaHora(de('atencao'), destino(), SERVIDOR).email).toBe(false);
    expect(canaisNaHora(de('info'), destino(), SERVIDOR).email).toBe(false);
  });

  it('o push vai só nas severidades escolhidas', () => {
    expect(canaisNaHora(de('atencao'), destino(), SERVIDOR).push).toBe(false);
    expect(canaisNaHora(de('atencao'), destino({}, { pushAtencao: true }), SERVIDOR).push).toBe(
      true,
    );
    expect(canaisNaHora(de('info'), destino({}, { pushInformacao: true }), SERVIDOR).push).toBe(
      true,
    );
    expect(canaisNaHora(de('critico'), destino({}, { pushCritico: false }), SERVIDOR).push).toBe(
      false,
    );
  });

  it('com o Foco ligado, só o Crítico vai para o push', () => {
    const comFoco = destino({}, { pushAtencao: true, pushInformacao: true, foco: true });
    expect(canaisNaHora(de('atencao'), comFoco, SERVIDOR).push).toBe(false);
    expect(canaisNaHora(de('info'), comFoco, SERVIDOR).push).toBe(false);
    expect(canaisNaHora(de('critico'), comFoco, SERVIDOR).push).toBe(true);
  });

  it('sem aparelho inscrito, não há push', () => {
    expect(canaisNaHora(de('critico'), destino({ aparelhos: 0 }), SERVIDOR).push).toBe(false);
  });

  it('o servidor sem o canal não manda por ele', () => {
    expect(canaisNaHora(de('critico'), destino(), { email: false, push: true })).toEqual({
      email: false,
      push: true,
    });
    expect(canaisNaHora(de('critico'), destino(), { email: true, push: false })).toEqual({
      email: true,
      push: false,
    });
  });
});

describe('canais na hora da mensagem', () => {
  it('Mensagem no celular: vai por push com só o Crítico escolhido, de fábrica', () => {
    expect(canaisNaHora(MENSAGEM, destino(), SERVIDOR)).toEqual({ email: false, push: true });
  });

  it('vai por push qualquer que seja a severidade escolhida, também sem nenhuma', () => {
    const semPush = destino({}, { pushCritico: false, pushAtencao: false, pushInformacao: false });
    expect(canaisNaHora(MENSAGEM, semPush, SERVIDOR).push).toBe(true);
    expect(canaisNaHora({ severidade: 'atencao', mensagem: true }, semPush, SERVIDOR).push).toBe(
      true,
    );
  });

  it('Mensagem no modo Foco: não vai por push, qualquer que seja a severidade', () => {
    const comFoco = destino({}, { pushInformacao: true, foco: true });
    expect(canaisNaHora(MENSAGEM, comFoco, SERVIDOR).push).toBe(false);
    expect(canaisNaHora({ severidade: 'critico', mensagem: true }, comFoco, SERVIDOR).push).toBe(
      false,
    );
  });

  it('o e-mail na hora segue a severidade, como o de qualquer notificação', () => {
    expect(canaisNaHora(MENSAGEM, destino(), SERVIDOR).email).toBe(false);
    expect(canaisNaHora({ severidade: 'critico', mensagem: true }, destino(), SERVIDOR).email).toBe(
      true,
    );
  });

  it('sem aparelho inscrito, ou com o servidor sem o push, não há push', () => {
    expect(canaisNaHora(MENSAGEM, destino({ aparelhos: 0 }), SERVIDOR).push).toBe(false);
    expect(canaisNaHora(MENSAGEM, destino(), { email: true, push: false }).push).toBe(false);
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
