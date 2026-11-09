// A agenda das rotinas em texto e a próxima execução (spec modulo-administracao, "Tela de tarefas
// com falha"; change regras-indicadores-e-tarefas, design, decisão 4): os padrões que o Grafite usa,
// a cada minuto, a cada N minutos e todo dia a uma hora, no fuso da rotina.
import { describe, expect, it } from 'vitest';
import { agendaEmTexto, proximaExecucao } from './agenda.ts';

describe('agendaEmTexto', () => {
  it('escreve os padrões do Grafite', () => {
    expect(agendaEmTexto('* * * * *')).toBe('A cada minuto');
    expect(agendaEmTexto('*/5 * * * *')).toBe('A cada 5 minutos');
    expect(agendaEmTexto('30 3 * * *')).toBe('Todo dia às 03:30');
    expect(agendaEmTexto('0 7 * * *')).toBe('Todo dia às 07:00');
  });

  it('o padrão desconhecido aparece como está', () => {
    expect(agendaEmTexto('0 7 * * 1')).toBe('Conforme a agenda 0 7 * * 1');
  });
});

describe('proximaExecucao', () => {
  const SP = 'America/Sao_Paulo';

  it('a cada N minutos: o próximo múltiplo', () => {
    expect(proximaExecucao('*/5 * * * *', SP, new Date('2026-10-28T10:02:30.000Z'))).toEqual(
      new Date('2026-10-28T10:05:00.000Z'),
    );
    expect(proximaExecucao('* * * * *', SP, new Date('2026-10-28T10:02:30.000Z'))).toEqual(
      new Date('2026-10-28T10:03:00.000Z'),
    );
  });

  it('todo dia: a hora no fuso da rotina, hoje ou amanhã', () => {
    // 03:30 em São Paulo é 06:30 UTC.
    expect(proximaExecucao('30 3 * * *', SP, new Date('2026-10-28T05:00:00.000Z'))).toEqual(
      new Date('2026-10-28T06:30:00.000Z'),
    );
    expect(proximaExecucao('30 3 * * *', SP, new Date('2026-10-28T07:00:00.000Z'))).toEqual(
      new Date('2026-10-29T06:30:00.000Z'),
    );
  });

  it('o padrão desconhecido não tem próxima', () => {
    expect(proximaExecucao('0 7 * * 1', SP, new Date('2026-10-28T05:00:00.000Z'))).toBeNull();
  });
});
