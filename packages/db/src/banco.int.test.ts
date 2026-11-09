// Transação com o contexto da organização (design do F2a, decisão 2): tudo o que roda dentro dela
// vê só a organização dada, o contexto não vaza para a próxima transação da mesma conexão, e um
// erro desfaz tudo.
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { type Banco, criarBanco, naOrganizacao } from './banco.ts';
import { pessoas } from './schema.ts';

let dono: pg.Pool;
let pool: pg.Pool;
let banco: Banco;
let orgA = '';
let orgB = '';

async function criarOrganizacao(nome: string): Promise<string> {
  const c = await dono.connect();
  try {
    const { rows } = await c.query<{ id: string }>('select uuidv7() as id');
    const id = rows[0]?.id ?? '';
    await c.query('begin');
    await c.query("select set_config('app.org_id', $1, true)", [id]);
    await c.query('insert into organizacoes (id, nome) values ($1, $2)', [id, nome]);
    await c.query('commit');
    return id;
  } finally {
    c.release();
  }
}

const organizacaoDoContexto = async (executor: Pick<Banco, 'execute'>) => {
  const { rows } = await executor.execute<{ org: string | null }>(
    sql`select app.current_org() as org`,
  );
  return rows[0]?.org ?? null;
};

beforeAll(async () => {
  dono = new pg.Pool({ connectionString: inject('urlDono') });
  // Uma conexão só: a transação seguinte usa a mesma conexão da anterior.
  pool = new pg.Pool({ connectionString: inject('urlApp'), max: 1 });
  banco = criarBanco(pool);
  orgA = await criarOrganizacao('Organização A');
  orgB = await criarOrganizacao('Organização B');
  await naOrganizacao(banco, orgB, (tx) =>
    tx.insert(pessoas).values({ orgId: orgB, nome: 'Bruno Lima' }),
  );
});

afterAll(async () => {
  await pool?.end();
  await dono?.end();
});

describe('naOrganizacao', () => {
  it('dentro dela, o contexto é a organização dada, e a consulta vê só os dados dela', async () => {
    const vistos = await naOrganizacao(banco, orgA, async (tx) => {
      await tx.insert(pessoas).values({ orgId: orgA, nome: 'Ana Souza' });
      return {
        org: await organizacaoDoContexto(tx),
        nomes: (await tx.select({ nome: pessoas.nome }).from(pessoas)).map((p) => p.nome),
      };
    });
    expect(vistos).toEqual({ org: orgA, nomes: ['Ana Souza'] });
  });

  it('o contexto some na transação seguinte da mesma conexão', async () => {
    await naOrganizacao(banco, orgA, async () => {});
    expect(await organizacaoDoContexto(banco)).toBeNull();
    expect(await banco.select().from(pessoas)).toEqual([]);
  });

  it('um erro dentro dela desfaz tudo o que ela gravou', async () => {
    await expect(
      naOrganizacao(banco, orgA, async (tx) => {
        await tx.insert(pessoas).values({ orgId: orgA, nome: 'Carla Dias' });
        throw new Error('falha depois de gravar');
      }),
    ).rejects.toThrow('falha depois de gravar');
    const nomes = await naOrganizacao(banco, orgA, (tx) =>
      tx.select({ nome: pessoas.nome }).from(pessoas),
    );
    expect(nomes.map((p) => p.nome)).not.toContain('Carla Dias');
  });
});
