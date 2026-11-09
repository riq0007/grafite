// A coleta (spec coletor-local e leituras-e-estado; design do P2a, decisão 3, e do P2b, decisão 2):
// os coletores, os lotes recebidos, as leituras e o estado atual, com o item e os detalhes, e os
// agregados por hora, isolados pela organização, com as referências da mesma organização, e a
// configuração das capacidades no tipo de ativo.
import { createHash } from 'node:crypto';
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
const hash = (texto: string) => createHash('sha256').update(texto).digest();

const tipo = (org: string, colunas: Record<string, unknown> = {}) => {
  const nome = unico('Tipo');
  return incluir('tipos_de_ativo', org, {
    nome,
    nome_normalizado: nome.toLowerCase(),
    icone: 'impressora',
    ...colunas,
  });
};

const ativo = async (org: string) =>
  incluir('ativos', org, { tipo_id: await tipo(org), busca: unico('ativo') });

const coletor = (org: string, colunas: Record<string, unknown> = {}) => {
  const nome = unico('Coletor');
  return incluir('coletores', org, {
    nome,
    nome_normalizado: nome.toLowerCase(),
    token_hash: hash(nome),
    ...colunas,
  });
};

const leitura = async (org: string, colunas: Record<string, unknown> = {}) =>
  incluir('leituras', org, {
    ativo_id: await ativo(org),
    coletor_id: await coletor(org),
    metrica: 'rede.disponibilidade',
    momento: new Date('2026-10-12T10:00:00.000Z'),
    valor_texto: 'online',
    situacao: 'valida',
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

describe('coletores', () => {
  it('cada organização vê só os próprios coletores', async () => {
    const deA = await coletor(orgA);
    const deB = await coletor(orgB);
    const { rows } = await emTransacao(app, orgA, (c) => c.query('select id from coletores'));
    expect(rows.map((r) => r.id)).toContain(deA);
    expect(rows.map((r) => r.id)).not.toContain(deB);
  });

  it('nasce ativo, sem faixas, sem contato e com o momento do cadastro', async () => {
    const id = await coletor(orgA);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query(
        `select situacao, faixas, ultimo_contato_em, versao, criado_em is not null as criado
           from coletores where id = $1`,
        [id],
      ),
    );
    expect(rows).toEqual([
      { situacao: 'ativo', faixas: [], ultimo_contato_em: null, versao: null, criado: true },
    ]);
  });

  it('o nome e o token não se repetem na organização', async () => {
    await coletor(orgA, { nome: 'Coletor de Jundiaí', nome_normalizado: 'coletor de jundiai' });
    await expect(
      coletor(orgA, { nome: 'COLETOR DE JUNDIAI', nome_normalizado: 'coletor de jundiai' }),
    ).rejects.toThrow(/unique/);
    await coletor(orgA, { token_hash: hash('token repetido') });
    await expect(coletor(orgA, { token_hash: hash('token repetido') })).rejects.toThrow(/unique/);
  });

  it('confere a situação, o nome, as faixas e a versão', async () => {
    await expect(coletor(orgA, { situacao: 'pausado' })).rejects.toThrow(/check constraint/);
    await expect(coletor(orgA, { nome: '', nome_normalizado: '' })).rejects.toThrow(
      /check constraint/,
    );
    const muitas = Array.from({ length: 51 }, (_, i) => `10.0.${i}.0/24`);
    await expect(coletor(orgA, { faixas: muitas })).rejects.toThrow(/check constraint/);
    await expect(coletor(orgA, { versao: '' })).rejects.toThrow(/check constraint/);
  });

  it('o banco recusa a conta de outra organização como quem criou', async () => {
    const pessoa = await incluir('pessoas', orgB, { nome: unico('Pessoa') });
    const contaDeB = await incluir('contas', orgB, {
      pessoa_id: pessoa,
      usuario: unico('conta').replace(' ', '.'),
      hash_senha: 'hash',
    });
    await expect(coletor(orgA, { criado_por: contaDeB })).rejects.toThrow(/foreign key/);
  });
});

describe('lotes recebidos', () => {
  const lote = async (org: string, colunas: Record<string, unknown> = {}) =>
    incluir('lotes_da_coleta', org, {
      coletor_id: await coletor(org),
      chave: (await dono.query<{ id: string }>('select uuidv7() as id')).rows[0]?.id,
      gravadas: 2,
      ignoradas: 0,
      ...colunas,
    });

  it('a chave do lote entra uma vez só na organização', async () => {
    const chave = (await dono.query<{ id: string }>('select uuidv7() as id')).rows[0]?.id;
    await lote(orgA, { chave });
    await expect(lote(orgA, { chave })).rejects.toThrow(/unique/);
    expect(await lote(orgB, { chave })).not.toBe('');
  });

  it('confere as contagens e o coletor da mesma organização', async () => {
    await expect(lote(orgA, { gravadas: -1 })).rejects.toThrow(/check constraint/);
    await expect(lote(orgA, { gravadas: 0, ignoradas: 0 })).rejects.toThrow(/check constraint/);
    await expect(lote(orgA, { gravadas: 900, ignoradas: 101 })).rejects.toThrow(/check constraint/);
    await expect(lote(orgA, { coletor_id: await coletor(orgB) })).rejects.toThrow(/foreign key/);
  });
});

describe('leituras', () => {
  it('cada organização vê só as próprias leituras', async () => {
    const deA = await leitura(orgA);
    const deB = await leitura(orgB);
    const { rows } = await emTransacao(app, orgA, (c) => c.query('select id from leituras'));
    expect(rows.map((r) => r.id)).toContain(deA);
    expect(rows.map((r) => r.id)).not.toContain(deB);
  });

  it('guarda o número, o texto e a situação, e a leitura sem dado fica sem valor', async () => {
    const id = await leitura(orgA, {
      metrica: 'rede.latencia',
      valor_texto: null,
      valor_numero: 3.5,
    });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select valor_numero, valor_texto, situacao from leituras where id = $1', [id]),
    );
    expect(rows).toEqual([{ valor_numero: 3.5, valor_texto: null, situacao: 'valida' }]);
    await expect(leitura(orgA, { situacao: 'sem-dado' })).rejects.toThrow(/check constraint/);
    expect(await leitura(orgA, { situacao: 'sem-dado', valor_texto: null })).not.toBe('');
    await expect(leitura(orgA, { situacao: 'estranha' })).rejects.toThrow(/check constraint/);
    await expect(leitura(orgA, { metrica: '' })).rejects.toThrow(/check constraint/);
  });

  it('o banco recusa o ativo e o coletor de outra organização', async () => {
    await expect(leitura(orgA, { ativo_id: await ativo(orgB) })).rejects.toThrow(/foreign key/);
    await expect(leitura(orgA, { coletor_id: await coletor(orgB) })).rejects.toThrow(/foreign key/);
  });

  it('a leitura do ping nasce com o item vazio e sem detalhes', async () => {
    const id = await leitura(orgA);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select item, detalhes from leituras where id = $1', [id]),
    );
    expect(rows).toEqual([{ item: '', detalhes: null }]);
  });

  it('guarda o item e os detalhes de um suprimento, e confere a forma deles', async () => {
    const detalhes = { descricao: 'Black Toner Cartridge', capacidade: 1000, nivel: 80 };
    const id = await leitura(orgA, {
      metrica: 'impressora.suprimento',
      item: '1',
      valor_texto: null,
      valor_numero: 8,
      detalhes: JSON.stringify(detalhes),
    });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select item, detalhes, valor_numero from leituras where id = $1', [id]),
    );
    expect(rows).toEqual([{ item: '1', detalhes, valor_numero: 8 }]);
    await expect(leitura(orgA, { item: 'x'.repeat(21) })).rejects.toThrow(/check constraint/);
    await expect(leitura(orgA, { detalhes: JSON.stringify(['lista']) })).rejects.toThrow(
      /check constraint/,
    );
    await expect(
      leitura(orgA, { detalhes: JSON.stringify({ descricao: 'x'.repeat(2100) }) }),
    ).rejects.toThrow(/check constraint/);
  });

  it('tem o índice da série de cada ativo e item e o BRIN do momento, para a retenção', async () => {
    const { rows } = await dono.query<{ indexname: string; indexdef: string }>(
      "select indexname, indexdef from pg_indexes where tablename = 'leituras' order by indexname",
    );
    const definicao = (nome: string) => rows.find((r) => r.indexname === nome)?.indexdef;
    expect(definicao('leituras_do_ativo_idx')).toMatch(
      /\(org_id, ativo_id, metrica, item, momento DESC NULLS LAST\)$/,
    );
    expect(definicao('leituras_momento_idx')).toMatch(/USING brin \(momento\)$/);
  });
});

describe('estado dos ativos', () => {
  const estado = async (org: string, ativoId: string, colunas: Record<string, unknown> = {}) =>
    incluir('estado_dos_ativos', org, {
      ativo_id: ativoId,
      coletor_id: await coletor(org),
      metrica: 'rede.disponibilidade',
      momento: new Date('2026-10-12T10:00:00.000Z'),
      desde: new Date('2026-10-12T09:00:00.000Z'),
      valor_texto: 'offline',
      situacao: 'valida',
      ...colunas,
    });

  it('guarda um estado por ativo, métrica e item, isolado pela organização', async () => {
    const doA = await ativo(orgA);
    await estado(orgA, doA);
    await expect(estado(orgA, doA)).rejects.toThrow(/unique/);
    expect(await estado(orgA, doA, { metrica: 'rede.latencia', valor_texto: null })).not.toBe('');
    // Cada suprimento da impressora tem o estado dele.
    const suprimento = { metrica: 'impressora.suprimento', valor_texto: null, valor_numero: 8 };
    expect(await estado(orgA, doA, { ...suprimento, item: '1' })).not.toBe('');
    expect(await estado(orgA, doA, { ...suprimento, item: '2' })).not.toBe('');
    await expect(estado(orgA, doA, { ...suprimento, item: '1' })).rejects.toThrow(/unique/);
    const doB = await ativo(orgB);
    await estado(orgB, doB);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select ativo_id from estado_dos_ativos'),
    );
    expect(rows.map((r) => r.ativo_id)).toContain(doA);
    expect(rows.map((r) => r.ativo_id)).not.toContain(doB);
  });

  it('o banco recusa o ativo de outra organização e a leitura sem dado com valor', async () => {
    await expect(estado(orgA, await ativo(orgB))).rejects.toThrow(/foreign key/);
    await expect(estado(orgA, await ativo(orgA), { situacao: 'sem-dado' })).rejects.toThrow(
      /check constraint/,
    );
  });
});

describe('configuração das capacidades no tipo', () => {
  it('nasce vazia e só aceita um objeto', async () => {
    const id = await tipo(orgA);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select configuracao_das_capacidades from tipos_de_ativo where id = $1', [id]),
    );
    expect(rows).toEqual([{ configuracao_das_capacidades: {} }]);
    await expect(
      tipo(orgA, { configuracao_das_capacidades: JSON.stringify(['rede.disponibilidade']) }),
    ).rejects.toThrow(/check constraint/);
  });
});

// Os agregados por hora (spec leituras-e-estado, "Agregados por hora"; change p2b-impressoras-por-snmp,
// design, decisão 2): um por ativo, métrica, item e hora, isolados pela organização.
describe('agregados por hora', () => {
  const agregado = async (org: string, ativoId: string, colunas: Record<string, unknown> = {}) =>
    incluir('leituras_por_hora', org, {
      ativo_id: ativoId,
      metrica: 'impressora.contador',
      item: '1',
      hora: new Date('2026-10-12T10:00:00.000Z'),
      leituras: 6,
      validas: 6,
      minimo: 12400,
      maximo: 12500,
      media: 12450,
      ultimo: 12500,
      ultimo_momento: new Date('2026-10-12T10:50:00.000Z'),
      ...colunas,
    });

  it('guarda um agregado por ativo, métrica, item e hora, isolado pela organização', async () => {
    const doA = await ativo(orgA);
    await agregado(orgA, doA);
    await expect(agregado(orgA, doA)).rejects.toThrow(/unique/);
    expect(await agregado(orgA, doA, { item: '2' })).not.toBe('');
    expect(await agregado(orgA, doA, { hora: new Date('2026-10-12T11:00:00.000Z') })).not.toBe('');
    const doB = await ativo(orgB);
    await agregado(orgB, doB);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select ativo_id from leituras_por_hora'),
    );
    expect(rows.map((r) => r.ativo_id)).toContain(doA);
    expect(rows.map((r) => r.ativo_id)).not.toContain(doB);
  });

  it('a hora sem leitura válida fica sem os valores, nunca com zero', async () => {
    const id = await agregado(orgA, await ativo(orgA), {
      metrica: 'rede.latencia',
      item: '',
      validas: 0,
      minimo: null,
      maximo: null,
      media: null,
      ultimo: null,
      ultimo_momento: null,
    });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select validas, minimo, ultimo from leituras_por_hora where id = $1', [id]),
    );
    expect(rows).toEqual([{ validas: 0, minimo: null, ultimo: null }]);
    await expect(
      agregado(orgA, await ativo(orgA), { validas: 0, minimo: 1, maximo: 1, media: 1 }),
    ).rejects.toThrow(/check constraint/);
  });

  it('confere as contagens, a hora cheia e o ativo da mesma organização', async () => {
    const doA = await ativo(orgA);
    await expect(agregado(orgA, doA, { leituras: 0, validas: 0 })).rejects.toThrow(
      /check constraint/,
    );
    await expect(agregado(orgA, doA, { validas: 7 })).rejects.toThrow(/check constraint/);
    await expect(
      agregado(orgA, doA, { hora: new Date('2026-10-12T10:30:00.000Z') }),
    ).rejects.toThrow(/check constraint/);
    await expect(agregado(orgA, await ativo(orgB))).rejects.toThrow(/foreign key/);
  });
});
