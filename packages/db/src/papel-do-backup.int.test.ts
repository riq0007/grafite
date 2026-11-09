// O papel do backup (spec isolamento-organizacoes, "Papéis de banco separados"; design do F2d,
// decisão 11): grafite_backup lê o banco inteiro, passando por cima do RLS forçado, e não grava
// nada. Quem tem o superusuário o cria; a migration dá a leitura só se ele existir.
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { type BancoDeTeste, encerrarPool, iniciarBancoDeTeste } from '../test/banco-de-teste.ts';
import { garantirPapelDoBackup } from './papeis.ts';

let dono: pg.Pool;
let app: pg.Pool;
let backup: pg.Pool;
const organizacoes: string[] = [];

async function noContexto<T>(
  pool: pg.Pool,
  org: string,
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query("select set_config('app.org_id', $1, true)", [org]);
    const resultado = await fn(c);
    await c.query('commit');
    return resultado;
  } catch (erro) {
    await c.query('rollback');
    throw erro;
  } finally {
    c.release();
  }
}

async function criarOrganizacao(nome: string): Promise<string> {
  const { rows } = await dono.query<{ id: string }>('select uuidv7() as id');
  const id = rows[0]?.id ?? '';
  await noContexto(dono, id, (c) =>
    c.query('insert into organizacoes (id, nome) values ($1, $2)', [id, nome]),
  );
  organizacoes.push(id);
  return id;
}

beforeAll(async () => {
  dono = new pg.Pool({ connectionString: inject('urlDono') });
  app = new pg.Pool({ connectionString: inject('urlApp') });
  backup = new pg.Pool({ connectionString: inject('urlBackup') });
  // Uma tabela de negócio criada depois das migrations, como a de um módulo futuro.
  await dono.query(`create table prova_backup (
    id uuid primary key default uuidv7(),
    org_id uuid not null references organizacoes (id),
    nome text not null
  )`);
  await dono.query("select app.isolar_por_organizacao('prova_backup')");
  for (const nome of ['Backup A', 'Backup B']) {
    const org = await criarOrganizacao(nome);
    await noContexto(app, org, (c) =>
      c.query('insert into prova_backup (org_id, nome) values ($1, $2)', [org, `linha de ${nome}`]),
    );
  }
});

afterAll(async () => {
  await dono?.query('drop table if exists prova_backup');
  await backup?.end();
  await app?.end();
  await dono?.end();
});

describe('papel do backup', () => {
  it('lê as linhas de duas organizações, com o RLS forçado e sem contexto', async () => {
    const { rows } = await backup.query<{ nome: string }>(
      "select nome from organizacoes where nome like 'Backup %' order by nome",
    );
    expect(rows.map((r) => r.nome)).toEqual(['Backup A', 'Backup B']);
    const { rows: linhas } = await backup.query<{ nome: string }>(
      'select nome from prova_backup order by nome',
    );
    expect(linhas.map((r) => r.nome)).toEqual(['linha de Backup A', 'linha de Backup B']);
  });

  it('o papel da aplicação, sem contexto, não vê essas linhas', async () => {
    const { rows } = await app.query('select nome from prova_backup');
    expect(rows).toEqual([]);
  });

  it('lê a fila, a operação e o diário das migrations', async () => {
    for (const tabela of [
      'fila.queue',
      'fila.job',
      'operacao.backups',
      'operacao.agenda',
      'drizzle.__drizzle_migrations',
    ]) {
      await expect(backup.query(`select count(*) from ${tabela}`)).resolves.toBeTruthy();
    }
  });

  it.each([
    ['incluir', "insert into organizacoes (nome) values ('Intrusa')"],
    ['alterar', "update organizacoes set nome = 'Trocada'"],
    ['apagar', 'delete from prova_backup'],
    ['incluir na operação', "insert into operacao.backups (pedido_por) values ('comando')"],
    ['alterar a agenda', "update operacao.agenda set horario = '04:00'"],
    ['criar uma tabela', 'create table intrusa (x int)'],
  ])('é recusado ao %s', async (_caso, comando) => {
    await expect(backup.query(comando)).rejects.toThrow(/permission denied/);
  });

  it('não passa a ser dono nem superusuário de nada', async () => {
    const { rows } = await backup.query(
      `select rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
         from pg_roles where rolname = current_user`,
    );
    expect(rows).toEqual([
      {
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
        rolbypassrls: true,
      },
    ]);
  });
});

// O banco deste bloco para logo depois dos testes: os pools fecham pelo encerrarPool, que espera cada
// conexão sair, e o desligamento (57P01) não chega a uma conexão que ainda fecha.
describe('banco sem o papel do backup', () => {
  let semPapel: BancoDeTeste;

  beforeAll(async () => {
    semPapel = await iniciarBancoDeTeste({ papelDoBackup: false });
  });

  afterAll(async () => {
    await semPapel?.parar();
  });

  it('as migrations rodam sem o papel', async () => {
    const pool = new pg.Pool({ connectionString: semPapel.urlSuperusuario });
    try {
      const { rows } = await pool.query(
        "select count(*)::int as papeis from pg_roles where rolname = 'grafite_backup'",
      );
      expect(rows).toEqual([{ papeis: 0 }]);
      const { rows: agenda } = await pool.query('select horario from operacao.agenda');
      expect(agenda).toEqual([{ horario: '02:00' }]);
    } finally {
      await encerrarPool(pool);
    }
  });

  it('o papel criado depois das migrations ganha a leitura, e a senha nova vale', async () => {
    await garantirPapelDoBackup(semPapel.urlSuperusuario, 'primeira-senha-do-backup');
    await garantirPapelDoBackup(semPapel.urlSuperusuario, 'segunda-senha-do-backup');
    const url = new URL(semPapel.urlSuperusuario);
    url.username = 'grafite_backup';
    url.password = 'segunda-senha-do-backup';
    const pool = new pg.Pool({ connectionString: url.toString() });
    try {
      await expect(pool.query('select count(*) from organizacoes')).resolves.toBeTruthy();
      await expect(pool.query('select count(*) from operacao.backups')).resolves.toBeTruthy();
      await expect(pool.query("update operacao.agenda set horario = '04:00'")).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await encerrarPool(pool);
    }
  });
});
