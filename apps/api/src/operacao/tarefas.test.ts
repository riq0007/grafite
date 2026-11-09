import { describe, expect, it } from 'vitest';
import { cronsDaAgenda } from './tarefas.ts';

describe('cronsDaAgenda', () => {
  it.each([
    [{ horario: '02:00', diaDoTeste: 0 }, 'semanal', { backup: '0 2 * * *', teste: '0 3 * * 0' }],
    [{ horario: '03:30', diaDoTeste: 3 }, 'semanal', { backup: '30 3 * * *', teste: '30 4 * * 3' }],
    [{ horario: '05:15', diaDoTeste: 3 }, 'diario', { backup: '15 5 * * *', teste: '15 6 * * *' }],
    // Uma hora depois do backup de sábado às 23:30 já é domingo.
    [
      { horario: '23:30', diaDoTeste: 6 },
      'semanal',
      { backup: '30 23 * * *', teste: '30 0 * * 0' },
    ],
  ] as const)('%j, %s: %j', (agenda, teste, crons) => {
    expect(cronsDaAgenda(agenda, teste)).toEqual(crons);
  });
});
