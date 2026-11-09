// As tarefas com falha e a lista das organizações para as tarefas (specs fila-de-tarefas e
// isolamento-organizacoes; design do F2c, decisões 15 e 16).
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

function registrarFalha(org: string, colunas: Record<string, unknown> = {}) {
  const todas = {
    org_id: org,
    tarefa: 'manutencao',
    dados: { org },
    tentativas: 6,
    erro: 'A conexão com o armazenamento caiu.',
    ...colunas,
  };
  const nomes = Object.keys(todas);
  return emTransacao(app, org, (c) =>
    c.query<{ id: string }>(
      `insert into tarefas_com_falha (${nomes.join(', ')}) values (${nomes.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
      Object.values(todas),
    ),
  );
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

describe('tarefas com falha', () => {
  it('cada organização vê só as próprias tarefas com falha', async () => {
    await registrarFalha(orgA);
    await registrarFalha(orgB);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query<{ org_id: string }>('select org_id from tarefas_com_falha'),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.org_id === orgA)).toBe(true);
  });

  it('a falha nasce com o momento dela', async () => {
    const { rows } = await registrarFalha(orgA);
    const lida = await emTransacao(app, orgA, (c) =>
      c.query('select falhou_em is not null as falhou from tarefas_com_falha where id = $1', [
        rows[0]?.id,
      ]),
    );
    expect(lida.rows).toEqual([{ falhou: true }]);
  });

  it('recusa a tarefa sem tentativa, o erro longo demais e os dados que não são objeto', async () => {
    await expect(registrarFalha(orgA, { tentativas: 0 })).rejects.toThrow(/check constraint/);
    await expect(registrarFalha(orgA, { erro: 'x'.repeat(501) })).rejects.toThrow(
      /check constraint/,
    );
    await expect(registrarFalha(orgA, { dados: JSON.stringify([orgA]) })).rejects.toThrow(
      /check constraint/,
    );
    await expect(registrarFalha(orgA, { tarefa: 'Manutenção diária' })).rejects.toThrow(
      /check constraint/,
    );
  });
});

describe('lista das organizações para as tarefas', () => {
  it('o papel da aplicação recebe só os identificadores de todas as organizações', async () => {
    const { rows, fields } = await app.query('select * from app.organizacoes_para_tarefas()');
    expect(fields.map((campo) => campo.name)).toEqual(['organizacoes_para_tarefas']);
    expect(rows.map((r) => r.organizacoes_para_tarefas)).toEqual(
      expect.arrayContaining([orgA, orgB]),
    );
  });

  it('a tabela das organizações continua fechada sem contexto', async () => {
    const { rows } = await app.query('select id from organizacoes');
    expect(rows).toEqual([]);
  });

  it('só o papel da aplicação executa a função, e o PUBLIC não', async () => {
    const publico = await dono.query(
      `select count(*)::int as n from pg_proc p, aclexplode(p.proacl) a
        where p.proname = 'organizacoes_para_tarefas' and a.grantee = 0`,
    );
    expect(publico.rows).toEqual([{ n: 0 }]);
    const doApp = await dono.query(
      "select has_function_privilege('grafite_app', 'app.organizacoes_para_tarefas()', 'execute') as pode",
    );
    expect(doApp.rows).toEqual([{ pode: true }]);
  });
});
