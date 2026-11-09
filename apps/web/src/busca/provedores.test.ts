import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarExecutor, type EstadoDoProvedor } from './provedores.ts';

interface Chamada {
  termo: string;
  sinal: AbortSignal;
  responder: (resultados: string[]) => void;
  falhar: (erro: Error) => void;
}

/** Provedor de mentira que guarda cada chamada, para o teste decidir quando e como responder. */
function provedorControlado() {
  const chamadas: Chamada[] = [];
  const buscar = (termo: string, sinal: AbortSignal) =>
    new Promise<string[]>((responder, falhar) => {
      chamadas.push({ termo, sinal, responder, falhar });
    });
  return { chamadas, buscar };
}

function montar() {
  const provedor = provedorControlado();
  const estados: EstadoDoProvedor<string[]>[] = [];
  const executor = criarExecutor(provedor.buscar, { aoMudar: (estado) => estados.push(estado) });
  const ultimo = () => estados.at(-1);
  return { ...provedor, executor, ultimo };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('executor de um provedor de busca', () => {
  it('só chama o provedor depois de 150 ms sem digitação', () => {
    const { chamadas, executor, ultimo } = montar();
    executor.pedir('hp');
    expect(ultimo()).toEqual({ tipo: 'buscando', termo: 'hp' });
    vi.advanceTimersByTime(149);
    expect(chamadas).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(chamadas.map((c) => c.termo)).toEqual(['hp']);
  });

  it('digitar de novo antes da pausa recomeça a espera, e só o último texto é buscado', () => {
    const { chamadas, executor } = montar();
    executor.pedir('hp');
    vi.advanceTimersByTime(100);
    executor.pedir('hp4');
    vi.advanceTimersByTime(100);
    expect(chamadas).toHaveLength(0);
    vi.advanceTimersByTime(50);
    expect(chamadas.map((c) => c.termo)).toEqual(['hp4']);
  });

  it('com menos de 2 caracteres, não chama o provedor e fica ocioso', () => {
    const { chamadas, executor, ultimo } = montar();
    executor.pedir('hp');
    executor.pedir(' h ');
    vi.advanceTimersByTime(1000);
    expect(chamadas).toHaveLength(0);
    expect(ultimo()).toEqual({ tipo: 'ocioso' });
  });

  it('mostra os resultados quando o provedor responde', async () => {
    const { chamadas, executor, ultimo } = montar();
    executor.pedir('hp');
    vi.advanceTimersByTime(150);
    chamadas[0]?.responder(['HP LaserJet M404dn']);
    await vi.waitFor(() =>
      expect(ultimo()).toEqual({ tipo: 'pronto', termo: 'hp', resultados: ['HP LaserJet M404dn'] }),
    );
  });

  it('mudar o texto aborta a chamada em curso', () => {
    const { chamadas, executor } = montar();
    executor.pedir('hp');
    vi.advanceTimersByTime(150);
    executor.pedir('hp4');
    expect(chamadas[0]?.sinal.aborted).toBe(true);
  });

  it('descarta a resposta de um texto antigo que chega depois da do texto novo', async () => {
    const { chamadas, executor, ultimo } = montar();
    executor.pedir('hp');
    vi.advanceTimersByTime(150);
    executor.pedir('hp4');
    vi.advanceTimersByTime(150);
    chamadas[1]?.responder(['HP 4303']);
    await vi.waitFor(() => expect(ultimo()).toMatchObject({ tipo: 'pronto', termo: 'hp4' }));
    chamadas[0]?.responder(['HP antigo']);
    await Promise.resolve();
    await Promise.resolve();
    expect(ultimo()).toEqual({ tipo: 'pronto', termo: 'hp4', resultados: ['HP 4303'] });
  });

  it('desiste depois de 5 s sem resposta, com erro de tempo, e aborta a chamada', () => {
    const { chamadas, executor, ultimo } = montar();
    executor.pedir('hp');
    vi.advanceTimersByTime(150);
    vi.advanceTimersByTime(4999);
    expect(ultimo()).toEqual({ tipo: 'buscando', termo: 'hp' });
    vi.advanceTimersByTime(1);
    expect(ultimo()).toEqual({ tipo: 'erro', termo: 'hp', motivo: 'tempo' });
    expect(chamadas[0]?.sinal.aborted).toBe(true);
  });

  it('uma falha do provedor vira erro, sem derrubar o executor', async () => {
    const { chamadas, executor, ultimo } = montar();
    executor.pedir('hp');
    vi.advanceTimersByTime(150);
    chamadas[0]?.falhar(new Error('servidor fora do ar'));
    await vi.waitFor(() =>
      expect(ultimo()).toEqual({ tipo: 'erro', termo: 'hp', motivo: 'falha' }),
    );
    executor.pedir('hp4');
    vi.advanceTimersByTime(150);
    expect(chamadas.map((c) => c.termo)).toEqual(['hp', 'hp4']);
  });

  it('parar aborta a chamada em curso, cancela a espera e não avisa mais nada', async () => {
    const { chamadas, executor, ultimo } = montar();
    executor.pedir('hp');
    vi.advanceTimersByTime(150);
    executor.pedir('hp4');
    executor.parar();
    vi.advanceTimersByTime(1000);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]?.sinal.aborted).toBe(true);
    const antes = ultimo();
    chamadas[0]?.responder(['HP LaserJet']);
    await Promise.resolve();
    await Promise.resolve();
    expect(ultimo()).toBe(antes);
  });
});
