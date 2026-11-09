// Os arquivos (spec arquivos-e-imagens; design do F2c, decisão 6): o registro de cada arquivo da
// organização, com o conteúdo no armazenamento, e a foto da pessoa apontando para um deles.
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

function criarArquivo(org: string, colunas: Record<string, unknown> = {}): Promise<string> {
  const todas = {
    org_id: org,
    tipo: 'image/webp',
    bytes: 1234,
    largura: 512,
    altura: 384,
    variantes: ['completa', '512', '256', '128', '64'],
    ...colunas,
  };
  const nomes = Object.keys(todas);
  return emTransacao(app, org, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `insert into arquivos (${nomes.join(', ')}) values (${nomes.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
      Object.values(todas),
    );
    return rows[0]?.id ?? '';
  });
}

function criarPessoa(org: string, nome: string): Promise<string> {
  return emTransacao(app, org, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      'insert into pessoas (org_id, nome) values ($1, $2) returning id',
      [org, nome],
    );
    return rows[0]?.id ?? '';
  });
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

describe('arquivos', () => {
  it('cada organização vê só os próprios arquivos', async () => {
    const deA = await criarArquivo(orgA);
    const deB = await criarArquivo(orgB);
    const { rows } = await emTransacao(app, orgA, (c) => c.query('select id from arquivos'));
    expect(rows.map((r) => r.id)).toContain(deA);
    expect(rows.map((r) => r.id)).not.toContain(deB);
  });

  it('o arquivo nasce enviado agora, sem remoção nem apagamento', async () => {
    const id = await criarArquivo(orgA);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query(
        'select enviado_em is not null as enviado, removido_em, apagado_em from arquivos where id = $1',
        [id],
      ),
    );
    expect(rows).toEqual([{ enviado: true, removido_em: null, apagado_em: null }]);
  });

  it('o arquivo enviado por uma conta de outra organização é recusado', async () => {
    const contaDeB = await emTransacao(app, orgB, async (c) => {
      const pessoa = await c.query<{ id: string }>(
        "insert into pessoas (org_id, nome) values ($1, 'Bruno Lima') returning id",
        [orgB],
      );
      const conta = await c.query<{ id: string }>(
        "insert into contas (org_id, pessoa_id, usuario, hash_senha) values ($1, $2, 'bruno.lima', 'hash') returning id",
        [orgB, pessoa.rows[0]?.id],
      );
      return conta.rows[0]?.id ?? '';
    });
    await expect(criarArquivo(orgA, { enviado_por: contaDeB })).rejects.toThrow(/foreign key/);
  });

  it('só apaga o que foi removido', async () => {
    await expect(criarArquivo(orgA, { apagado_em: new Date() })).rejects.toThrow(
      /check constraint/,
    );
    const removido = new Date();
    expect(await criarArquivo(orgA, { removido_em: removido, apagado_em: removido })).not.toBe('');
  });

  it('as dimensões vêm juntas e positivas', async () => {
    await expect(criarArquivo(orgA, { largura: 0 })).rejects.toThrow(/check constraint/);
    await expect(criarArquivo(orgA, { altura: null })).rejects.toThrow(/check constraint/);
    expect(await criarArquivo(orgA, { largura: null, altura: null })).not.toBe('');
  });

  it('o tamanho não é negativo', async () => {
    await expect(criarArquivo(orgA, { bytes: -1 })).rejects.toThrow(/check constraint/);
  });

  it('o nome original, dos arquivos dos campos, é opcional e tem de 1 a 200 caracteres', async () => {
    const semNome = await criarArquivo(orgA);
    const comNome = await criarArquivo(orgA, { nome: 'Laudo técnico.pdf' });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select id, nome from arquivos where id = any($1)', [[semNome, comNome]]),
    );
    expect(Object.fromEntries(rows.map((r) => [r.id, r.nome]))).toEqual({
      [semNome]: null,
      [comNome]: 'Laudo técnico.pdf',
    });
    await expect(criarArquivo(orgA, { nome: '' })).rejects.toThrow(/check constraint/);
    await expect(criarArquivo(orgA, { nome: `${'a'.repeat(197)}.pdf` })).rejects.toThrow(
      /check constraint/,
    );
  });
});

describe('foto da pessoa', () => {
  it('a pessoa aponta para um arquivo da própria organização', async () => {
    const pessoa = await criarPessoa(orgA, 'Ana Souza');
    const foto = await criarArquivo(orgA);
    await emTransacao(app, orgA, (c) =>
      c.query('update pessoas set foto_id = $1 where id = $2', [foto, pessoa]),
    );
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select foto_id from pessoas where id = $1', [pessoa]),
    );
    expect(rows).toEqual([{ foto_id: foto }]);
  });

  it('o banco recusa a foto de outra organização', async () => {
    const pessoa = await criarPessoa(orgA, 'Carla Dias');
    const fotoDeB = await criarArquivo(orgB);
    await expect(
      emTransacao(app, orgA, (c) =>
        c.query('update pessoas set foto_id = $1 where id = $2', [fotoDeB, pessoa]),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it('a pessoa anonimizada não tem foto', async () => {
    const pessoa = await criarPessoa(orgA, 'João da Silva');
    const foto = await criarArquivo(orgA);
    await expect(
      emTransacao(app, orgA, (c) =>
        c.query(
          "update pessoas set foto_id = $1, situacao = 'anonimizada', anonimizada_em = now(), nome = 'Pessoa anonimizada 7F3K' where id = $2",
          [foto, pessoa],
        ),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
