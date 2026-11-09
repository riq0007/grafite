import { describe, expect, it } from 'vitest';
import { proximoHorario } from './agenda.ts';

const FUSO = 'America/Sao_Paulo';

describe('proximoHorario', () => {
  it.each([
    [
      'depois do horário do dia, é o do dia seguinte',
      '2026-10-02T12:00:00Z',
      '02:00',
      '2026-10-03T05:00:00.000Z',
    ],
    [
      'antes do horário do dia, é o do mesmo dia',
      '2026-10-02T03:30:00Z',
      '02:00',
      '2026-10-02T05:00:00.000Z',
    ],
    [
      'no minuto exato, é o do dia seguinte',
      '2026-10-02T05:00:00Z',
      '02:00',
      '2026-10-03T05:00:00.000Z',
    ],
    [
      '23:30 de São Paulo é 02:30 UTC do dia seguinte',
      '2026-10-02T12:00:00Z',
      '23:30',
      '2026-10-03T02:30:00.000Z',
    ],
  ])('%s', (_caso, agora, horario, proximo) => {
    expect(proximoHorario(horario, FUSO, new Date(agora)).toISOString()).toBe(proximo);
  });

  // No Linux (change servidor-linux-com-docker, design, decisão 11), o contêiner da API recebe o
  // fuso do servidor no TZ: o horário do backup não pode depender dele, só do fuso dado.
  it.each(['America/Sao_Paulo', 'UTC', 'Asia/Tokyo'])(
    'Fuso do servidor: com o TZ %s no contêiner, o backup das 02:00 é às 02:00 de São Paulo',
    (tz) => {
      const antes = process.env.TZ;
      process.env.TZ = tz;
      try {
        expect(proximoHorario('02:00', FUSO, new Date('2026-10-02T12:00:00Z')).toISOString()).toBe(
          '2026-10-03T05:00:00.000Z',
        );
      } finally {
        if (antes === undefined) delete process.env.TZ;
        else process.env.TZ = antes;
      }
    },
  );
});
