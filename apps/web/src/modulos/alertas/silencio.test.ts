import { describe, expect, it } from 'vitest';
import { momentoDoSilencio } from './silencio.ts';

// O primeiro instante do dia em São Paulo (UTC-3), como o useDataHora() o dá.
const inicioDoDia = (dia: string) => new Date(`${dia}T03:00:00.000Z`);

describe('momento do silêncio', () => {
  it('junta o dia e a hora no fuso da interface', () => {
    expect(momentoDoSilencio('2026-10-20', '18:00', inicioDoDia)).toEqual(
      new Date('2026-10-20T21:00:00.000Z'),
    );
    expect(momentoDoSilencio('2026-10-20', '7:05', inicioDoDia)).toEqual(
      new Date('2026-10-20T10:05:00.000Z'),
    );
  });

  it('recusa a hora que não existe e o dia que falta', () => {
    expect(momentoDoSilencio('2026-10-20', '24:00', inicioDoDia)).toBeNull();
    expect(momentoDoSilencio('2026-10-20', '18:60', inicioDoDia)).toBeNull();
    expect(momentoDoSilencio('2026-10-20', 'seis', inicioDoDia)).toBeNull();
    expect(momentoDoSilencio(null, '18:00', inicioDoDia)).toBeNull();
  });
});
