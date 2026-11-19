import { describe, expect, it } from 'vitest';
import {
  estaFechado,
  limiteDoFechamento,
  momentoDoFechamento,
  situacaoDoChamado,
  ultimoDiaParaReabrir,
} from './fechamento.ts';

const SP = 'America/Sao_Paulo';
const NY = 'America/New_York';
const SANTIAGO = 'America/Santiago';

describe('o fechamento do chamado', () => {
  it('Fecha no dia 18: o #1045, resolvido em 11/11 às 11:20, reabre até 18/11 e fecha à meia-noite do fim dele', () => {
    const resolvidoEm = new Date('2026-11-11T11:20:00-03:00');
    expect(ultimoDiaParaReabrir(resolvidoEm, SP)).toEqual({ ano: 2026, mes: 11, dia: 18 });
    expect(momentoDoFechamento(resolvidoEm, SP)).toEqual(new Date('2026-11-19T00:00:00-03:00'));
  });

  it('a resolução às 23:59 conta pelo dia do fuso, e não pelo de UTC', () => {
    // Às 23:59 de 11/11 em São Paulo, já é 12/11 em UTC.
    const resolvidoEm = new Date('2026-11-11T23:59:00-03:00');
    expect(ultimoDiaParaReabrir(resolvidoEm, SP)).toEqual({ ano: 2026, mes: 11, dia: 18 });
    expect(momentoDoFechamento(resolvidoEm, SP)).toEqual(new Date('2026-11-19T00:00:00-03:00'));
    // Um minuto depois, a resolução já é do dia 12.
    expect(ultimoDiaParaReabrir(new Date('2026-11-12T00:00:00-03:00'), SP)).toEqual({
      ano: 2026,
      mes: 11,
      dia: 19,
    });
    // O mesmo instante, no fuso de UTC, é do dia 12.
    expect(ultimoDiaParaReabrir(resolvidoEm, 'UTC')).toEqual({ ano: 2026, mes: 11, dia: 19 });
  });

  it('a virada do mês e a do ano', () => {
    const noFimDoMes = new Date('2026-11-25T10:00:00-03:00');
    expect(ultimoDiaParaReabrir(noFimDoMes, SP)).toEqual({ ano: 2026, mes: 12, dia: 2 });
    expect(momentoDoFechamento(noFimDoMes, SP)).toEqual(new Date('2026-12-03T00:00:00-03:00'));
    const noFimDoAno = new Date('2026-12-28T10:00:00-03:00');
    expect(ultimoDiaParaReabrir(noFimDoAno, SP)).toEqual({ ano: 2027, mes: 1, dia: 4 });
    expect(momentoDoFechamento(noFimDoAno, SP)).toEqual(new Date('2027-01-05T00:00:00-03:00'));
  });

  it('o horário de verão de America/New_York: a meia-noite com a hora de depois da troca', () => {
    // O verão começa em 08/03/2026: resolvido no inverno (UTC-5), fecha no verão (UTC-4).
    expect(momentoDoFechamento(new Date('2026-03-05T10:00:00-05:00'), NY)).toEqual(
      new Date('2026-03-13T00:00:00-04:00'),
    );
    // O verão acaba em 01/11/2026: resolvido no verão, fecha no inverno.
    expect(momentoDoFechamento(new Date('2026-10-28T10:00:00-04:00'), NY)).toEqual(
      new Date('2026-11-05T00:00:00-05:00'),
    );
  });

  it('no fuso cuja meia-noite o verão pula, a hora que ele deixa no lugar dela', () => {
    // Em America/Santiago, o 06/09/2026 começa à 01:00 (UTC-3): a meia-noite não existe.
    expect(momentoDoFechamento(new Date('2026-08-29T10:00:00-04:00'), SANTIAGO)).toEqual(
      new Date('2026-09-06T01:00:00-03:00'),
    );
  });
});

describe('o chamado fechado', () => {
  const resolvido = {
    situacao: 'resolvido' as const,
    resolvidoEm: new Date('2026-11-11T11:20:00-03:00'),
    fechadoEm: null,
  };

  it('o resolvido vencido que a tarefa ainda não fechou já está fechado, desde a meia-noite', () => {
    expect(estaFechado(resolvido, new Date('2026-11-18T23:59:59-03:00'), SP)).toBe(false);
    expect(estaFechado(resolvido, new Date('2026-11-19T00:00:00-03:00'), SP)).toBe(true);
  });

  it('o chamado com o fechado_em está fechado, e o que não está resolvido, não', () => {
    const fechado = { ...resolvido, fechadoEm: new Date('2026-11-19T00:00:30-03:00') };
    expect(estaFechado(fechado, new Date('2026-11-12T10:00:00-03:00'), SP)).toBe(true);
    for (const situacao of ['triagem', 'em-atendimento', 'aguardando'] as const) {
      const aberto = { situacao, resolvidoEm: null, fechadoEm: null };
      expect(estaFechado(aberto, new Date('2027-01-01T10:00:00-03:00'), SP)).toBe(false);
    }
  });

  it('a situação lê o Fechado pelo fechado_em', () => {
    expect(situacaoDoChamado({ situacao: 'resolvido', fechadoEm: new Date() })).toBe('fechado');
    expect(situacaoDoChamado({ situacao: 'resolvido', fechadoEm: null })).toBe('resolvido');
    expect(situacaoDoChamado({ situacao: 'aguardando', fechadoEm: null })).toBe('aguardando');
  });
});

describe('o limite da tarefa do fechamento', () => {
  it('vencido é o resolvido antes do começo do dia de 7 dias atrás, no fuso', () => {
    expect(limiteDoFechamento(new Date('2026-11-19T00:00:30-03:00'), SP)).toEqual(
      new Date('2026-11-12T00:00:00-03:00'),
    );
  });

  it('o limite e o momento do fechamento dizem o mesmo, também na troca do verão', () => {
    const casos: [string, string, string][] = [
      [SP, '2026-11-11T11:20:00-03:00', '2026-11-19T00:00:00-03:00'],
      [SP, '2026-11-11T23:59:00-03:00', '2026-11-18T23:59:59-03:00'],
      [NY, '2026-03-05T23:30:00-05:00', '2026-03-13T00:00:00-04:00'],
      [NY, '2026-10-28T00:10:00-04:00', '2026-11-04T23:59:00-05:00'],
      [SANTIAGO, '2026-08-29T10:00:00-04:00', '2026-09-06T01:00:00-03:00'],
    ];
    for (const [fuso, resolvido, agora] of casos) {
      const resolvidoEm = new Date(resolvido);
      const momento = new Date(agora);
      expect(resolvidoEm < limiteDoFechamento(momento, fuso)).toBe(
        momento >= momentoDoFechamento(resolvidoEm, fuso),
      );
    }
  });
});
