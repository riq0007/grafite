// O mapa da planta (spec mapa-da-planta; change p7-mapa-da-planta, design, decisão 3): a planta e a
// posição única por planta e alvo, que sai com a planta, isoladas pela organização.
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

let dono: pg.Pool;
let app: pg.Pool;
let orgA = '';
let orgB = '';

async function emTransacao<T>(pool: pg.Pool, org: string, fn: (c: pg.PoolClient) => Promise<T>) {
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

function incluir(tabela: string, org: string, colunas: Record<string, unknown>): Promise<string> {
  const todas = { org_id: org, ...colunas };
  const nomes = Object.keys(todas);
  return emTransacao(app, org, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `insert into ${tabela} (${nomes.join(', ')}) values (${nomes.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
      Object.values(todas),
    );
    return rows[0]?.id ?? '';
  });
}

async function recusada(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
  } catch (erro) {
    return (erro as { constraint?: string; message: string }).constraint ?? (erro as Error).message;
  }
  throw new Error('a mudança não foi recusada');
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

describe('as plantas e as posições', () => {
  it('uma posição por planta e alvo, que sai com a planta, e o isolamento', async () => {
    const planta = await incluir('plantas', orgA, {
      nome: 'Jundiaí',
      nome_normalizado: 'jundiai',
      situacao: 'ativa',
      fonte: 'planta-exemplo.json',
    });
    const alvo = '0199a6e0-0000-7000-8000-0000000000a1';
    await incluir('posicoes_na_planta', orgA, {
      planta_id: planta,
      alvo_tipo: 'ativo',
      alvo_id: alvo,
      x: 10,
      z: 20,
    });
    expect(
      await recusada(
        incluir('posicoes_na_planta', orgA, {
          planta_id: planta,
          alvo_tipo: 'ativo',
          alvo_id: alvo,
          x: 1,
          z: 2,
        }),
      ),
    ).toBe('posicoes_na_planta_alvo_unico');
    expect(
      await recusada(
        incluir('plantas', orgA, {
          nome: 'X',
          nome_normalizado: 'x',
          situacao: 'perdida',
          fonte: 'x',
        }),
      ),
    ).toBe('plantas_situacao_valida');
    const deB = await emTransacao(app, orgB, (c) =>
      c.query('select id from plantas where id = $1', [planta]),
    );
    expect(deB.rowCount).toBe(0);
    await emTransacao(app, orgA, (c) => c.query('delete from plantas where id = $1', [planta]));
    const posicoes = await emTransacao(app, orgA, (c) =>
      c.query('select id from posicoes_na_planta where planta_id = $1', [planta]),
    );
    expect(posicoes.rowCount).toBe(0);
  });
});
