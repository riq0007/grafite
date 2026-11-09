// O prazo do servidor na chegada (spec chegada, "Carregamento com etapas reais"; change
// p3b-notificacoes-no-servidor, design, decisão 11): as etapas que dependem do servidor, somadas,
// não esperam mais de 5 s, contados de quando a chegada começou a esperar por ele.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarPrazoDoServidor, PRAZO_DO_SERVIDOR } from './prazo.ts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Uma resposta que nunca chega. */
const semResposta = () => new Promise<never>(() => {});

/** Acompanha uma espera: se ela já terminou. */
function acompanhar(espera: Promise<void>) {
  const estado = { terminou: false };
  void espera.then(() => {
    estado.terminou = true;
  });
  return estado;
}

const prazoNoRelogioDoTeste = () => criarPrazoDoServidor({ agora: () => Date.now() });

describe('prazo do servidor', () => {
  it('a espera termina com a resposta, antes do prazo', async () => {
    const prazo = prazoNoRelogioDoTeste();
    const espera = acompanhar(prazo.esperar(new Promise((resolver) => setTimeout(resolver, 800))));
    await vi.advanceTimersByTimeAsync(799);
    expect(espera.terminou).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(espera.terminou).toBe(true);
  });

  it('sem resposta, termina 5 s depois do começo, somadas as esperas', async () => {
    const prazo = prazoNoRelogioDoTeste();
    prazo.comecar();
    await vi.advanceTimersByTimeAsync(3000);
    const espera = acompanhar(prazo.esperar(semResposta()));
    await vi.advanceTimersByTimeAsync(PRAZO_DO_SERVIDOR - 3000 - 1);
    expect(espera.terminou).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(espera.terminou).toBe(true);
  });

  it('o começo é o da primeira espera, e marcar de novo não o muda', async () => {
    const prazo = prazoNoRelogioDoTeste();
    const primeira = acompanhar(prazo.esperar(semResposta()));
    await vi.advanceTimersByTimeAsync(2000);
    prazo.comecar();
    const segunda = acompanhar(prazo.esperar(semResposta()));
    await vi.advanceTimersByTimeAsync(PRAZO_DO_SERVIDOR - 2000 - 1);
    expect([primeira.terminou, segunda.terminou]).toEqual([false, false]);
    await vi.advanceTimersByTimeAsync(1);
    expect([primeira.terminou, segunda.terminou]).toEqual([true, true]);
  });

  it('com o prazo vencido, a espera termina na hora', async () => {
    const prazo = prazoNoRelogioDoTeste();
    prazo.comecar();
    await vi.advanceTimersByTimeAsync(PRAZO_DO_SERVIDOR + 1000);
    const espera = acompanhar(prazo.esperar(semResposta()));
    await vi.advanceTimersByTimeAsync(0);
    expect(espera.terminou).toBe(true);
  });

  it('a resposta com falha termina a espera, sem falhar', async () => {
    const prazo = prazoNoRelogioDoTeste();
    await expect(prazo.esperar(Promise.reject(new Error('Sem conexão.')))).resolves.toBeUndefined();
  });
});
