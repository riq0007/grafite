// A abertura pelo toque no push (spec notificacoes, "Push por severidade"; change p3c-email-e-push,
// design, decisão 7): o service worker pede à janela aberta do Grafite que abra o endereço, e ela o
// abre pelo roteador, sem recarregar.
import { describe, expect, it, vi } from 'vitest';
import { ouvirAberturaPeloPush } from './aberturaPeloPush.ts';

function containerFalso() {
  const ouvintes = new Set<(evento: MessageEvent) => void>();
  return {
    addEventListener: (_tipo: 'message', ouvinte: (evento: MessageEvent) => void) =>
      ouvintes.add(ouvinte),
    removeEventListener: (_tipo: 'message', ouvinte: (evento: MessageEvent) => void) =>
      ouvintes.delete(ouvinte),
    mandar: (dados: unknown) => {
      for (const ouvinte of ouvintes) ouvinte(new MessageEvent('message', { data: dados }));
    },
    ouvintes,
  };
}

describe('abertura pelo push', () => {
  it('abre o endereço que o service worker pede', () => {
    const container = containerFalso();
    const navegar = vi.fn();
    ouvirAberturaPeloPush(container, navegar);
    container.mandar({ tipo: 'grafite:abrir', destino: '/ativos/1' });
    expect(navegar).toHaveBeenCalledWith('/ativos/1');
  });

  it('ignora outras mensagens e o endereço que não é do Grafite', () => {
    const container = containerFalso();
    const navegar = vi.fn();
    ouvirAberturaPeloPush(container, navegar);
    container.mandar({ tipo: 'outra', destino: '/ativos/1' });
    container.mandar({ tipo: 'grafite:abrir', destino: 'https://outro.exemplo.test/' });
    container.mandar({ tipo: 'grafite:abrir', destino: '//outro.exemplo.test/' });
    container.mandar('grafite:abrir');
    expect(navegar).not.toHaveBeenCalled();
  });

  it('para de ouvir, e sem service worker não faz nada', () => {
    const container = containerFalso();
    const parar = ouvirAberturaPeloPush(container, vi.fn());
    parar();
    expect(container.ouvintes.size).toBe(0);
    expect(() => ouvirAberturaPeloPush(undefined, vi.fn())()).not.toThrow();
  });
});
