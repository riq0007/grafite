// Organização pelo endereço de acesso (spec isolamento-organizacoes): a descoberta é a única
// consulta que atravessa organizações, e devolve só a organização de um endereço exato.
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

let dono: pg.Pool;
let app: pg.Pool;
let orgA = '';
let orgB = '';

async function emTransacao<T>(
  pool: pg.Pool,
  org: string | null,
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    if (org) await c.query("select set_config('app.org_id', $1, true)", [org]);
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

function registrar(org: string, endereco: string) {
  return emTransacao(app, org, (c) =>
    c.query('insert into enderecos_de_acesso (org_id, endereco) values ($1, $2)', [org, endereco]),
  );
}

async function organizacaoDo(endereco: string): Promise<string | null> {
  const { rows } = await app.query<{ org: string | null }>(
    'select app.organizacao_do_endereco($1) as org',
    [endereco],
  );
  return rows[0]?.org ?? null;
}

async function enderecosVistosPor(org: string | null): Promise<string[]> {
  const { rows } = await emTransacao(app, org, (c) =>
    c.query<{ endereco: string }>('select endereco from enderecos_de_acesso order by endereco'),
  );
  return rows.map((r) => r.endereco);
}

beforeAll(async () => {
  dono = new pg.Pool({ connectionString: inject('urlDono') });
  app = new pg.Pool({ connectionString: inject('urlApp') });
  orgA = await criarOrganizacao('Organização A');
  orgB = await criarOrganizacao('Organização B');
  await registrar(orgA, 'grafite.a.local');
  await registrar(orgA, '10.0.0.5');
  await registrar(orgB, 'grafite.b.local');
});

afterAll(async () => {
  await dono?.end();
  await app?.end();
});

describe('descoberta da organização pelo endereço', () => {
  it('o endereço exato devolve a organização dele, sem contexto', async () => {
    expect(await organizacaoDo('grafite.a.local')).toBe(orgA);
    expect(await organizacaoDo('10.0.0.5')).toBe(orgA);
    expect(await organizacaoDo('grafite.b.local')).toBe(orgB);
  });

  it('um endereço desconhecido devolve nulo', async () => {
    expect(await organizacaoDo('grafite.c.local')).toBeNull();
  });

  it('não casa por padrão: só o endereço exato', async () => {
    expect(await organizacaoDo('%')).toBeNull();
    expect(await organizacaoDo('grafite.a.local ')).toBeNull();
  });
});

describe('a tabela de endereços continua isolada', () => {
  it('o papel da aplicação, sem contexto, não vê nenhum endereço', async () => {
    expect(await enderecosVistosPor(null)).toEqual([]);
  });

  it('no contexto de A, vê só os endereços de A', async () => {
    expect(await enderecosVistosPor(orgA)).toEqual(['10.0.0.5', 'grafite.a.local']);
  });

  it('o mesmo endereço não pode pertencer a duas organizações', async () => {
    await expect(registrar(orgB, 'grafite.a.local')).rejects.toThrow(/duplicate key/);
  });

  it('recusa o endereço fora da forma normalizada', async () => {
    for (const errado of [
      'Grafite.A.Local',
      'grafite.b.local.',
      'grafite.b.local:3000',
      '[::1]',
      '',
    ]) {
      await expect(registrar(orgB, errado), errado).rejects.toThrow(/check constraint/);
    }
  });
});
