// A fila de tarefas (spec fila-de-tarefas; design do F2c, decisão 14): o esquema do pg-boss criado
// pela migration, na versão fixada, e o papel da aplicação usando a fila sem poder mudar a
// estrutura dela.
import pg from 'pg';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

let app: pg.Pool;
let boss: PgBoss;
const erros: unknown[] = [];

beforeAll(async () => {
  app = new pg.Pool({ connectionString: inject('urlApp') });
  boss = new PgBoss({
    connectionString: inject('urlApp'),
    schema: 'fila',
    migrate: false,
    createSchema: false,
    supervise: true,
    reindex: false,
  });
  boss.on('error', (erro) => erros.push(erro));
  await boss.start();
});

afterAll(async () => {
  await boss?.stop({ graceful: false });
  await app?.end();
});

describe('fila', () => {
  it('o papel da aplicação cria uma fila, põe, pega e conclui uma tarefa', async () => {
    await boss.createQueue('teste-da-fila');
    const id = await boss.send('teste-da-fila', { org: '0199a3f0-0000-7000-8000-000000000001' });
    expect(id).not.toBeNull();
    const [tarefa] = await boss.fetch<{ org: string }>('teste-da-fila');
    expect(tarefa?.id).toBe(id);
    expect(tarefa?.data).toEqual({ org: '0199a3f0-0000-7000-8000-000000000001' });
    await boss.complete('teste-da-fila', id ?? '');
    const concluida = await boss.getJobById('teste-da-fila', id ?? '');
    expect(concluida?.state).toBe('completed');
  });

  it('a manutenção do pg-boss roda sem erro com o papel da aplicação', async () => {
    await boss.supervise();
    expect(erros).toEqual([]);
  });

  it('o papel da aplicação não cria nem altera tabelas no esquema da fila', async () => {
    await expect(app.query('create table fila.intrusa (x int)')).rejects.toThrow(
      /permission denied/,
    );
    await expect(app.query('alter table fila.queue add column intrusa int')).rejects.toThrow(
      /must be owner/,
    );
  });

  it('o esquema da fila está na versão do pg-boss instalado', async () => {
    const { rows } = await app.query<{ version: number }>('select version from fila.version');
    const { getConstructionPlans } = await import('pg-boss');
    const versao = /INSERT INTO fila\.version\(version\) VALUES \('(\d+)'\)/.exec(
      getConstructionPlans('fila'),
    )?.[1];
    expect(rows).toEqual([{ version: Number(versao) }]);
  });
});
