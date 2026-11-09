// Chaves estrangeiras entre tabelas de negócio (design do F2a, decisão 2). O PostgreSQL confere as
// chaves estrangeiras sem aplicar o RLS: uma referência simples aceitaria um registro de outra
// organização. Por isso a referência leva o org_id junto, e o orgScoped() cria o alvo dela.
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { foreignKey, text, uuid } from 'drizzle-orm/pg-core';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { organizacoes, orgScoped } from './schema.ts';

const provaPai = orgScoped('prova_pai', { nome: text('nome').notNull() });
const provaFilho = orgScoped('prova_filho', { paiId: uuid('pai_id').notNull() }, (t) => [
  foreignKey({ columns: [t.orgId, t.paiId], foreignColumns: [provaPai.orgId, provaPai.id] }),
]);

let dono: pg.Pool;
let app: pg.Pool;
let orgA = '';
let orgB = '';
let paiDeA = '';

async function emTransacao<T>(
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
  await emTransacao(dono, id, (c) =>
    c.query('insert into organizacoes (id, nome) values ($1, $2)', [id, nome]),
  );
  return id;
}

beforeAll(async () => {
  dono = new pg.Pool({ connectionString: inject('urlDono') });
  app = new pg.Pool({ connectionString: inject('urlApp') });
  // As tabelas de prova saem do mesmo gerador das migrations, a partir do orgScoped().
  const comandos = await generateMigration(
    generateDrizzleJson({ organizacoes }),
    generateDrizzleJson({ organizacoes, provaPai, provaFilho }),
  );
  for (const comando of comandos) await dono.query(comando);
  await dono.query("select app.isolar_por_organizacao('prova_pai')");
  await dono.query("select app.isolar_por_organizacao('prova_filho')");
  orgA = await criarOrganizacao('Organização A');
  orgB = await criarOrganizacao('Organização B');
  paiDeA = await emTransacao(app, orgA, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      "insert into prova_pai (org_id, nome) values ($1, 'pai de A') returning id",
      [orgA],
    );
    return rows[0]?.id ?? '';
  });
});

afterAll(async () => {
  await dono?.query('drop table if exists prova_filho, prova_pai, prova_simples');
  await dono?.end();
  await app?.end();
});

describe('chave estrangeira composta com o org_id', () => {
  it('o banco recusa, no contexto de B, a referência a um registro de A', async () => {
    await expect(
      emTransacao(app, orgB, (c) =>
        c.query('insert into prova_filho (org_id, pai_id) values ($1, $2)', [orgB, paiDeA]),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it('aceita a referência a um registro da mesma organização', async () => {
    const { rowCount } = await emTransacao(app, orgA, (c) =>
      c.query('insert into prova_filho (org_id, pai_id) values ($1, $2)', [orgA, paiDeA]),
    );
    expect(rowCount).toBe(1);
  });

  it('o motivo: uma chave estrangeira simples aceitaria a referência a outra organização', async () => {
    await dono.query(`create table prova_simples (
      id uuid primary key default uuidv7(),
      org_id uuid not null references organizacoes (id),
      pai_id uuid not null references prova_pai (id)
    )`);
    await dono.query("select app.isolar_por_organizacao('prova_simples')");
    const { rowCount } = await emTransacao(app, orgB, (c) =>
      c.query('insert into prova_simples (org_id, pai_id) values ($1, $2)', [orgB, paiDeA]),
    );
    expect(rowCount).toBe(1);
  });
});
