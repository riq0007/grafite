import { describe, expect, it } from 'vitest';
import { comecoDoDia } from './fuso.ts';

describe('comecoDoDia', () => {
  it('é a meia-noite do dia no relógio do fuso', () => {
    const agora = new Date('2026-10-02T14:00:00Z');
    expect(comecoDoDia(agora, 'America/Sao_Paulo')).toEqual(new Date('2026-10-02T03:00:00Z'));
    expect(comecoDoDia(agora, 'UTC')).toEqual(new Date('2026-10-02T00:00:00Z'));
  });

  it('o dia é o do fuso, e não o de UTC', () => {
    // 02:00 em UTC ainda é 23:00 do dia anterior em São Paulo, e 20:00 já é o dia seguinte em Tóquio.
    expect(comecoDoDia(new Date('2026-10-02T02:00:00Z'), 'America/Sao_Paulo')).toEqual(
      new Date('2026-10-01T03:00:00Z'),
    );
    expect(comecoDoDia(new Date('2026-10-02T20:00:00Z'), 'Asia/Tokyo')).toEqual(
      new Date('2026-10-02T15:00:00Z'),
    );
  });

  it('a própria meia-noite começa o dia', () => {
    const meiaNoite = new Date('2026-10-02T03:00:00Z');
    expect(comecoDoDia(meiaNoite, 'America/Sao_Paulo')).toEqual(meiaNoite);
  });
});
