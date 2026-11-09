// A fila de tarefas (spec fila-de-tarefas; design do F2c, decisão 14): o pg-boss com o papel da
// aplicação, sem criar nada no banco, com o catálogo de tarefas, o encerramento que espera a tarefa
// em andamento e devolve à fila a que passou do tempo, e a recusa da partida sem o esquema da fila.
// As opções do catálogo aplicadas na partida também à fila que já existia (change
// opcoes-das-filas-na-partida).
import { PgBoss, type Queue, type QueueResult } from 'pg-boss';
import { afterEach, describe, expect, inject, it, vi } from 'vitest';
import { z } from 'zod';
import { criarFila, type FilaDeTarefas, OPCOES_PADRAO_DA_FILA } from './fila.ts';
import type { DefinicaoDeTarefa } from './tarefas.ts';

const abertas: FilaDeTarefas[] = [];

afterEach(async () => {
  for (const fila of abertas.splice(0)) await fila.parar();
});

/** Uma fila dos testes, com o papel da aplicação e o catálogo dado. */
function filaDeTeste(tarefas: DefinicaoDeTarefa[], tempoDeEncerramento?: number) {
  const fila = criarFila({
    conexao: inject('urlApp'),
    tarefas,
    avisar: () => {},
    tempoDeEncerramento,
  });
  abertas.push(fila);
  return fila;
}

let nomes = 0;

/** Uma tarefa que espera `duracao` ms, ou até ser interrompida, e anota o que aconteceu. */
function tarefaDemorada(duracao: number) {
  nomes += 1;
  const historico: string[] = [];
  const tarefa: DefinicaoDeTarefa<{ id: string }> = {
    nome: `teste-demorada-${nomes}`,
    rotulo: 'Tarefa demorada do teste',
    dados: z.object({ id: z.string() }),
    opcoes: { retryLimit: 2, retryDelay: 0, expireInSeconds: 60 },
    trabalho: async ({ id }, { sinal }) => {
      historico.push(`começou ${id}`);
      await new Promise<void>((resolve) => {
        const fim = setTimeout(resolve, duracao);
        sinal.addEventListener('abort', () => {
          clearTimeout(fim);
          resolve();
        });
      });
      historico.push(sinal.aborted ? `interrompida ${id}` : `terminou ${id}`);
    },
  };
  return { tarefa, historico };
}

/** O estado de uma tarefa na fila, lido direto do pg-boss. */
async function estadoDa(nome: string, id: string) {
  const boss = new PgBoss({ connectionString: inject('urlApp'), schema: 'fila', migrate: false });
  await boss.start();
  try {
    return (await boss.getJobById(nome, id))?.state;
  } finally {
    await boss.stop({ graceful: false });
  }
}

describe('a fila de tarefas', () => {
  it('roda a tarefa do catálogo com o papel da aplicação, e diz que está rodando', async () => {
    const { tarefa, historico } = tarefaDemorada(10);
    const fila = filaDeTeste([tarefa]);
    expect(fila.rodando()).toBe(false);
    await fila.iniciar();
    expect(fila.rodando()).toBe(true);
    const id = await fila.enviar(tarefa.nome, { id: 'a' });
    expect(id).toEqual(expect.any(String));
    await vi.waitFor(() => expect(historico).toEqual(['começou a', 'terminou a']), {
      timeout: 10_000,
    });
    // A fila marca a tarefa como concluída depois de ela terminar: sob carga, passa de 1 s.
    await vi.waitFor(async () => expect(await estadoDa(tarefa.nome, id ?? '')).toBe('completed'), {
      timeout: 10_000,
    });
  });

  it('recusa pôr na fila dados fora do esquema da tarefa', async () => {
    const { tarefa } = tarefaDemorada(10);
    const fila = filaDeTeste([tarefa]);
    await fila.iniciar();
    await expect(fila.enviar(tarefa.nome, { nome: 'João' })).rejects.toThrow();
    await expect(fila.enviar('tarefa-que-nao-existe', {})).rejects.toThrow(
      'A tarefa tarefa-que-nao-existe não está no catálogo.',
    );
  });

  it('o encerramento espera a tarefa de 5 s em andamento terminar', async () => {
    const { tarefa, historico } = tarefaDemorada(5000);
    const fila = filaDeTeste([tarefa]);
    await fila.iniciar();
    const id = await fila.enviar(tarefa.nome, { id: 'b' });
    await vi.waitFor(() => expect(historico).toEqual(['começou b']), { timeout: 10_000 });
    const inicio = Date.now();
    await fila.parar();
    expect(Date.now() - inicio).toBeGreaterThan(3000);
    expect(fila.rodando()).toBe(false);
    expect(historico).toEqual(['começou b', 'terminou b']);
    expect(await estadoDa(tarefa.nome, id ?? '')).toBe('completed');
  }, 20_000);

  it('a tarefa interrompida pelo encerramento volta à fila e termina depois', async () => {
    const { tarefa, historico } = tarefaDemorada(5000);
    const primeira = filaDeTeste([tarefa], 1000);
    await primeira.iniciar();
    const id = await primeira.enviar(tarefa.nome, { id: 'c' });
    await vi.waitFor(() => expect(historico).toEqual(['começou c']), { timeout: 10_000 });
    await primeira.parar();
    await vi.waitFor(() => expect(historico).toEqual(['começou c', 'interrompida c']));
    expect(await estadoDa(tarefa.nome, id ?? '')).toBe('retry');

    const rapida = { ...tarefa, trabalho: async () => void historico.push('de novo c') };
    const segunda = filaDeTeste([rapida]);
    await segunda.iniciar();
    await vi.waitFor(() => expect(historico.at(-1)).toBe('de novo c'), { timeout: 10_000 });
    await vi.waitFor(async () => expect(await estadoDa(tarefa.nome, id ?? '')).toBe('completed'));
  }, 30_000);

  it('recusa a partida sem o esquema da fila, mandando aplicar as migrations', async () => {
    const fila = criarFila({
      conexao: inject('urlApp'),
      tarefas: [],
      avisar: () => {},
      esquema: 'fila_ausente',
    });
    await expect(fila.iniciar()).rejects.toThrow(
      'A fila de tarefas não está no banco. Aplique as migrations e inicie a API de novo.',
    );
    expect(fila.rodando()).toBe(false);
  });
});

describe('as opções das filas na partida', () => {
  /** O pg-boss do teste, com o papel da aplicação, para criar e ler as filas por fora da partida. */
  async function comOBoss<T>(fazer: (boss: PgBoss) => Promise<T>): Promise<T> {
    const boss = new PgBoss({ connectionString: inject('urlApp'), schema: 'fila', migrate: false });
    await boss.start();
    try {
      return await fazer(boss);
    } finally {
      await boss.stop({ graceful: false });
    }
  }

  /** A política e as opções que a partida aplica, como a fila está no banco. */
  async function opcoesDaFila(nome: string) {
    const fila = (await comOBoss((boss) => boss.getQueue(nome))) as QueueResult;
    return {
      policy: fila.policy,
      retryLimit: fila.retryLimit,
      retryDelay: fila.retryDelay,
      retryBackoff: fila.retryBackoff,
      retryDelayMax: fila.retryDelayMax,
      expireInSeconds: fila.expireInSeconds,
      retentionSeconds: fila.retentionSeconds,
      deleteAfterSeconds: fila.deleteAfterSeconds,
      warningQueueSize: fila.warningQueueSize,
      heartbeatSeconds: fila.heartbeatSeconds,
      notify: fila.notify,
      deadLetter: fila.deadLetter,
    };
  }

  /** Uma tarefa do catálogo numa fila de nome novo, que anota o que rodou. */
  function tarefaNaFila(opcoes: Omit<Queue, 'name' | 'partition'>) {
    nomes += 1;
    const rodou: string[] = [];
    const tarefa: DefinicaoDeTarefa<{ id: string }> = {
      nome: `teste-opcoes-${nomes}`,
      rotulo: 'Tarefa das opções do teste',
      dados: z.object({ id: z.string() }),
      opcoes,
      trabalho: async ({ id }) => void rodou.push(id),
    };
    return { tarefa, rodou };
  }

  /** A partida da fila com o catálogo dado, guardando os avisos dela. */
  async function iniciarCom(tarefas: DefinicaoDeTarefa[]) {
    const avisos: string[] = [];
    const fila = criarFila({
      conexao: inject('urlApp'),
      tarefas,
      avisar: (erro) => avisos.push((erro as Error).message),
    });
    abertas.push(fila);
    await fila.iniciar();
    return { fila, avisos };
  }

  it('os padrões são os de uma fila nova, criada sem opções pela versão fixada', async () => {
    nomes += 1;
    const nome = `teste-padrao-${nomes}`;
    await comOBoss((boss) => boss.createQueue(nome));
    expect(await opcoesDaFila(nome)).toEqual({ policy: 'standard', ...OPCOES_PADRAO_DA_FILA });
  });

  it('a fila que já existia passa a ter as novas tentativas e as esperas do catálogo', async () => {
    const { tarefa } = tarefaNaFila({ retryLimit: 1, retryDelay: 5, expireInSeconds: 60 });
    await comOBoss((boss) =>
      boss.createQueue(tarefa.nome, {
        retryLimit: 7,
        retryDelay: 90,
        retryBackoff: true,
        retryDelayMax: 600,
        expireInSeconds: 30,
        retentionSeconds: 3600,
      }),
    );
    const { avisos } = await iniciarCom([tarefa]);
    expect(await opcoesDaFila(tarefa.nome)).toEqual({
      policy: 'standard',
      ...OPCOES_PADRAO_DA_FILA,
      retryLimit: 1,
      retryDelay: 5,
      expireInSeconds: 60,
    });
    expect(avisos).toEqual([]);
  });

  it('a fila que já existia fica sem o destino das falhas que o catálogo não dá mais', async () => {
    nomes += 1;
    const destino = `teste-destino-${nomes}`;
    const { tarefa } = tarefaNaFila({});
    await comOBoss(async (boss) => {
      await boss.createQueue(destino);
      await boss.createQueue(tarefa.nome, { deadLetter: destino });
    });
    await iniciarCom([tarefa]);
    expect((await opcoesDaFila(tarefa.nome)).deadLetter).toBeNull();
  });

  it('a fila com outra política faz a partida avisar, e a fila funciona', async () => {
    const { tarefa, rodou } = tarefaNaFila({ policy: 'stately' });
    await comOBoss((boss) => boss.createQueue(tarefa.nome, { policy: 'standard' }));
    const { fila, avisos } = await iniciarCom([tarefa]);
    expect(avisos).toEqual([
      `A fila ${tarefa.nome} tem a política standard, e o catálogo pede stately; a política não muda depois de criada.`,
    ]);
    expect(fila.rodando()).toBe(true);
    await fila.enviar(tarefa.nome, { id: 'p' });
    await vi.waitFor(() => expect(rodou).toEqual(['p']), { timeout: 10_000 });
  });
});
