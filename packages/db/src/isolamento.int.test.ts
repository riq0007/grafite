// Contrato de isolamento (spec isolamento-organizacoes), testado direto no banco,
// com SQL puro: vale para qualquer tabela criada com app.isolar_por_organizacao().
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

async function inserirComoApp(org: string, nome: string) {
  await emTransacao(app, org, (c) =>
    c.query('insert into prova_isolamento (org_id, nome) values ($1, $2)', [org, nome]),
  );
}

async function nomesVistosPor(org: string | null): Promise<string[]> {
  const { rows } = await emTransacao(app, org, (c) =>
    c.query<{ nome: string }>('select nome from prova_isolamento order by nome'),
  );
  return rows.map((r) => r.nome);
}

beforeAll(async () => {
  dono = new pg.Pool({ connectionString: inject('urlDono') });
  app = new pg.Pool({ connectionString: inject('urlApp') });
  await dono.query(`create table prova_isolamento (
    id uuid primary key default uuidv7(),
    org_id uuid not null references organizacoes (id),
    nome text not null
  )`);
  await dono.query("select app.isolar_por_organizacao('prova_isolamento')");
  orgA = await criarOrganizacao('Organização A');
  orgB = await criarOrganizacao('Organização B');
  await inserirComoApp(orgA, 'a1');
  await inserirComoApp(orgA, 'a2');
  await inserirComoApp(orgB, 'b1');
});

afterAll(async () => {
  await dono?.query('drop table if exists prova_isolamento');
  await dono?.end();
  await app?.end();
});

describe('isolamento por organização', () => {
  it('consulta sem filtro no contexto de A retorna só os registros de A', async () => {
    expect(await nomesVistosPor(orgA)).toEqual(['a1', 'a2']);
  });

  it('no contexto de A, gravar um registro da organização B é recusado', async () => {
    await expect(
      emTransacao(app, orgA, (c) =>
        c.query('insert into prova_isolamento (org_id, nome) values ($1, $2)', [orgB, 'invasor']),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('no contexto de A, alterar registros de B não afeta nenhuma linha', async () => {
    const r = await emTransacao(app, orgA, (c) =>
      c.query("update prova_isolamento set nome = 'alterado' where nome = 'b1'"),
    );
    expect(r.rowCount).toBe(0);
    expect(await nomesVistosPor(orgB)).toEqual(['b1']);
  });

  it('sem organização no contexto, a consulta não retorna nada', async () => {
    expect(await nomesVistosPor(null)).toEqual([]);
  });

  it('depois de uma transação com contexto, a próxima sem contexto na mesma conexão não vê nada', async () => {
    const c = await app.connect();
    try {
      await c.query('begin');
      await c.query("select set_config('app.org_id', $1, true)", [orgA]);
      await c.query('select nome from prova_isolamento');
      await c.query('commit');
      const { rows } = await c.query('select nome from prova_isolamento');
      expect(rows).toEqual([]);
    } finally {
      c.release();
    }
  });

  it('até o papel dono das tabelas, sem contexto, não vê nenhum registro', async () => {
    const { rows } = await dono.query('select nome from prova_isolamento');
    expect(rows).toEqual([]);
  });

  it('uma segunda organização passa a operar sem nenhuma migration', async () => {
    const orgC = await criarOrganizacao('Organização C');
    await inserirComoApp(orgC, 'c1');
    expect(await nomesVistosPor(orgC)).toEqual(['c1']);
    expect(await nomesVistosPor(orgA)).toEqual(['a1', 'a2']);
  });

  it('cada organização só enxerga a si mesma na tabela de organizações', async () => {
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query<{ id: string }>('select id from organizacoes'),
    );
    expect(rows.map((r) => r.id)).toEqual([orgA]);
  });
});

describe('identificadores', () => {
  const sucessor = (id: string) =>
    (BigInt(`0x${id.replaceAll('-', '')}`) + 1n).toString(16).padStart(32, '0');

  it('são uuid versão 7, ordenáveis pela criação e não obtidos somando 1 ao anterior', async () => {
    const criados: string[] = [];
    for (let i = 0; i < 20; i++) {
      const { rows } = await emTransacao(app, orgA, (c) =>
        c.query<{ id: string }>(
          'insert into prova_isolamento (org_id, nome) values ($1, $2) returning id',
          [orgA, `id-${String(i).padStart(2, '0')}`],
        ),
      );
      criados.push(rows[0]?.id ?? '');
    }
    for (const id of criados) expect(id[14]).toBe('7');
    expect([...criados].sort()).toEqual(criados);
    for (let i = 1; i < criados.length; i++) {
      expect(criados[i]?.replaceAll('-', '')).not.toBe(sucessor(criados[i - 1] ?? ''));
    }
    await emTransacao(app, orgA, (c) =>
      c.query("delete from prova_isolamento where nome like 'id-%'"),
    );
  });
});

describe('o papel da aplicação não contorna o isolamento', () => {
  it('não consegue desativar o RLS da tabela', async () => {
    await expect(
      app.query('alter table prova_isolamento disable row level security'),
    ).rejects.toThrow(/must be owner/);
  });

  it('não consegue ler ignorando as políticas com row_security = off', async () => {
    await expect(
      emTransacao(app, orgA, async (c) => {
        await c.query('set local row_security = off');
        return c.query('select nome from prova_isolamento');
      }),
    ).rejects.toThrow(/row-level security/);
  });

  it('não consegue assumir o papel dono das tabelas', async () => {
    await expect(app.query('set role grafite_owner')).rejects.toThrow(/permission denied/);
  });
});
