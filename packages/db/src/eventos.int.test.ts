// Os eventos de saída (spec eventos-em-tempo-real; design do F2c, decisões 9 e 10): gravados na
// transação da mudança, isolados por organização e avisados pelo banco só depois do commit, com o
// tipo, a organização e os identificadores.
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

let dono: pg.Pool;
let app: pg.Pool;
let ouvinte: pg.Client;
let orgA = '';
let orgB = '';
const avisos: string[] = [];

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

function gravarEvento(c: pg.PoolClient, org: string, colunas: Record<string, unknown> = {}) {
  const todas = {
    org_id: org,
    tipo: 'pessoas.mudaram',
    alvo_tipo: 'pessoa',
    alvo_id: '0199a3f0-0000-7000-8000-000000000001',
    permissao: 'pessoas.ver',
    locais: ['0199a3f0-0000-7000-8000-000000000002', null],
    contas: ['0199a3f0-0000-7000-8000-000000000003'],
    ...colunas,
  };
  const nomes = Object.keys(todas);
  return c.query<{ id: string }>(
    `insert into eventos (${nomes.join(', ')}) values (${nomes.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
    Object.values(todas),
  );
}

/** Espera os avisos chegarem, ou devolve os que chegaram até o fim do prazo. */
async function avisosAte(quantos: number, prazo = 2000): Promise<string[]> {
  const fim = Date.now() + prazo;
  while (avisos.length < quantos && Date.now() < fim) {
    await new Promise((pronto) => setTimeout(pronto, 20));
  }
  return avisos.splice(0);
}

beforeAll(async () => {
  dono = new pg.Pool({ connectionString: inject('urlDono') });
  app = new pg.Pool({ connectionString: inject('urlApp') });
  orgA = await criarOrganizacao('Organização A');
  orgB = await criarOrganizacao('Organização B');
  ouvinte = new pg.Client({ connectionString: inject('urlApp') });
  await ouvinte.connect();
  ouvinte.on('notification', (aviso) => {
    if (aviso.channel === 'grafite_eventos') avisos.push(aviso.payload ?? '');
  });
  await ouvinte.query('listen grafite_eventos');
});

afterAll(async () => {
  await ouvinte?.end();
  await dono?.end();
  await app?.end();
});

describe('eventos', () => {
  it('cada organização vê só os próprios eventos', async () => {
    const deA = await emTransacao(app, orgA, (c) => gravarEvento(c, orgA));
    await emTransacao(app, orgB, (c) => gravarEvento(c, orgB));
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query<{ id: string; org_id: string }>('select id, org_id from eventos'),
    );
    expect(rows.every((r) => r.org_id === orgA)).toBe(true);
    expect(rows.map((r) => r.id)).toContain(deA.rows[0]?.id);
    await avisosAte(2);
  });

  it('recusa o evento sem público', async () => {
    await expect(
      emTransacao(app, orgA, (c) =>
        gravarEvento(c, orgA, { permissao: null, locais: null, contas: null }),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it('recusa os locais sem a permissão', async () => {
    await expect(
      emTransacao(app, orgA, (c) => gravarEvento(c, orgA, { permissao: null, todas: true })),
    ).rejects.toThrow(/check constraint/);
  });

  it('recusa o tipo fora do formato assunto.verbo', async () => {
    await expect(
      emTransacao(app, orgA, (c) => gravarEvento(c, orgA, { tipo: 'Pessoas mudaram' })),
    ).rejects.toThrow(/check constraint/);
  });

  it('o aviso chega só depois do commit', async () => {
    const c = await app.connect();
    try {
      await c.query('begin');
      await c.query("select set_config('app.org_id', $1, true)", [orgA]);
      await gravarEvento(c, orgA);
      expect(await avisosAte(1, 300)).toEqual([]);
      await c.query('commit');
    } finally {
      c.release();
    }
    expect(await avisosAte(1)).toHaveLength(1);
  });

  it('a transação desfeita não avisa nada', async () => {
    await expect(
      emTransacao(app, orgA, async (c) => {
        await gravarEvento(c, orgA);
        throw new Error('a gravação do dado falhou');
      }),
    ).rejects.toThrow('a gravação do dado falhou');
    expect(await avisosAte(1, 500)).toEqual([]);
  });

  it('o aviso leva só o tipo, a organização, o momento e os identificadores', async () => {
    const { rows } = await emTransacao(app, orgA, (c) => gravarEvento(c, orgA));
    const [aviso] = await avisosAte(1);
    const evento = JSON.parse(aviso ?? '{}');
    expect(Object.keys(evento).sort()).toEqual([
      'alvo',
      'id',
      'momento',
      'orgId',
      'publico',
      'tipo',
    ]);
    expect(evento).toMatchObject({
      id: rows[0]?.id,
      orgId: orgA,
      tipo: 'pessoas.mudaram',
      alvo: { tipo: 'pessoa', id: '0199a3f0-0000-7000-8000-000000000001' },
      publico: {
        permissao: 'pessoas.ver',
        locais: ['0199a3f0-0000-7000-8000-000000000002', null],
        contas: ['0199a3f0-0000-7000-8000-000000000003'],
      },
    });
    expect(Number.isNaN(Date.parse(evento.momento))).toBe(false);
  });

  it('o evento de todas as sessões, sem alvo, avisa só o que tem', async () => {
    await emTransacao(app, orgA, (c) =>
      gravarEvento(c, orgA, {
        tipo: 'padroes.mudaram',
        alvo_tipo: null,
        alvo_id: null,
        permissao: null,
        locais: null,
        contas: null,
        todas: true,
      }),
    );
    const [aviso] = await avisosAte(1);
    expect(JSON.parse(aviso ?? '{}')).toMatchObject({ alvo: null, publico: { todas: true } });
  });
});
