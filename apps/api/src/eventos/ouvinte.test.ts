// A religação do ouvinte (design do F2c, decisão 10): a espera entre as tentativas dobra a cada
// falha seguida, de 1 s até 30 s, e volta ao começo depois de uma ligação que vale.
import { EventEmitter } from 'node:events';
import type pg from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarOuvinte } from './ouvinte.ts';

/** Um cliente que conecta ou recusa, como mandar a fila de respostas. */
function clientes(respostas: boolean[]) {
  const criados: EventEmitter[] = [];
  const conectar = vi.fn(() => {
    const aceita = respostas.shift() ?? false;
    const cliente = Object.assign(new EventEmitter(), {
      connect: async () => {
        if (!aceita) throw new Error('ligação recusada');
      },
      query: async () => ({}),
      end: async () => {},
    });
    criados.push(cliente);
    return cliente as unknown as pg.Client;
  });
  return { conectar, criados };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a religação do ouvinte', () => {
  it('espera 1 s, 2 s, 4 s... até 30 s entre as tentativas que falham', async () => {
    const { conectar } = clientes([]);
    const ouvinte = criarOuvinte({
      conectar,
      aoEvento: () => {},
      aoReligar: () => {},
      avisar: () => {},
    });
    await ouvinte.iniciar();
    expect(conectar).toHaveBeenCalledTimes(1);
    let tentativas = 1;
    for (const espera of [1000, 2000, 4000, 8000, 16000, 30_000, 30_000]) {
      await vi.advanceTimersByTimeAsync(espera - 1);
      expect(conectar).toHaveBeenCalledTimes(tentativas);
      await vi.advanceTimersByTimeAsync(1);
      tentativas += 1;
      expect(conectar).toHaveBeenCalledTimes(tentativas);
    }
    await ouvinte.parar();
  });

  it('depois de uma ligação que vale, a próxima queda espera 1 s de novo e avisa a religação', async () => {
    const { conectar, criados } = clientes([false, false, true, true]);
    const aoReligar = vi.fn();
    const ouvinte = criarOuvinte({ conectar, aoEvento: () => {}, aoReligar, avisar: () => {} });
    await ouvinte.iniciar();
    await vi.advanceTimersByTimeAsync(1000 + 2000);
    expect(ouvinte.ligado()).toBe(true);
    // A primeira ligação que vale não é uma religação: nada se perdeu antes dela.
    expect(aoReligar).not.toHaveBeenCalled();

    criados.at(-1)?.emit('error', new Error('o banco reiniciou'));
    expect(ouvinte.ligado()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(ouvinte.ligado()).toBe(true);
    expect(aoReligar).toHaveBeenCalledTimes(1);
    await ouvinte.parar();
  });
});
