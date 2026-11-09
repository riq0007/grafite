import { describe, expect, it } from 'vitest';
import { bloqueioDepois, mensagemDoBloqueio } from './bloqueio.ts';

const minuto = 60_000;

describe('bloqueioDepois', () => {
  it.each([0, 1, 4])('não bloqueia depois de %i recusas seguidas', (falhas) => {
    expect(bloqueioDepois(falhas)).toBe(0);
  });

  it.each([
    [5, 1 * minuto],
    [6, 2 * minuto],
    [7, 4 * minuto],
    [8, 8 * minuto],
    [9, 15 * minuto],
    [30, 15 * minuto],
  ])('depois de %i recusas, bloqueia por %i ms', (falhas, bloqueio) => {
    expect(bloqueioDepois(falhas)).toBe(bloqueio);
  });
});

describe('mensagemDoBloqueio', () => {
  it.each([
    [1, 1],
    [minuto, 1],
    [minuto + 1, 2],
    [15 * minuto - 1, 15],
    [0, 1],
  ])('com %i ms restantes, diz %i min', (restante, minutos) => {
    expect(mensagemDoBloqueio(restante)).toBe(
      `Muitas tentativas com este usuário. Tente de novo em ${minutos} min.`,
    );
  });
});
