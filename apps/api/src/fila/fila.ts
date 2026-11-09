// A fila de tarefas (spec fila-de-tarefas; design do F2c, decisão 14): o pg-boss com o papel da
// aplicação, sobre o esquema `fila` que só as migrations criam. A partida não migra nem cria nada,
// e sem o esquema ela recusa e manda aplicar as migrations. Cada tarefa do catálogo ganha a fila
// dela, com as opções do catálogo também na fila que já existia, o trabalhador e, se tiver, o
// horário. O encerramento espera a tarefa em andamento até o limite; a que passa dele é
// interrompida e volta à fila, se ainda tem tentativas.
import { sql } from 'drizzle-orm';
import { fromDrizzle, type JobWithMetadata, PgBoss, type UpdateQueueOptions } from 'pg-boss';
import type { DefinicaoDeTarefa, OpcoesDoEnvio } from './tarefas.ts';

/**
 * As opções de uma fila criada sem nenhuma, como o `create_queue` da versão fixada do pg-boss as
 * grava (migration da fila). A partida aplica estas, cobertas pelas do catálogo, a cada fila: a que
 * já existia fica igual à que seria criada do zero (change opcoes-das-filas-na-partida, decisão 1).
 */
export const OPCOES_PADRAO_DA_FILA = {
  retryLimit: 2,
  retryDelay: 0,
  retryBackoff: false,
  retryDelayMax: null,
  expireInSeconds: 900,
  retentionSeconds: 1_209_600,
  deleteAfterSeconds: 604_800,
  warningQueueSize: 0,
  heartbeatSeconds: null,
  notify: false,
  deadLetter: null,
} as const satisfies UpdateQueueOptions;

export interface FilaDeTarefas {
  /** Liga a fila, cria as filas do catálogo e começa a trabalhar. */
  iniciar(): Promise<void>;
  /** Para de pegar tarefas e espera as em andamento até o limite do encerramento. */
  parar(): Promise<void>;
  rodando(): boolean;
  /** Põe uma tarefa na fila, com os dados conferidos pelo esquema dela; `null` se a chave já entrou. */
  enviar(tarefa: string, dados: unknown, opcoes?: OpcoesDoEnvio): Promise<string | null>;
  /** O nome em pt-BR de uma tarefa do catálogo, ou `null` se ela não está nele. */
  rotulo(tarefa: string): string | null;
  /** O nome da rotina e o que ela faz, na tarefa agendada que os tem, para a tela das tarefas. */
  rotina(tarefa: string): { nome: string; descricao: string } | null;
  /**
   * Agenda uma tarefa do catálogo pelo cron, no fuso dado, com os dados conferidos; agendar de novo
   * troca o horário. A execução perdida, como a de um servidor parado, roda uma vez.
   */
  agendar(tarefa: string, cron: string, dados: unknown, fuso: string): Promise<void>;
  /** Tira o agendamento da tarefa, se houver. */
  desagendar(tarefa: string): Promise<void>;
}

export interface OpcoesDaFila {
  /** A ligação com o banco, com o papel da aplicação. */
  conexao: string;
  tarefas: DefinicaoDeTarefa[];
  /** Uma falha da fila que não para a API, para o log. */
  avisar: (erro: unknown) => void;
  /** Quanto o encerramento espera as tarefas em andamento, em ms. */
  tempoDeEncerramento?: number;
  /** De quanto em quanto tempo cada fila procura tarefas novas, em segundos. */
  intervaloDeConsulta?: number;
  esquema?: string;
}

const SEM_ESQUEMA = /not installed|requires migrations/i;

/** A partida recusada porque o esquema da fila não está no banco. */
export class FilaSemEsquema extends Error {
  constructor() {
    super('A fila de tarefas não está no banco. Aplique as migrations e inicie a API de novo.');
    this.name = 'FilaSemEsquema';
  }
}

export function criarFila({
  conexao,
  tarefas,
  avisar,
  tempoDeEncerramento = 30_000,
  intervaloDeConsulta = 2,
  esquema = 'fila',
}: OpcoesDaFila): FilaDeTarefas {
  const porNome = new Map(tarefas.map((tarefa) => [tarefa.nome, tarefa]));
  let boss: PgBoss | null = null;

  async function executar(tarefa: DefinicaoDeTarefa, job: JobWithMetadata<unknown>) {
    await tarefa.trabalho(tarefa.dados.parse(job.data), {
      tarefaId: job.id,
      tentativa: job.retryCount,
      sinal: job.signal,
      ...(job.sourceName && job.sourceId
        ? {
            origem: {
              tarefa: job.sourceName,
              codigo: job.sourceId,
              tentativas: (job.sourceRetryCount ?? 0) + 1,
              erro: job.sourceOutput,
            },
          }
        : {}),
    });
  }

  return {
    async iniciar() {
      const novo = new PgBoss({
        connectionString: conexao,
        schema: esquema,
        migrate: false,
        createSchema: false,
        // Refazer índices pede ser dono deles, e o papel da aplicação não é.
        reindex: false,
        schedule: tarefas.some((tarefa) => tarefa.agenda),
      });
      novo.on('error', avisar);
      try {
        await novo.start();
        // A fila que recebe as falhas de outra precisa existir antes dela.
        const ordem = [...tarefas].sort(
          (a, b) => Number(Boolean(a.opcoes?.deadLetter)) - Number(Boolean(b.opcoes?.deadLetter)),
        );
        for (const tarefa of ordem) {
          const { policy = 'standard', ...opcoes } = tarefa.opcoes ?? {};
          await novo.createQueue(tarefa.nome, tarefa.opcoes ?? {});
          // A fila que já existia guarda as opções de quando foi criada.
          await novo.updateQueue(tarefa.nome, { ...OPCOES_PADRAO_DA_FILA, ...opcoes });
          // A política, não: ela fica como foi criada (decisão 2).
          const criada = await novo.getQueue(tarefa.nome);
          if (criada && criada.policy !== policy) {
            avisar(
              new Error(
                `A fila ${tarefa.nome} tem a política ${criada.policy}, e o catálogo pede ${policy}; a política não muda depois de criada.`,
              ),
            );
          }
        }
        for (const tarefa of tarefas) {
          await novo.work(
            tarefa.nome,
            { includeMetadata: true, pollingIntervalSeconds: intervaloDeConsulta },
            async (jobs) => {
              for (const job of jobs) await executar(tarefa, job);
            },
          );
          if (tarefa.agenda) {
            await novo.schedule(tarefa.nome, tarefa.agenda.cron, null, {
              tz: tarefa.agenda.fuso,
              missed: 'once',
            });
          }
        }
      } catch (erro) {
        await novo.stop({ graceful: false }).catch(() => {});
        if (SEM_ESQUEMA.test((erro as Error).message)) throw new FilaSemEsquema();
        throw erro;
      }
      boss = novo;
    },

    async parar() {
      const atual = boss;
      boss = null;
      if (atual) await atual.stop({ graceful: true, timeout: tempoDeEncerramento });
    },

    rodando: () => boss !== null,

    async enviar(nome, dados, { chaveUnica, unicaPor, tx } = {}) {
      const tarefa = porNome.get(nome);
      if (!tarefa) throw new Error(`A tarefa ${nome} não está no catálogo.`);
      const conferidos = tarefa.dados.parse(dados) as object;
      if (!boss) throw new Error('A fila de tarefas não está rodando.');
      return boss.send(nome, conferidos, {
        ...(chaveUnica ? { singletonKey: chaveUnica } : {}),
        ...(unicaPor ? { singletonSeconds: unicaPor } : {}),
        ...(tx ? { db: fromDrizzle(tx, sql) } : {}),
      });
    },

    rotulo: (nome) => porNome.get(nome)?.rotulo ?? null,

    rotina: (nome) => porNome.get(nome)?.rotina ?? null,

    async agendar(nome, cron, dados, fuso) {
      const tarefa = porNome.get(nome);
      if (!tarefa) throw new Error(`A tarefa ${nome} não está no catálogo.`);
      const conferidos = tarefa.dados.parse(dados) as object;
      if (!boss) throw new Error('A fila de tarefas não está rodando.');
      await boss.schedule(nome, cron, conferidos, { tz: fuso, missed: 'once' });
    },

    async desagendar(nome) {
      if (!boss) throw new Error('A fila de tarefas não está rodando.');
      await boss.unschedule(nome);
    },
  };
}
