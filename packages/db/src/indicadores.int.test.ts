// Os indicadores da organização (spec indicadores, "Metas da organização" e "Indicador fora da meta
// avisa"; change p3d-indicadores, design, decisões 1 e 3; spec indicadores-da-operacao; change
// p4f-indicadores-da-operacao, design, decisão 5): a meta escolhida e a marca da avaliação diária de
// cada indicador, dos alertas e da operação, isoladas pela organização, o índice dos alertas pela
// abertura e o das OS pela resolução.
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

const indicador = (org: string, colunas: Record<string, unknown>) =>
  incluir('indicadores_da_organizacao', org, colunas);

describe('indicadores da organização', () => {
  it('cada organização vê só os próprios indicadores', async () => {
    const deA = await indicador(orgA, { indicador: 'toner', meta: 1440 });
    const deB = await indicador(orgB, { indicador: 'toner', meta: 2880 });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select id from indicadores_da_organizacao'),
    );
    expect(rows.map((r) => r.id)).toContain(deA);
    expect(rows.map((r) => r.id)).not.toContain(deB);
  });

  it('nasce sem meta escolhida, sem quem mudou e sem a marca da avaliação', async () => {
    const id = await indicador(orgA, { indicador: 'critico' });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query(
        'select meta, meta_alterada_em, meta_alterada_por, fora_da_meta_desde from indicadores_da_organizacao where id = $1',
        [id],
      ),
    );
    expect(rows).toEqual([
      { meta: null, meta_alterada_em: null, meta_alterada_por: null, fora_da_meta_desde: null },
    ]);
  });

  it('um indicador tem uma linha só por organização', async () => {
    await indicador(orgA, { indicador: 'disponibilidade', meta: 995 });
    expect(await recusada(indicador(orgA, { indicador: 'disponibilidade', meta: 990 }))).toBe(
      'indicadores_da_organizacao_indicador_unico',
    );
    await indicador(orgB, { indicador: 'disponibilidade', meta: 990 });
  });

  it('confere o indicador e a meta', async () => {
    expect(await recusada(indicador(orgB, { indicador: 'toner-colorido' }))).toBe(
      'indicadores_da_organizacao_indicador_valido',
    );
    expect(await recusada(indicador(orgB, { indicador: 'que-voltam', meta: 0 }))).toBe(
      'indicadores_da_organizacao_meta_valida',
    );
  });

  it('aceita os três indicadores da operação, com a meta na unidade de cada um', async () => {
    await indicador(orgB, { indicador: 'resolucao-das-os', meta: 4320 });
    await indicador(orgB, { indicador: 'os-repetidas', meta: 3 });
    await indicador(orgB, {
      indicador: 'paginas-por-toner',
      meta: 800,
      fora_da_meta_desde: new Date(),
    });
    const { rows } = await emTransacao(app, orgB, (c) =>
      c.query(
        `select indicador, meta from indicadores_da_organizacao
          where indicador in ('resolucao-das-os', 'os-repetidas', 'paginas-por-toner')
          order by indicador`,
      ),
    );
    expect(rows).toEqual([
      { indicador: 'os-repetidas', meta: 3 },
      { indicador: 'paginas-por-toner', meta: 800 },
      { indicador: 'resolucao-das-os', meta: 4320 },
    ]);
  });

  it('quem mudou a meta é uma conta da própria organização', async () => {
    expect(
      await recusada(
        indicador(orgB, { indicador: 'critico', meta: 15, meta_alterada_por: await conta(orgA) }),
      ),
    ).toBe('indicadores_da_organizacao_alterada_por_fk');
    await indicador(orgB, {
      indicador: 'critico',
      meta: 15,
      meta_alterada_em: new Date(),
      meta_alterada_por: await conta(orgB),
    });
  });
});

describe('alertas pela abertura', () => {
  it('têm o índice da organização com o momento da abertura', async () => {
    const { rows } = await dono.query(
      `select indexdef from pg_indexes where tablename = 'alertas' and indexname = 'alertas_aberto_em_idx'`,
    );
    expect(rows[0]?.indexdef).toMatch(/\(org_id, aberto_em\) WHERE \(aberto_em IS NOT NULL\)/);
  });
});

describe('OS pela resolução', () => {
  it('têm o índice da organização com o momento da resolução', async () => {
    const { rows } = await dono.query(
      `select indexdef from pg_indexes where tablename = 'ordens_de_servico' and indexname = 'ordens_de_servico_resolvida_idx'`,
    );
    expect(rows[0]?.indexdef).toMatch(
      /\(org_id, resolvida_em\) WHERE \(resolvida_em IS NOT NULL\)/,
    );
  });
});
