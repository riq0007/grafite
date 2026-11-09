// As visões de tabela (spec visoes-de-tabela; design do P1c, decisão 5): isoladas pela organização,
// a da organização sem conta e a de uma conta com ela, o nome único entre as da organização e,
// à parte, entre as de cada conta, a tabela conhecida e a definição como objeto de até 32 KB.
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

let contador = 0;

async function conta(org: string): Promise<string> {
  const pessoaId = await incluir('pessoas', org, { nome: 'Bruno', busca: 'bruno' });
  return incluir('contas', org, {
    pessoa_id: pessoaId,
    usuario: `bruno${++contador}`,
    hash_senha: 'hash',
  });
}

const DEFINICAO = JSON.stringify({
  colunas: [{ chave: 'ativo.rotulo' }],
  ordenacao: null,
  filtros: [],
});

const visao = (org: string, colunas: Record<string, unknown>) =>
  incluir('visoes', org, {
    tabela: 'ativos',
    nome: colunas.nome,
    nome_normalizado: String(colunas.nome).toLowerCase(),
    definicao: DEFINICAO,
    ...colunas,
  });

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

describe('visões', () => {
  it('cada organização vê só as próprias visões', async () => {
    const deA = await visao(orgA, { nome: 'Impressoras' });
    const deB = await visao(orgB, { nome: 'Impressoras' });
    const { rows } = await emTransacao(app, orgA, (c) => c.query('select id from visoes'));
    expect(rows.map((r) => r.id)).toContain(deA);
    expect(rows.map((r) => r.id)).not.toContain(deB);
  });

  it('a visão da organização fica sem conta, e a de uma conta, com ela, com os momentos', async () => {
    const dona = await conta(orgA);
    const daOrganizacao = await visao(orgA, { nome: 'Switches' });
    const daConta = await visao(orgA, { nome: 'Switches', conta_id: dona });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query(
        'select id, conta_id, criado_em is not null as com_momento from visoes where id = any($1) order by conta_id nulls first',
        [[daOrganizacao, daConta]],
      ),
    );
    expect(rows).toEqual([
      { id: daOrganizacao, conta_id: null, com_momento: true },
      { id: daConta, conta_id: dona, com_momento: true },
    ]);
  });

  it('o nome é único entre as visões da organização e, à parte, entre as de cada conta', async () => {
    const bruno = await conta(orgA);
    const carla = await conta(orgA);
    await visao(orgA, { nome: 'Notebooks' });
    await expect(visao(orgA, { nome: 'Notebooks' })).rejects.toThrow(/unique/);
    expect(await visao(orgA, { nome: 'Notebooks', conta_id: bruno })).not.toBe('');
    await expect(visao(orgA, { nome: 'Notebooks', conta_id: bruno })).rejects.toThrow(/unique/);
    expect(await visao(orgA, { nome: 'Notebooks', conta_id: carla })).not.toBe('');
    expect(await visao(orgB, { nome: 'Notebooks' })).not.toBe('');
  });

  it('a conta é da mesma organização: o banco recusa a de outra', async () => {
    const deB = await conta(orgB);
    await expect(visao(orgA, { nome: 'De outra', conta_id: deB })).rejects.toThrow(/foreign key/);
  });

  it('confere a tabela e a forma e o tamanho da definição', async () => {
    await expect(visao(orgA, { nome: 'Pessoas', tabela: 'pessoas' })).rejects.toThrow(
      /check constraint/,
    );
    await expect(visao(orgA, { nome: 'Lista', definicao: JSON.stringify([1]) })).rejects.toThrow(
      /check constraint/,
    );
    const grande = JSON.stringify({ colunas: [{ chave: 'a'.repeat(33_000) }] });
    await expect(visao(orgA, { nome: 'Grande', definicao: grande })).rejects.toThrow(
      /check constraint/,
    );
  });
});

// As mudanças da conta sobre uma visão (change visoes-da-conta, design, decisão 1): uma linha por
// conta, tabela e visão, a de fábrica sem a visão; a definição com a forma e o tamanho de uma visão;
// e a remoção da visão apaga as mudanças de todos sobre ela.
const mudancas = (org: string, colunas: Record<string, unknown>) =>
  incluir('mudancas_das_visoes', org, { tabela: 'ativos', definicao: DEFINICAO, ...colunas });

describe('mudanças das visões', () => {
  it('cada organização vê só as próprias mudanças', async () => {
    const deA = await mudancas(orgA, { conta_id: await conta(orgA) });
    const deB = await mudancas(orgB, { conta_id: await conta(orgB) });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select id from mudancas_das_visoes'),
    );
    expect(rows.map((r) => r.id)).toContain(deA);
    expect(rows.map((r) => r.id)).not.toContain(deB);
  });

  it('uma linha por conta, tabela e visão, também na de fábrica', async () => {
    const bruno = await conta(orgA);
    const carla = await conta(orgA);
    const impressoras = await visao(orgA, { nome: `Impressoras ${bruno}` });
    await mudancas(orgA, { conta_id: bruno });
    await expect(mudancas(orgA, { conta_id: bruno })).rejects.toThrow(/unique/);
    await mudancas(orgA, { conta_id: bruno, visao_id: impressoras });
    await expect(mudancas(orgA, { conta_id: bruno, visao_id: impressoras })).rejects.toThrow(
      /unique/,
    );
    expect(await mudancas(orgA, { conta_id: carla, visao_id: impressoras })).not.toBe('');
  });

  it('remover a visão apaga as mudanças de todos sobre ela', async () => {
    const bruno = await conta(orgA);
    const carla = await conta(orgA);
    const switches = await visao(orgA, { nome: `Switches ${bruno}` });
    await mudancas(orgA, { conta_id: bruno, visao_id: switches });
    await mudancas(orgA, { conta_id: carla, visao_id: switches });
    await emTransacao(app, orgA, (c) => c.query('delete from visoes where id = $1', [switches]));
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select id from mudancas_das_visoes where visao_id = $1', [switches]),
    );
    expect(rows).toEqual([]);
  });

  it('a conta e a visão são da mesma organização', async () => {
    const bruno = await conta(orgA);
    await expect(mudancas(orgA, { conta_id: await conta(orgB) })).rejects.toThrow(/foreign key/);
    const deB = await visao(orgB, { nome: `De B ${bruno}` });
    await expect(mudancas(orgA, { conta_id: bruno, visao_id: deB })).rejects.toThrow(/foreign key/);
  });

  it('confere a tabela e a forma e o tamanho da definição', async () => {
    const bruno = await conta(orgA);
    await expect(mudancas(orgA, { conta_id: bruno, tabela: 'pessoas' })).rejects.toThrow(
      /check constraint/,
    );
    const grande = JSON.stringify({ colunas: [{ chave: 'a'.repeat(33_000) }] });
    await expect(mudancas(orgA, { conta_id: bruno, definicao: grande })).rejects.toThrow(
      /check constraint/,
    );
  });
});
