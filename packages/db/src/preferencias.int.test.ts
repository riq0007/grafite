// As camadas das preferências (spec preferencias-da-interface; design do F2c, decisão 2): os padrões
// da organização e as escolhas da conta, cada um numa coluna, só com os campos mudados.
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

let dono: pg.Pool;
let app: pg.Pool;
let orgA = '';
let orgB = '';
let contaA = '';
let contaB = '';

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

function criarConta(org: string, usuario: string): Promise<string> {
  return emTransacao(app, org, async (c) => {
    const pessoa = await c.query<{ id: string }>(
      'insert into pessoas (org_id, nome) values ($1, $2) returning id',
      [org, usuario],
    );
    const conta = await c.query<{ id: string }>(
      "insert into contas (org_id, pessoa_id, usuario, hash_senha) values ($1, $2, $3, 'hash') returning id",
      [org, pessoa.rows[0]?.id, usuario],
    );
    return conta.rows[0]?.id ?? '';
  });
}

beforeAll(async () => {
  dono = new pg.Pool({ connectionString: inject('urlDono') });
  app = new pg.Pool({ connectionString: inject('urlApp') });
  orgA = await criarOrganizacao('Organização A');
  orgB = await criarOrganizacao('Organização B');
  contaA = await criarConta(orgA, 'ana.souza');
  contaB = await criarConta(orgB, 'bruno.lima');
});

afterAll(async () => {
  await dono?.end();
  await app?.end();
});

describe('preferências', () => {
  it('a organização e a conta nascem sem nenhum ajuste', async () => {
    const organizacao = await emTransacao(app, orgA, (c) =>
      c.query('select preferencias from organizacoes'),
    );
    const conta = await emTransacao(app, orgA, (c) =>
      c.query('select preferencias from contas where id = $1', [contaA]),
    );
    expect(organizacao.rows).toEqual([{ preferencias: {} }]);
    expect(conta.rows).toEqual([{ preferencias: {} }]);
  });

  it('o papel da aplicação grava os padrões e as escolhas da própria organização', async () => {
    const padroes = { aparencia: { tema: 'nevoa' } };
    const escolhas = { dock: { posicao: 'esquerda' } };
    await emTransacao(app, orgA, async (c) => {
      await c.query('update organizacoes set preferencias = $1', [padroes]);
      await c.query('update contas set preferencias = $1 where id = $2', [escolhas, contaA]);
    });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query(
        'select o.preferencias as padroes, c.preferencias as escolhas from organizacoes o, contas c where c.id = $1',
        [contaA],
      ),
    );
    expect(rows).toEqual([{ padroes, escolhas }]);
  });

  it('não alcança a organização nem as contas de outra', async () => {
    const { organizacoes, contas } = await emTransacao(app, orgA, async (c) => ({
      organizacoes: await c.query("update organizacoes set preferencias = '{}' where id = $1", [
        orgB,
      ]),
      contas: await c.query("update contas set preferencias = '{}' where id = $1", [contaB]),
    }));
    expect(organizacoes.rowCount).toBe(0);
    expect(contas.rowCount).toBe(0);
  });

  it('recusa preferências com mais de 8 KB', async () => {
    const grande = { aparencia: { tema: 'x'.repeat(9000) } };
    await expect(
      emTransacao(app, orgA, (c) => c.query('update organizacoes set preferencias = $1', [grande])),
    ).rejects.toThrow(/check constraint/);
    await expect(
      emTransacao(app, orgA, (c) =>
        c.query('update contas set preferencias = $1 where id = $2', [grande, contaA]),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it('recusa preferências que não são um objeto', async () => {
    await expect(
      emTransacao(app, orgA, (c) =>
        c.query("update contas set preferencias = '[]' where id = $1", [contaA]),
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      emTransacao(app, orgA, (c) => c.query("update organizacoes set preferencias = 'null'")),
    ).rejects.toThrow(/check constraint/);
  });
});
