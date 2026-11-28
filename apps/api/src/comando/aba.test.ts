// A hora que o comando da aba mostra (spec aba-dos-colaboradores, "Comando da aba no servidor"):
// no fuso do servidor, com o fuso escrito, para a hora nunca ficar ambígua.
import { describe, expect, it } from 'vitest';
import { dataLocal } from './aba.ts';

describe('dataLocal', () => {
  it('escreve a data, a hora e o fuso', () => {
    const momento = new Date('2026-11-24T21:30:00.000Z');
    expect(dataLocal(momento, 'America/Sao_Paulo')).toMatch(/^24\/11\/2026, 18:30 \(.+\)$/);
    expect(dataLocal(momento, 'Etc/UTC')).toMatch(/^24\/11\/2026, 21:30 \(.+\)$/);
  });
});
