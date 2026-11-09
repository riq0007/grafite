import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarJuntador, type LeituraParaEnviar, type LoteParaEnviar } from './lotes.ts';

const leitura = (n: number): LeituraParaEnviar => ({
  ativoId: `0199d3a0-0000-7000-8000-${String(n).padStart(12, '0')}`,
  metrica: 'rede.disponibilidade',
  momento: '2026-10-12T12:00:00.000Z',
  valor: 'online',
});

let guardados: LoteParaEnviar[];
let chaves: number;

function juntadorDeTeste() {
  return criarJuntador({
    guardar: async (lote) => {
      guardados.push(lote);
    },
    novaChave: () => `chave-${++chaves}`,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  guardados = [];
  chaves = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('o juntador das leituras', () => {
  it('fecha o lote a cada 10 s, com uma chave nova, e não manda lote vazio', async () => {
    const juntador = juntadorDeTeste();
    juntador.adicionar([leitura(1), leitura(2)]);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(guardados).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(guardados).toEqual([{ chave: 'chave-1', leituras: [leitura(1), leitura(2)] }]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(guardados).toHaveLength(1);
    juntador.adicionar([leitura(3)]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(guardados.at(-1)).toEqual({ chave: 'chave-2', leituras: [leitura(3)] });
    await juntador.encerrar();
  });

  it('fecha logo o lote de 1.000 leituras, e o resto espera os 10 s', async () => {
    const juntador = juntadorDeTeste();
    juntador.adicionar(Array.from({ length: 1_500 }, (_, i) => leitura(i)));
    await vi.advanceTimersByTimeAsync(0);
    expect(guardados.map((lote) => lote.leituras.length)).toEqual([1_000]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(guardados.map((lote) => lote.leituras.length)).toEqual([1_000, 500]);
    expect(guardados[1]?.leituras[0]).toEqual(leitura(1_000));
    await juntador.encerrar();
  });

  it('ao encerrar, guarda as leituras que ainda não viraram lote e para o relógio', async () => {
    const juntador = juntadorDeTeste();
    juntador.adicionar([leitura(1)]);
    await juntador.encerrar();
    expect(guardados).toEqual([{ chave: 'chave-1', leituras: [leitura(1)] }]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
