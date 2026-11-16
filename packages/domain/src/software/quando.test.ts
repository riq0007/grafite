// O quando da distribuição e a volta do agente (spec distribuicao-de-software, "Quando instalar" e
// "Deploy pelo agente do GLPI"; change software-por-pacote, design, decisões 7 e 8), com o horário de
// verão e a virada do dia no fuso de quem enviou.
import { describe, expect, it } from 'vitest';
import {
  conferirQuando,
  expirationDoContato,
  instanteNoFuso,
  linhaDoChamado,
  MENSAGENS_DO_QUANDO,
  type PedidoNoTempo,
  podeSeguir,
  proximoMomento,
} from './quando.ts';

const SP = 'America/Sao_Paulo';
const NY = 'America/New_York';
const TOQUIO = 'Asia/Tokyo';

const em = (texto: string) => new Date(texto);
const agora: PedidoNoTempo = { quando: 'agora', aPartirDe: null, fuso: null };
const noite = (fuso = SP): PedidoNoTempo => ({ quando: 'noite', aPartirDe: null, fuso });
const dia = (aPartirDe: string, fuso = SP): PedidoNoTempo => ({
  quando: 'dia',
  aPartirDe: em(aPartirDe),
  fuso,
});

describe('podeSeguir', () => {
  it('agora segue sempre, e o dia marcado, a partir do momento dele', () => {
    expect(podeSeguir(agora, em('2026-11-14T03:00:00-03:00'))).toBe(true);
    const marcado = dia('2026-11-15T22:00:00-03:00');
    expect(podeSeguir(marcado, em('2026-11-15T21:59:00-03:00'))).toBe(false);
    expect(podeSeguir(marcado, em('2026-11-15T22:00:00-03:00'))).toBe(true);
    expect(podeSeguir(marcado, em('2026-11-17T10:00:00-03:00'))).toBe(true);
  });

  it('a janela da noite vai das 22:00 às 06:00 no fuso, toda noite', () => {
    const casos: [string, boolean][] = [
      ['2026-11-14T14:00:00-03:00', false],
      ['2026-11-14T21:59:00-03:00', false],
      ['2026-11-14T22:00:00-03:00', true],
      ['2026-11-14T23:30:00-03:00', true],
      ['2026-11-15T00:00:00-03:00', true],
      ['2026-11-15T05:59:00-03:00', true],
      ['2026-11-15T06:00:00-03:00', false],
      ['2026-11-16T22:10:00-03:00', true],
    ];
    for (const [momento, segue] of casos) expect(podeSeguir(noite(), em(momento))).toBe(segue);
  });

  it('a janela segue o relógio do fuso no horário de verão', () => {
    // Em Nova York, o verão de 2026 começa em 08/03, às 02:00, que vira 03:00.
    expect(podeSeguir(noite(NY), em('2026-03-08T01:30:00-05:00'))).toBe(true);
    expect(podeSeguir(noite(NY), em('2026-03-08T03:30:00-04:00'))).toBe(true);
    expect(podeSeguir(noite(NY), em('2026-03-08T06:00:00-04:00'))).toBe(false);
    // No verão, as 22:00 de lá são as 02:00 do dia seguinte em UTC.
    expect(podeSeguir(noite(NY), em('2026-07-01T01:59:00Z'))).toBe(false);
    expect(podeSeguir(noite(NY), em('2026-07-01T02:00:00Z'))).toBe(true);
  });
});

describe('proximoMomento', () => {
  it('na janela da noite, as próximas 22:00 do fuso, ou o próprio momento dentro dela', () => {
    expect(proximoMomento(noite(), em('2026-11-14T15:00:00-03:00'))).toEqual(
      em('2026-11-14T22:00:00-03:00'),
    );
    expect(proximoMomento(noite(), em('2026-11-15T06:30:00-03:00'))).toEqual(
      em('2026-11-15T22:00:00-03:00'),
    );
    expect(proximoMomento(noite(), em('2026-11-14T23:00:00-03:00'))).toEqual(
      em('2026-11-14T23:00:00-03:00'),
    );
  });

  it('o dia marcado ainda por vir, ou o momento quando ele já passou; agora é o momento', () => {
    const momento = em('2026-11-14T15:00:00-03:00');
    expect(proximoMomento(dia('2026-11-16T10:00:00-03:00'), momento)).toEqual(
      em('2026-11-16T10:00:00-03:00'),
    );
    expect(proximoMomento(dia('2026-11-13T10:00:00-03:00'), momento)).toEqual(momento);
    expect(proximoMomento(agora, momento)).toEqual(momento);
  });

  it('as 22:00 no dia da troca do horário de verão e na virada do dia em UTC', () => {
    expect(proximoMomento(noite(NY), em('2026-03-07T12:00:00-05:00'))).toEqual(
      em('2026-03-08T03:00:00Z'),
    );
    expect(proximoMomento(noite(NY), em('2026-03-08T12:00:00-04:00'))).toEqual(
      em('2026-03-09T02:00:00Z'),
    );
    // Às 09:00 de São Paulo já é dia 15 em UTC; e em Tóquio as 06:30 do dia 15 são o dia 14 em UTC.
    expect(proximoMomento(noite(), em('2026-11-15T09:00:00-03:00'))).toEqual(
      em('2026-11-16T01:00:00Z'),
    );
    expect(proximoMomento(noite(TOQUIO), em('2026-11-14T21:30:00Z'))).toEqual(
      em('2026-11-15T13:00:00Z'),
    );
    expect(podeSeguir(noite(TOQUIO), em('2026-11-14T14:00:00Z'))).toBe(true);
  });
});

describe('expirationDoContato', () => {
  it('Janela da noite: às 15:00, o agente volta em 480 minutos; às 14:00, em 540', () => {
    expect(expirationDoContato([noite()], em('2026-11-14T15:00:00-03:00'))).toBe(480);
    expect(expirationDoContato([noite()], em('2026-11-14T14:00:00-03:00'))).toBe(540);
    expect(expirationDoContato([noite()], em('2026-11-14T15:00:30-03:00'))).toBe(480);
    expect(expirationDoContato([noite()], em('2026-11-14T21:30:00-03:00'))).toBe(90);
  });

  it('fica com o menor dos pedidos que ainda não podem seguir, até 24 horas', () => {
    const momento = em('2026-11-14T15:00:00-03:00');
    expect(expirationDoContato([], momento)).toBe(1440);
    expect(expirationDoContato([agora, noite()], momento)).toBe(480);
    expect(expirationDoContato([agora], momento)).toBe(1440);
    expect(expirationDoContato([dia('2026-11-17T22:00:00-03:00')], momento)).toBe(1440);
    expect(expirationDoContato([dia('2026-11-15T10:00:00-03:00'), noite()], momento)).toBe(480);
    // Dentro da janela, o pedido segue já, e o prazo é o dos outros.
    expect(
      expirationDoContato(
        [noite(), dia('2026-11-15T10:00:00-03:00')],
        em('2026-11-14T23:00:00-03:00'),
      ),
    ).toBe(720);
  });
});

describe('instanteNoFuso', () => {
  it('o dia e a hora do relógio do fuso, com o horário de verão', () => {
    expect(instanteNoFuso('2026-11-15', '22:00', SP)).toEqual(em('2026-11-16T01:00:00Z'));
    expect(instanteNoFuso('2026-03-07', '22:00', NY)).toEqual(em('2026-03-08T03:00:00Z'));
    expect(instanteNoFuso('2026-03-08', '22:00', NY)).toEqual(em('2026-03-09T02:00:00Z'));
    expect(instanteNoFuso('2026-11-15', '08:30', TOQUIO)).toEqual(em('2026-11-14T23:30:00Z'));
  });
});

describe('conferirQuando', () => {
  const momento = em('2026-11-14T15:00:00-03:00');

  it('agora não precisa do fuso e não guarda o dia', () => {
    expect(
      conferirQuando({ quando: 'agora', aPartirDe: '2026-11-20T10:00:00Z', fuso: null }, momento),
    ).toEqual({
      ok: true,
      dados: { quando: 'agora', aPartirDe: null, fuso: null },
    });
  });

  it('a noite e o dia pedem um fuso que existe', () => {
    expect(conferirQuando({ quando: 'noite', aPartirDe: null, fuso: SP }, momento)).toEqual({
      ok: true,
      dados: { quando: 'noite', aPartirDe: null, fuso: SP },
    });
    expect(conferirQuando({ quando: 'noite', aPartirDe: null, fuso: null }, momento)).toEqual({
      ok: false,
      erros: { fuso: MENSAGENS_DO_QUANDO.fusoDesconhecido },
    });
    expect(
      conferirQuando({ quando: 'noite', aPartirDe: null, fuso: 'America/Lugar_Nenhum' }, momento),
    ).toEqual({ ok: false, erros: { fuso: MENSAGENS_DO_QUANDO.fusoDesconhecido } });
  });

  it('o dia é de amanhã em diante no fuso de quem envia', () => {
    expect(
      conferirQuando({ quando: 'dia', aPartirDe: '2026-11-15T22:00:00-03:00', fuso: SP }, momento),
    ).toEqual({
      ok: true,
      dados: { quando: 'dia', aPartirDe: em('2026-11-15T22:00:00-03:00'), fuso: SP },
    });
    expect(
      conferirQuando({ quando: 'dia', aPartirDe: '2026-11-14T22:00:00-03:00', fuso: SP }, momento),
    ).toEqual({ ok: false, erros: { aPartirDe: MENSAGENS_DO_QUANDO.diaDeHoje } });
    expect(conferirQuando({ quando: 'dia', aPartirDe: null, fuso: SP }, momento)).toEqual({
      ok: false,
      erros: { aPartirDe: MENSAGENS_DO_QUANDO.diaFaltando },
    });
    expect(conferirQuando({ quando: 'dia', aPartirDe: 'amanhã', fuso: SP }, momento)).toEqual({
      ok: false,
      erros: { aPartirDe: MENSAGENS_DO_QUANDO.diaFaltando },
    });
  });

  it('o dia chega como o instante ISO com o fuso; o texto sem ele e as formas que o Date inventa são recusados', () => {
    for (const aPartirDe of [
      '2026-11-15T22:00:00-03:00',
      '2026-11-16T01:00:00Z',
      '2026-11-16T01:00:00.000Z',
    ]) {
      expect(conferirQuando({ quando: 'dia', aPartirDe, fuso: SP }, momento).ok, aPartirDe).toBe(
        true,
      );
    }
    for (const aPartirDe of [
      // Sem o fuso, o Date leria a hora do servidor.
      '2026-11-15T22:00:00',
      '2026-11-15',
      '2026-11-15T22:00-03:00',
      '2026-11-15T22:00:00+0300',
      'Sun Nov 15 2026 22:00:00 GMT-0300',
      '2026-02-30T10:00:00Z',
    ]) {
      expect(conferirQuando({ quando: 'dia', aPartirDe, fuso: SP }, momento), aPartirDe).toEqual({
        ok: false,
        erros: { aPartirDe: MENSAGENS_DO_QUANDO.diaFaltando },
      });
    }
  });

  it('o dia vai até daqui a um ano, pelo calendário do fuso de quem envia', () => {
    const depoisDeUmAno = { ok: false, erros: { aPartirDe: MENSAGENS_DO_QUANDO.diaDepoisDeUmAno } };
    expect(
      conferirQuando({ quando: 'dia', aPartirDe: '2027-11-14T22:00:00-03:00', fuso: SP }, momento)
        .ok,
    ).toBe(true);
    expect(
      conferirQuando({ quando: 'dia', aPartirDe: '2027-11-15T08:00:00-03:00', fuso: SP }, momento),
    ).toEqual(depoisDeUmAno);
    // 23:30 de São Paulo já é dia 15 em UTC: o teto é o dia 14 do ano que vem, lá.
    const tarde = em('2026-11-14T23:30:00-03:00');
    expect(
      conferirQuando({ quando: 'dia', aPartirDe: '2027-11-14T23:00:00-03:00', fuso: SP }, tarde).ok,
    ).toBe(true);
    expect(
      conferirQuando({ quando: 'dia', aPartirDe: '2027-11-15T00:30:00-03:00', fuso: SP }, tarde),
    ).toEqual(depoisDeUmAno);
    // 01:00 de Tóquio do dia 15 ainda é dia 14 em UTC: o teto é o dia 15, lá.
    const emToquio = em('2026-11-14T16:00:00Z');
    expect(
      conferirQuando({ quando: 'dia', aPartirDe: '2027-11-15T13:00:00Z', fuso: TOQUIO }, emToquio)
        .ok,
    ).toBe(true);
    expect(
      conferirQuando({ quando: 'dia', aPartirDe: '2027-11-15T15:30:00Z', fuso: TOQUIO }, emToquio),
    ).toEqual(depoisDeUmAno);
  });

  it('a virada do dia é a do fuso, e não a de UTC', () => {
    // 23:30 de São Paulo já é dia 15 em UTC, e as 08:00 do dia 15 são amanhã lá.
    expect(
      conferirQuando(
        { quando: 'dia', aPartirDe: '2026-11-15T08:00:00-03:00', fuso: SP },
        em('2026-11-14T23:30:00-03:00'),
      ).ok,
    ).toBe(true);
    // 01:00 de Tóquio do dia 15 ainda é dia 14 em UTC, e as 22:00 do dia 15 são hoje lá.
    expect(
      conferirQuando(
        { quando: 'dia', aPartirDe: '2026-11-15T13:00:00Z', fuso: TOQUIO },
        em('2026-11-14T16:00:00Z'),
      ),
    ).toEqual({ ok: false, erros: { aPartirDe: MENSAGENS_DO_QUANDO.diaDeHoje } });
  });
});

describe('linhaDoChamado', () => {
  it('diz a hora do chamado no fuso de quem enviou e se o agente respondeu', () => {
    expect(linhaDoChamado(em('2026-11-16T01:00:00Z'), SP, true)).toBe('Chamado às 22:00');
    expect(linhaDoChamado(em('2026-11-16T01:05:00Z'), SP, false)).toBe(
      'Chamado às 22:05, sem resposta',
    );
  });

  it('sem o fuso, a hora de UTC, como o pedido de antes da change', () => {
    expect(linhaDoChamado(em('2026-11-16T01:00:00Z'), null, true)).toBe('Chamado às 01:00');
  });
});
