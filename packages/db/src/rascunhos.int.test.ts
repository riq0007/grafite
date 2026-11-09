// Os rascunhos dos cadastros (spec cadastro-de-ativos, "Rascunho do cadastro do ativo"; change
// cadastro-em-etapas, design, decisão 6): um por conta e por cadastro em cada organização, com o
// conteúdo objeto até 256 KB, isolados pela organização, e o índice da manutenção pela data.
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

/** Inclui uma linha com o papel da aplicação, no contexto da organização, e devolve o id. */
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

let nomes = 0;
const unico = (prefixo: string) => `${prefixo} ${++nomes}`;

const conta = async (org: string) =>
  incluir('contas', org, {
    pessoa_id: await incluir('pessoas', org, { nome: unico('Pessoa') }),
    usuario: unico('conta').replace(' ', '.'),
    hash_senha: 'hash',
  });

/** O erro do PostgreSQL de uma inclusão que devia ser recusada. */
async function recusada(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
  } catch (erro) {
    return (erro as { constraint?: string; message: string }).constraint ?? (erro as Error).message;
  }
  throw new Error('a inclusão não foi recusada');
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

const rascunho = (org: string, colunas: Record<string, unknown>) =>
  incluir('rascunhos_de_cadastro', org, {
    cadastro: 'ativo',
    conteudo: { etapa: 'tipo' },
    ...colunas,
  });

describe('rascunhos de cadastro', () => {
  it('cada organização vê só os próprios rascunhos', async () => {
    const deA = await rascunho(orgA, { conta_id: await conta(orgA) });
    const deB = await rascunho(orgB, { conta_id: await conta(orgB) });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select id from rascunhos_de_cadastro'),
    );
    expect(rows.map((r) => r.id)).toContain(deA);
    expect(rows.map((r) => r.id)).not.toContain(deB);
  });

  it('guarda o conteúdo e o momento da gravação', async () => {
    const id = await rascunho(orgA, {
      conta_id: await conta(orgA),
      conteudo: { tipoId: null, valores: { 'ativo.patrimonio': 'PAT-1' } },
    });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select conteudo, atualizado_em from rascunhos_de_cadastro where id = $1', [id]),
    );
    expect(rows[0]?.conteudo).toEqual({ tipoId: null, valores: { 'ativo.patrimonio': 'PAT-1' } });
    expect(rows[0]?.atualizado_em).toBeInstanceOf(Date);
  });

  it('cada conta tem um rascunho só de cada cadastro', async () => {
    const ana = await conta(orgA);
    await rascunho(orgA, { conta_id: ana });
    expect(await recusada(rascunho(orgA, { conta_id: ana }))).toBe('rascunhos_de_cadastro_unico');
    await rascunho(orgA, { conta_id: await conta(orgA) });
  });

  it('confere o cadastro e o conteúdo, que é um objeto até 256 KB', async () => {
    const bruno = await conta(orgB);
    expect(await recusada(rascunho(orgB, { conta_id: bruno, cadastro: 'pessoa' }))).toBe(
      'rascunhos_de_cadastro_cadastro_valido',
    );
    expect(await recusada(rascunho(orgB, { conta_id: bruno, conteudo: JSON.stringify([1]) }))).toBe(
      'rascunhos_de_cadastro_conteudo_valido',
    );
    expect(
      await recusada(rascunho(orgB, { conta_id: bruno, conteudo: { nota: 'x'.repeat(262_144) } })),
    ).toBe('rascunhos_de_cadastro_conteudo_valido');
    await rascunho(orgB, { conta_id: bruno, conteudo: { nota: 'x'.repeat(200_000) } });
  });

  it('a conta é da própria organização', async () => {
    expect(await recusada(rascunho(orgB, { conta_id: await conta(orgA) }))).toBe(
      'rascunhos_de_cadastro_conta_fk',
    );
  });

  it('tem o índice da manutenção, pela organização e pelo momento da gravação', async () => {
    const { rows } = await dono.query(
      `select indexdef from pg_indexes where tablename = 'rascunhos_de_cadastro' and indexname = 'rascunhos_de_cadastro_atualizado_em_idx'`,
    );
    expect(rows[0]?.indexdef).toMatch(/\(org_id, atualizado_em\)/);
  });
});
