// O quando do assistente da distribuição (change software-por-pacote, design, decisão 7): o dia
// marcado vira o instante no relógio do fuso de quem envia, de amanhã em diante, e a janela da noite
// se lê no mesmo relógio.
import { describe, expect, it } from 'vitest';
import { amanhaNoFuso, conferirODia, diaNoFuso, naJanelaDaNoite } from './momento.ts';

const FUSO = 'America/Sao_Paulo';
/** Quarta, 11/11/2026, às 09:40 em São Paulo. */
const AGORA = new Date('2026-11-11T12:40:00.000Z');
/** A mesma quarta, às 23:00 em São Paulo, já quinta em UTC. */
const NOITE = new Date('2026-11-12T02:00:00.000Z');

describe('o quando do assistente', () => {
  it('o dia marcado vira o instante no fuso de quem envia', () => {
    expect(conferirODia({ dia: '2026-11-12', hora: '22:00' }, AGORA, FUSO)).toEqual({
      ok: true,
      instante: new Date('2026-11-13T01:00:00.000Z'),
    });
  });

  it('recusa o dia faltando, a hora que não existe e o dia de hoje', () => {
    expect(conferirODia({ dia: null, hora: '22:00' }, AGORA, FUSO)).toEqual({
      ok: false,
      erros: { dia: 'Escolha o dia e a hora.' },
    });
    expect(conferirODia({ dia: '2026-11-12', hora: '25:00' }, AGORA, FUSO)).toEqual({
      ok: false,
      erros: { hora: 'Use a hora no formato 22:00.' },
    });
    expect(conferirODia({ dia: '2026-11-11', hora: '23:30' }, AGORA, FUSO)).toEqual({
      ok: false,
      erros: { dia: 'Escolha um dia de amanhã em diante.' },
    });
  });

  it('recusa o dia depois de um ano, pelo calendário do fuso', () => {
    expect(conferirODia({ dia: '2027-11-11', hora: '22:00' }, AGORA, FUSO).ok).toBe(true);
    expect(conferirODia({ dia: '2027-11-12', hora: '08:00' }, AGORA, FUSO)).toEqual({
      ok: false,
      erros: { dia: 'Escolha um dia até daqui a um ano.' },
    });
    // Às 23:00 de São Paulo já é dia 12 em UTC, e o teto continua no dia 11 do ano que vem.
    expect(conferirODia({ dia: '2027-11-11', hora: '22:00' }, NOITE, FUSO).ok).toBe(true);
    expect(conferirODia({ dia: '2027-11-12', hora: '22:00' }, NOITE, FUSO).ok).toBe(false);
  });

  it('hoje e amanhã pelo relógio do fuso, e não pelo de UTC', () => {
    expect(diaNoFuso(NOITE, FUSO)).toBe('2026-11-11');
    expect(amanhaNoFuso(NOITE, FUSO)).toBe('2026-11-12');
    expect(amanhaNoFuso(new Date('2026-11-30T15:00:00.000Z'), FUSO)).toBe('2026-12-01');
  });

  it('a janela da noite vai das 22:00 às 06:00 no relógio do fuso', () => {
    expect(naJanelaDaNoite(AGORA, FUSO)).toBe(false);
    expect(naJanelaDaNoite(NOITE, FUSO)).toBe(true);
    expect(naJanelaDaNoite(new Date('2026-11-12T09:00:00.000Z'), FUSO)).toBe(false);
  });
});
