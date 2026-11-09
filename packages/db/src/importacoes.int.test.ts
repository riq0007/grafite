// As importações de ativos (spec importacao-de-ativos; design do P1e, decisões 1, 3 e 7): isoladas
// pela organização, com a conta e o tipo da mesma organização, a situação conferida pelo banco, o
// conteúdo da planilha só até a importação terminar e as linhas com erro, uma por linha.
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

const tipo = (org: string) => {
  const nome = unico('Tipo');
  return incluir('tipos_de_ativo', org, {
    nome,
    nome_normalizado: nome.toLowerCase(),
    icone: 'generico',
  });
};

async function conta(org: string): Promise<string> {
  const pessoa = await incluir('pessoas', org, { nome: unico('Pessoa') });
  return incluir('contas', org, {
    pessoa_id: pessoa,
    usuario: unico('conta').replace(' ', '.'),
    hash_senha: 'hash',
  });
}

const json = (valor: unknown) => JSON.stringify(valor);

/** Uma importação em rascunho, de uma conta e de um tipo novos da organização. */
async function importacao(org: string, colunas: Record<string, unknown> = {}) {
  return incluir('importacoes', org, {
    criada_por: await conta(org),
    tipo_id: await tipo(org),
    nome_do_arquivo: 'computadores.xlsx',
    colunas: json(['Patrimônio', 'Local']),
    conteudo: json([
      { linha: 2, celulas: ['PAT-1', 'Jundiaí'] },
      { linha: 3, celulas: ['PAT-2', 'Campinas'] },
    ]),
    linhas: 2,
    mapeamento: json(['ativo.patrimonio', null]),
    ...colunas,
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

describe('importações', () => {
  it('cada organização vê só as próprias importações', async () => {
    const deA = await importacao(orgA);
    const deB = await importacao(orgB);
    const { rows } = await emTransacao(app, orgA, (c) => c.query('select id from importacoes'));
    expect(rows.map((r) => r.id)).toContain(deA);
    expect(rows.map((r) => r.id)).not.toContain(deB);
  });

  it('nasce em rascunho, sem linhas processadas e com os totais zerados', async () => {
    const id = await importacao(orgA);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query(
        `select situacao, processadas, totais, criada_em is not null as criada,
                aplicada_em, concluida_em
           from importacoes where id = $1`,
        [id],
      ),
    );
    expect(rows).toEqual([
      {
        situacao: 'rascunho',
        processadas: 0,
        totais: { novos: 0, alterados: 0, semMudanca: 0, comErro: 0 },
        criada: true,
        aplicada_em: null,
        concluida_em: null,
      },
    ]);
  });

  it('recusa a situação desconhecida', async () => {
    await expect(importacao(orgA, { situacao: 'pausada' })).rejects.toThrow(/check constraint/);
  });

  it('a concluída e a descartada não guardam o conteúdo da planilha', async () => {
    await expect(importacao(orgA, { situacao: 'concluida' })).rejects.toThrow(/check constraint/);
    await expect(importacao(orgA, { situacao: 'descartada' })).rejects.toThrow(/check constraint/);
    expect(await importacao(orgA, { situacao: 'concluida', conteudo: null })).not.toBe('');
  });

  it('confere as linhas, as processadas e a forma dos JSON', async () => {
    await expect(importacao(orgA, { linhas: 5001 })).rejects.toThrow(/check constraint/);
    await expect(importacao(orgA, { linhas: 0 })).rejects.toThrow(/check constraint/);
    await expect(importacao(orgA, { processadas: 3 })).rejects.toThrow(/check constraint/);
    await expect(importacao(orgA, { colunas: json({ a: 1 }) })).rejects.toThrow(/check constraint/);
    await expect(importacao(orgA, { mapeamento: json('x') })).rejects.toThrow(/check constraint/);
    await expect(importacao(orgA, { totais: json([]) })).rejects.toThrow(/check constraint/);
    await expect(importacao(orgA, { nome_do_arquivo: '' })).rejects.toThrow(/check constraint/);
  });

  it('o banco recusa a conta e o tipo de outra organização', async () => {
    await expect(importacao(orgA, { criada_por: await conta(orgB) })).rejects.toThrow(
      /foreign key/,
    );
    await expect(importacao(orgA, { tipo_id: await tipo(orgB) })).rejects.toThrow(/foreign key/);
  });

  it('a lista de cada conta tem o índice pela conta e pela data, da mais nova para a mais antiga', async () => {
    const { rows } = await dono.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where tablename = 'importacoes' and indexname = 'importacoes_da_conta_idx'",
    );
    expect(rows.map((r) => r.indexdef)).toEqual([
      expect.stringMatching(
        /\(org_id, criada_por, criada_em DESC NULLS LAST, id DESC NULLS LAST\)$/,
      ),
    ]);
  });
});

describe('linhas com erro', () => {
  const erro = (org: string, importacaoId: string, linha: number, mensagens: unknown = []) =>
    incluir('erros_da_importacao', org, {
      importacao_id: importacaoId,
      linha,
      mensagens: json(mensagens),
    });

  it('cada organização vê só as próprias linhas com erro, e cada linha entra uma vez', async () => {
    const deA = await importacao(orgA);
    const deB = await importacao(orgB);
    const daA = await erro(orgA, deA, 2, [{ campo: 'IP', mensagem: 'Use um IP.' }]);
    await erro(orgB, deB, 2);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select id, linha, mensagens from erros_da_importacao'),
    );
    expect(rows).toEqual([
      { id: daA, linha: 2, mensagens: [{ campo: 'IP', mensagem: 'Use um IP.' }] },
    ]);
    await expect(erro(orgA, deA, 2)).rejects.toThrow(/unique/);
  });

  it('o banco recusa a importação de outra organização e as mensagens fora de uma lista', async () => {
    await expect(erro(orgA, await importacao(orgB), 2)).rejects.toThrow(/foreign key/);
    await expect(erro(orgA, await importacao(orgA), 3, { campo: null })).rejects.toThrow(
      /check constraint/,
    );
  });
});
