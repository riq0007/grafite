import { describe, expect, it } from 'vitest';
import { criarDataHora } from './dataHora.ts';

// Instantes fixos em UTC: o resultado não depende do fuso da máquina que roda o teste.
const brasilia = criarDataHora('America/Sao_Paulo');
const manaus = criarDataHora('America/Manaus');
const utc = criarDataHora('UTC');

describe('formatarHorario', () => {
  it('mostra dia da semana, dia, mês abreviado e horário no fuso pedido', () => {
    const instante = new Date('2026-09-24T17:32:00Z');
    expect(brasilia.formatarHorario(instante)).toBe('qui 24 set 14:32');
    expect(manaus.formatarHorario(instante)).toBe('qui 24 set 13:32');
    expect(utc.formatarHorario(instante)).toBe('qui 24 set 17:32');
  });

  it('dá a hora e o minuto com dois dígitos, e o dia sem zero à esquerda', () => {
    expect(brasilia.formatarHorario(new Date('2026-08-01T12:05:00Z'))).toBe('sáb 1 ago 09:05');
  });

  it('mostra a meia-noite como 00:00', () => {
    expect(brasilia.formatarHorario(new Date('2026-12-31T03:00:00Z'))).toBe('qui 31 dez 00:00');
  });

  it('muda o dia quando o fuso já passou da meia-noite', () => {
    const instante = new Date('2026-09-25T02:30:00Z');
    expect(brasilia.formatarHorario(instante)).toBe('qui 24 set 23:30');
    expect(utc.formatarHorario(instante)).toBe('sex 25 set 02:30');
  });
});

describe('formatarHora', () => {
  it('mostra hora e minuto, com dois dígitos, no fuso pedido', () => {
    expect(brasilia.formatarHora(new Date('2026-09-24T12:05:00Z'))).toBe('09:05');
    expect(manaus.formatarHora(new Date('2026-09-24T12:05:00Z'))).toBe('08:05');
  });

  it('mostra a meia-noite como 00:00', () => {
    expect(brasilia.formatarHora(new Date('2026-09-25T03:00:00Z'))).toBe('00:00');
  });
});

describe('formatarData', () => {
  it('mostra a data com o ano, no dia do fuso pedido', () => {
    const instante = new Date('2026-09-25T02:30:00Z');
    expect(brasilia.formatarData(instante)).toBe('24/09/2026');
    expect(utc.formatarData(instante)).toBe('25/09/2026');
  });
});

describe('formatarDia', () => {
  it('mostra dia da semana, dia e mês abreviados, sem os pontos das abreviações', () => {
    expect(brasilia.formatarDia(new Date('2026-09-23T15:00:00Z'))).toBe('qua 23 set');
  });

  it('usa o dia do fuso pedido', () => {
    const instante = new Date('2026-09-25T02:30:00Z');
    expect(brasilia.formatarDia(instante)).toBe('qui 24 set');
    expect(utc.formatarDia(instante)).toBe('sex 25 set');
  });
});

describe('grupoDoDia', () => {
  // 23:30 de 24 de setembro em Brasília, que já são 02:30 de 25 de setembro em UTC.
  const agora = new Date('2026-09-25T02:30:00Z');
  // 20:00 de 24 de setembro em Brasília.
  const notificacao = new Date('2026-09-24T23:00:00Z');

  it('vira o dia no fuso escolhido, e não no do sistema: "Hoje", às 20:00, e não "Ontem"', () => {
    expect(brasilia.grupoDoDia(notificacao, agora)).toBe('Hoje');
    expect(brasilia.formatarHora(notificacao)).toBe('20:00');
    expect(utc.grupoDoDia(notificacao, agora)).toBe('Ontem');
  });

  it('chama o dia anterior de "Ontem" e os outros pela data', () => {
    expect(brasilia.grupoDoDia(new Date('2026-09-24T02:00:00Z'), agora)).toBe('Ontem');
    expect(brasilia.grupoDoDia(new Date('2026-09-23T02:00:00Z'), agora)).toBe('ter 22 set');
  });

  it('reconhece "Ontem" na virada do mês e do ano', () => {
    expect(
      brasilia.grupoDoDia(new Date('2026-09-30T15:00:00Z'), new Date('2026-10-01T15:00:00Z')),
    ).toBe('Ontem');
    expect(
      brasilia.grupoDoDia(new Date('2026-12-31T15:00:00Z'), new Date('2027-01-01T15:00:00Z')),
    ).toBe('Ontem');
  });

  it('não se engana no dia em que o fuso muda para o horário de verão', () => {
    // Nova York adianta o relógio às 2:00 de 8 de março de 2026: o dia tem 23 horas.
    const novaYork = criarDataHora('America/New_York');
    const agoraEmNovaYork = new Date('2026-03-09T03:30:00Z'); // 23:30 de 8 de março
    expect(novaYork.grupoDoDia(new Date('2026-03-08T05:30:00Z'), agoraEmNovaYork)).toBe('Hoje');
    expect(novaYork.grupoDoDia(new Date('2026-03-08T04:30:00Z'), agoraEmNovaYork)).toBe('Ontem');
  });
});

describe('sem fuso', () => {
  it('segue o fuso do sistema', () => {
    const instante = new Date('2026-09-24T17:32:00Z');
    const doSistema = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    expect(criarDataHora().formatarHora(instante)).toBe(doSistema.format(instante));
  });
});

describe('fuso', () => {
  it('é o fuso pedido, ou o do sistema sem nenhum', () => {
    expect(manaus.fuso).toBe('America/Manaus');
    expect(criarDataHora().fuso).toBe(new Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});

describe('formatarDataEHora', () => {
  it('mostra a data com o ano e o horário no fuso pedido, para registros de qualquer época', () => {
    const instante = new Date('2026-10-07T17:32:00Z');
    expect(brasilia.formatarDataEHora(instante)).toBe('07/10/2026 14:32');
    expect(manaus.formatarDataEHora(instante)).toBe('07/10/2026 13:32');
    expect(brasilia.formatarDataEHora(new Date('2025-01-01T02:59:00Z'))).toBe('31/12/2024 23:59');
  });
});

describe('inicioDoDia e fimDoDia', () => {
  it('dão o primeiro e o último instante do dia no fuso pedido, com o dia inteiro incluído', () => {
    expect(brasilia.inicioDoDia('2026-10-01').toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(brasilia.fimDoDia('2026-10-02').toISOString()).toBe('2026-10-03T02:59:59.999Z');
    expect(manaus.inicioDoDia('2026-10-01').toISOString()).toBe('2026-10-01T04:00:00.000Z');
    expect(utc.fimDoDia('2026-12-31').toISOString()).toBe('2026-12-31T23:59:59.999Z');
  });
});
