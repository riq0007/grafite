// Os fornecedores (spec fornecedores, "Fornecedor"; change p4a-fornecedores, design, decisão 2): o
// cadastro da organização, isolado por ela, com o nome normalizado e o CNPJ únicos e as checagens
// dos limites do domínio.
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

const fornecedor = (org: string, colunas: Record<string, unknown> = {}) => {
  const nome = (colunas.nome as string | undefined) ?? unico('Fornecedor');
  return incluir('fornecedores', org, {
    nome,
    nome_normalizado: nome.toLowerCase(),
    ...colunas,
  });
};

describe('fornecedores', () => {
  it('cada organização vê só os próprios fornecedores', async () => {
    const deA = await fornecedor(orgA);
    const deB = await fornecedor(orgB);
    const { rows } = await emTransacao(app, orgA, (c) => c.query('select id from fornecedores'));
    expect(rows.map((r) => r.id)).toContain(deA);
    expect(rows.map((r) => r.id)).not.toContain(deB);
  });

  it('nasce ativo, sem os opcionais, com os momentos', async () => {
    const id = await fornecedor(orgA);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query(
        `select situacao, cnpj, contato, email, telefone, observacoes,
                criado_em > now() - interval '1 minute' as agora
           from fornecedores where id = $1`,
        [id],
      ),
    );
    expect(rows).toEqual([
      {
        situacao: 'ativo',
        cnpj: null,
        contato: null,
        email: null,
        telefone: null,
        observacoes: null,
        agora: true,
      },
    ]);
  });

  it('o nome normalizado é único na organização, e só nela', async () => {
    await fornecedor(orgA, { nome: 'HP Brasil', nome_normalizado: 'hp brasil' });
    expect(
      await recusada(fornecedor(orgA, { nome: 'hp  brasil', nome_normalizado: 'hp brasil' })),
    ).toBe('fornecedores_nome_unico');
    await fornecedor(orgB, { nome: 'HP Brasil', nome_normalizado: 'hp brasil' });
  });

  it('o CNPJ é único entre os preenchidos da organização', async () => {
    await fornecedor(orgA, { cnpj: '12345678000195' });
    expect(await recusada(fornecedor(orgA, { cnpj: '12345678000195' }))).toBe(
      'fornecedores_cnpj_unico',
    );
    await fornecedor(orgA, { cnpj: null });
    await fornecedor(orgA, { cnpj: null });
    await fornecedor(orgB, { cnpj: '12345678000195' });
  });

  it('confere o nome, o CNPJ, os textos e a situação', async () => {
    expect(await recusada(fornecedor(orgB, { nome: '', nome_normalizado: '' }))).toBe(
      'fornecedores_nome_valido',
    );
    expect(await recusada(fornecedor(orgB, { nome: 'x'.repeat(121) }))).toBe(
      'fornecedores_nome_valido',
    );
    expect(await recusada(fornecedor(orgB, { cnpj: '12.345.678/0001-95' }))).toBe(
      'fornecedores_cnpj_valido',
    );
    expect(await recusada(fornecedor(orgB, { cnpj: '12abc34501de35' }))).toBe(
      'fornecedores_cnpj_valido',
    );
    expect(await recusada(fornecedor(orgB, { contato: 'x'.repeat(121) }))).toBe(
      'fornecedores_textos_validos',
    );
    expect(await recusada(fornecedor(orgB, { telefone: '9'.repeat(31) }))).toBe(
      'fornecedores_textos_validos',
    );
    expect(await recusada(fornecedor(orgB, { observacoes: 'x'.repeat(2001) }))).toBe(
      'fornecedores_textos_validos',
    );
    expect(await recusada(fornecedor(orgB, { situacao: 'excluido' }))).toBe(
      'fornecedores_situacao_valida',
    );
  });
});
