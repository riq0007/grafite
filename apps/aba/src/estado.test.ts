import { describe, expect, it } from 'vitest';
import { avisoDaResposta, avisoDaVolta, horaDa, seloDasNaoLidas, seloDasNovas } from './estado.ts';

const ANA = {
  quem: 'Ana Souza',
  numero: 1041,
  titulo: 'Sem acesso à pasta do Financeiro',
  momento: '2026-11-11T12:21:00.000Z',
};

describe('avisoDaResposta', () => {
  it('sem resposta por ver, não há aviso', () => {
    expect(avisoDaResposta(null)).toBeNull();
    expect(avisoDaResposta({ quantas: 0, ultima: null })).toBeNull();
  });

  it('com uma, diz quem respondeu por último', () => {
    expect(avisoDaResposta({ quantas: 1, ultima: ANA })).toEqual({
      resumo: '1 resposta nova',
      detalhe: 'Ana Souza',
      chegada: '1041 2026-11-11T12:21:00.000Z',
    });
  });

  it('com mais, conta os chamados e tira o nome', () => {
    expect(avisoDaResposta({ quantas: 3, ultima: ANA })).toMatchObject({
      resumo: '3 respostas novas',
      detalhe: null,
    });
  });

  it('a chegada muda com a resposta seguinte, para o ponto pulsar de novo', () => {
    const antes = avisoDaResposta({ quantas: 1, ultima: ANA });
    const depois = avisoDaResposta({
      quantas: 1,
      ultima: { ...ANA, momento: '2026-11-11T12:30:00.000Z' },
    });
    expect(depois?.chegada).not.toBe(antes?.chegada);
  });
});

describe('avisoDaVolta', () => {
  it('depois da apresentação, diz a hora em que a resposta chegou', () => {
    const hora = horaDa(ANA.momento);
    expect(avisoDaVolta({ quantas: 1, ultima: ANA })?.detalhe).toBe(`chegou às ${hora}`);
    expect(avisoDaVolta({ quantas: 3, ultima: ANA })).toMatchObject({
      resumo: '3 respostas novas',
      detalhe: `a última às ${hora}`,
    });
    expect(avisoDaVolta(null)).toBeNull();
  });
});

describe('horaDa', () => {
  it('dá a hora e os minutos, e nada para o momento que não é data', () => {
    expect(horaDa('2026-11-11T12:21:00.000Z')).toMatch(/^\d{2}:21$/);
    expect(horaDa('ontem')).toBe('');
  });
});

describe('os selos', () => {
  it('somem com zero ou sem o chat e os chamados', () => {
    expect(seloDasNaoLidas(0)).toBeNull();
    expect(seloDasNaoLidas(null)).toBeNull();
    expect(seloDasNovas(null)).toBeNull();
    expect(seloDasNaoLidas(1)).toBe('1 não lida');
    expect(seloDasNovas(2)).toBe('2 novas');
  });
});
