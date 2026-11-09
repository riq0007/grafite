// A árvore de locais (spec locais): isolada por organização, com o pai na mesma organização, o nome
// único entre irmãos (também na raiz) e o tipo e a situação de uma lista fechada.
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

let dono: pg.Pool;
let app: pg.Pool;
let orgA = '';
let orgB = '';

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

function criarLocal(
  org: string,
  {
    nome,
    pai = null,
    tipo = 'setor',
    situacao = 'ativo',
  }: Record<string, string | null> & {
    nome: string;
  },
): Promise<string> {
  return emTransacao(app, org, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `insert into locais (org_id, pai_id, nome, nome_normalizado, tipo, situacao)
       values ($1, $2, $3, lower($3), $4, $5) returning id`,
      [org, pai, nome, tipo, situacao],
    );
    return rows[0]?.id ?? '';
  });
}

beforeAll(async () => {
  dono = new pg.Pool({ connectionString: inject('urlDono') });
  app = new pg.Pool({ connectionString: inject('urlApp') });
  orgA = await criarOrganizacao('Organização A');
  orgB = await criarOrganizacao('Organização B');
});

afterAll(async () => {
  await dono?.end();
  await app?.end();
});

describe('locais', () => {
  it('cada organização vê só os próprios locais', async () => {
    await criarLocal(orgA, { nome: 'Jundiaí', tipo: 'unidade' });
    await criarLocal(orgB, { nome: 'Campinas', tipo: 'unidade' });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query<{ nome: string }>('select nome from locais'),
    );
    expect(rows.map((r) => r.nome)).toEqual(['Jundiaí']);
  });

  it('recusa um pai de outra organização', async () => {
    const deB = await criarLocal(orgB, { nome: 'Sorocaba', tipo: 'unidade' });
    await expect(criarLocal(orgA, { nome: 'Intruso', pai: deB })).rejects.toThrow(/locais_pai_fk/);
  });

  it('recusa o nome repetido entre irmãos, também na raiz', async () => {
    const raiz = await criarLocal(orgA, { nome: 'Itupeva', tipo: 'unidade' });
    await criarLocal(orgA, { nome: 'Expedição', pai: raiz });
    await expect(criarLocal(orgA, { nome: 'EXPEDIÇÃO', pai: raiz })).rejects.toThrow(
      /locais_nome_unico_no_lugar/,
    );
    await expect(criarLocal(orgA, { nome: 'itupeva', tipo: 'unidade' })).rejects.toThrow(
      /locais_nome_unico_no_lugar/,
    );
  });

  it('aceita o mesmo nome em lugares diferentes e em outra organização', async () => {
    const a1 = await criarLocal(orgA, { nome: 'Prédio 1', tipo: 'predio' });
    const a2 = await criarLocal(orgA, { nome: 'Prédio 2', tipo: 'predio' });
    await criarLocal(orgA, { nome: 'Sala 12', pai: a1, tipo: 'sala' });
    await criarLocal(orgA, { nome: 'Sala 12', pai: a2, tipo: 'sala' });
    await criarLocal(orgB, { nome: 'Prédio 1', tipo: 'predio' });
  });

  it('recusa o tipo e a situação fora da lista', async () => {
    await expect(criarLocal(orgA, { nome: 'Rack 3', tipo: 'rack' })).rejects.toThrow(
      /locais_tipo_valido/,
    );
    await expect(criarLocal(orgA, { nome: 'Doca 9', situacao: 'apagado' })).rejects.toThrow(
      /locais_situacao_valida/,
    );
  });

  it('recusa o nome vazio ou longo demais', async () => {
    await expect(criarLocal(orgA, { nome: '   ' })).rejects.toThrow(/locais_nome_valido/);
    await expect(criarLocal(orgA, { nome: 'x'.repeat(81) })).rejects.toThrow(/locais_nome_valido/);
  });
});
