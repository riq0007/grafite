// Os consumíveis (spec consumiveis, "Consumível", "Fornecedores do consumível" e "Compatibilidade
// com os modelos"; change p4b-consumiveis, design, decisão 2): o catálogo da organização, isolado
// por ela, com o código normalizado único e as checagens do domínio, e as ligações com os
// fornecedores e os modelos da mesma organização.
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
const unico = (prefixo: string) => `${prefixo}${++nomes}`;

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

const consumivel = (org: string, colunas: Record<string, unknown> = {}) => {
  const codigo = (colunas.codigo as string | undefined) ?? unico('CF');
  return incluir('consumiveis', org, {
    codigo,
    codigo_normalizado: codigo.toUpperCase().replace(/[\s-]/g, ''),
    tipo: 'toner',
    ...colunas,
  });
};

const fornecedor = (org: string) => {
  const nome = unico('Fornecedor ');
  return incluir('fornecedores', org, { nome, nome_normalizado: nome.toLowerCase() });
};

async function modelo(org: string): Promise<string> {
  const tipo = unico('Impressora ');
  const tipoId = await incluir('tipos_de_ativo', org, {
    nome: tipo,
    nome_normalizado: tipo.toLowerCase(),
    icone: 'impressora',
  });
  const nome = unico('LaserJet M');
  return incluir('modelos', org, {
    tipo_id: tipoId,
    fabricante: 'HP',
    fabricante_normalizado: 'hp',
    nome,
    nome_normalizado: nome.toLowerCase(),
    busca: `hp ${nome.toLowerCase()}`,
  });
}

describe('consumíveis', () => {
  it('cada organização vê só os próprios consumíveis', async () => {
    const deA = await consumivel(orgA);
    const deB = await consumivel(orgB);
    const { rows } = await emTransacao(app, orgA, (c) => c.query('select id from consumiveis'));
    expect(rows.map((r) => r.id)).toContain(deA);
    expect(rows.map((r) => r.id)).not.toContain(deB);
  });

  it('nasce ativo, sem os opcionais, com os momentos', async () => {
    const id = await consumivel(orgA);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query(
        `select situacao, nome, nome_normalizado, cor, rendimento,
                criado_em > now() - interval '1 minute' as agora
           from consumiveis where id = $1`,
        [id],
      ),
    );
    expect(rows).toEqual([
      {
        situacao: 'ativo',
        nome: null,
        nome_normalizado: null,
        cor: null,
        rendimento: null,
        agora: true,
      },
    ]);
  });

  it('Código com outra grafia: o código normalizado é único na organização, e só nela', async () => {
    await consumivel(orgA, { codigo: 'TN-2370', codigo_normalizado: 'TN2370' });
    expect(
      await recusada(consumivel(orgA, { codigo: 'tn 2370', codigo_normalizado: 'TN2370' })),
    ).toBe('consumiveis_codigo_unico');
    await consumivel(orgB, { codigo: 'TN-2370', codigo_normalizado: 'TN2370' });
  });

  it('confere o código, o nome, o tipo, a cor, o rendimento e a situação', async () => {
    expect(await recusada(consumivel(orgB, { codigo: ' ', codigo_normalizado: '' }))).toBe(
      'consumiveis_codigo_valido',
    );
    expect(await recusada(consumivel(orgB, { codigo: 'C'.repeat(41) }))).toBe(
      'consumiveis_codigo_valido',
    );
    expect(await recusada(consumivel(orgB, { codigo: '---', codigo_normalizado: '' }))).toBe(
      'consumiveis_codigo_valido',
    );
    expect(await recusada(consumivel(orgB, { nome: 'N'.repeat(81), nome_normalizado: 'n' }))).toBe(
      'consumiveis_nome_valido',
    );
    expect(await recusada(consumivel(orgB, { nome: 'HP 58A', nome_normalizado: null }))).toBe(
      'consumiveis_nome_valido',
    );
    expect(await recusada(consumivel(orgB, { tipo: 'cartucho' }))).toBe('consumiveis_tipo_valido');
    expect(await recusada(consumivel(orgB, { cor: 'branco' }))).toBe('consumiveis_cor_valida');
    expect(await recusada(consumivel(orgB, { rendimento: 0 }))).toBe(
      'consumiveis_rendimento_valido',
    );
    expect(await recusada(consumivel(orgB, { rendimento: 1_000_001 }))).toBe(
      'consumiveis_rendimento_valido',
    );
    expect(await recusada(consumivel(orgB, { situacao: 'excluido' }))).toBe(
      'consumiveis_situacao_valida',
    );
    await consumivel(orgB, {
      tipo: 'kit-de-manutencao',
      nome: 'Kit do fusor',
      nome_normalizado: 'kit do fusor',
      cor: 'colorido',
      rendimento: 1_000_000,
    });
  });

  it('Peça no catálogo: aceita a peça, sem a cor e sem o rendimento', async () => {
    await consumivel(orgB, {
      codigo: unico('FNT-'),
      tipo: 'peca',
      nome: 'Fonte 65W',
      nome_normalizado: 'fonte 65w',
    });
  });
});

describe('fornecedores dos consumíveis', () => {
  it('liga o consumível ao fornecedor da mesma organização, uma vez só', async () => {
    const [toner, hp] = [await consumivel(orgA), await fornecedor(orgA)];
    await incluir('fornecedores_dos_consumiveis', orgA, {
      consumivel_id: toner,
      fornecedor_id: hp,
    });
    expect(
      await recusada(
        incluir('fornecedores_dos_consumiveis', orgA, { consumivel_id: toner, fornecedor_id: hp }),
      ),
    ).toBe('fornecedores_dos_consumiveis_unico');
    const deOutra = await fornecedor(orgB);
    expect(
      await recusada(
        incluir('fornecedores_dos_consumiveis', orgA, {
          consumivel_id: toner,
          fornecedor_id: deOutra,
        }),
      ),
    ).toBe('fornecedores_dos_consumiveis_fornecedor_fk');
  });

  it('cada organização vê só as próprias ligações', async () => {
    const [toner, hp] = [await consumivel(orgB), await fornecedor(orgB)];
    await incluir('fornecedores_dos_consumiveis', orgB, {
      consumivel_id: toner,
      fornecedor_id: hp,
    });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select 1 from fornecedores_dos_consumiveis where consumivel_id = $1', [toner]),
    );
    expect(rows).toEqual([]);
  });
});

describe('consumíveis dos modelos', () => {
  it('liga o consumível ao modelo da mesma organização, uma vez só', async () => {
    const [toner, m404] = [await consumivel(orgA), await modelo(orgA)];
    await incluir('consumiveis_dos_modelos', orgA, { consumivel_id: toner, modelo_id: m404 });
    expect(
      await recusada(
        incluir('consumiveis_dos_modelos', orgA, { consumivel_id: toner, modelo_id: m404 }),
      ),
    ).toBe('consumiveis_dos_modelos_unico');
    const deOutra = await modelo(orgB);
    expect(
      await recusada(
        incluir('consumiveis_dos_modelos', orgA, { consumivel_id: toner, modelo_id: deOutra }),
      ),
    ).toBe('consumiveis_dos_modelos_modelo_fk');
    const tonerDeOutra = await consumivel(orgB);
    expect(
      await recusada(
        incluir('consumiveis_dos_modelos', orgA, { consumivel_id: tonerDeOutra, modelo_id: m404 }),
      ),
    ).toBe('consumiveis_dos_modelos_consumivel_fk');
  });

  it('cada organização vê só as próprias ligações', async () => {
    const [toner, m404] = [await consumivel(orgB), await modelo(orgB)];
    await incluir('consumiveis_dos_modelos', orgB, { consumivel_id: toner, modelo_id: m404 });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select 1 from consumiveis_dos_modelos where modelo_id = $1', [m404]),
    );
    expect(rows).toEqual([]);
  });
});
