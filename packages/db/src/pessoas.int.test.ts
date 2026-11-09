// A pessoa ampliada e a conta anonimizável (spec administracao-de-pessoas): a matrícula única na
// organização, o local de trabalho na mesma organização, a pessoa anonimizada sem dados e a conta
// anonimizada sem usuário nem senha, com o usuário livre para outra.
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

function inserir(org: string, sql: string, valores: unknown[]): Promise<string> {
  return emTransacao(app, org, async (c) => {
    const { rows } = await c.query<{ id: string }>(`${sql} returning id`, valores);
    return rows[0]?.id ?? '';
  });
}

const criarPessoa = (org: string, campos: Record<string, unknown> = {}) => {
  const dados = { nome: 'Pessoa', ...campos };
  const colunas = Object.keys(dados);
  return inserir(
    org,
    `insert into pessoas (org_id, ${colunas.join(', ')})
     values ($1, ${colunas.map((_, i) => `$${i + 2}`).join(', ')})`,
    [org, ...Object.values(dados)],
  );
};

const criarConta = (org: string, pessoa: string, campos: Record<string, unknown> = {}) => {
  const dados = {
    usuario: `u${Math.random().toString(36).slice(2, 10)}`,
    hash_senha: 'hash',
    ...campos,
  };
  const colunas = Object.keys(dados);
  return inserir(
    org,
    `insert into contas (org_id, pessoa_id, ${colunas.join(', ')})
     values ($1, $2, ${colunas.map((_, i) => `$${i + 3}`).join(', ')})`,
    [org, pessoa, ...Object.values(dados)],
  );
};

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

describe('pessoa ampliada', () => {
  it('guarda a matrícula, o local de trabalho e o telefone', async () => {
    const local = await inserir(
      orgA,
      "insert into locais (org_id, nome, nome_normalizado, tipo) values ($1, 'Expedição', 'expedicao', 'setor')",
      [orgA],
    );
    const id = await criarPessoa(orgA, {
      nome: 'João da Silva',
      matricula: '004512',
      local_id: local,
      telefone: '2040',
      busca: 'joao da silva 004512',
    });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select matricula, local_id, telefone, busca from pessoas where id = $1', [id]),
    );
    expect(rows[0]).toEqual({
      matricula: '004512',
      local_id: local,
      telefone: '2040',
      busca: 'joao da silva 004512',
    });
  });

  it('recusa a matrícula repetida na organização e aceita em outra', async () => {
    await criarPessoa(orgA, { matricula: '777' });
    await expect(criarPessoa(orgA, { matricula: '777' })).rejects.toThrow(
      /pessoas_matricula_unica/,
    );
    await criarPessoa(orgB, { matricula: '777' });
  });

  it('aceita muitas pessoas sem matrícula', async () => {
    await criarPessoa(orgA);
    await criarPessoa(orgA);
  });

  it('recusa o local de outra organização', async () => {
    const deB = await inserir(
      orgB,
      "insert into locais (org_id, nome, nome_normalizado, tipo) values ($1, 'Doca', 'doca', 'outro')",
      [orgB],
    );
    await expect(criarPessoa(orgA, { local_id: deB })).rejects.toThrow(/pessoas_local_fk/);
  });

  it('recusa a pessoa anonimizada com dados pessoais ou sem o momento', async () => {
    const agora = new Date().toISOString();
    await criarPessoa(orgA, { situacao: 'anonimizada', anonimizada_em: agora });
    await expect(
      criarPessoa(orgA, { situacao: 'anonimizada', anonimizada_em: agora, email: 'a@b.com' }),
    ).rejects.toThrow(/pessoas_anonimizada_sem_dados/);
    await expect(criarPessoa(orgA, { situacao: 'anonimizada' })).rejects.toThrow(
      /pessoas_anonimizada_sem_dados/,
    );
    await expect(criarPessoa(orgA, { anonimizada_em: agora })).rejects.toThrow(
      /pessoas_anonimizada_sem_dados/,
    );
  });
});

describe('conta anonimizável', () => {
  it('aceita a conta anonimizada sem usuário e sem senha, mais de uma na organização', async () => {
    await criarConta(orgA, await criarPessoa(orgA), {
      usuario: null,
      hash_senha: null,
      situacao: 'anonimizada',
    });
    await criarConta(orgA, await criarPessoa(orgA), {
      usuario: null,
      hash_senha: null,
      situacao: 'anonimizada',
    });
  });

  it('recusa a conta sem usuário ou sem senha fora da anonimização', async () => {
    await expect(criarConta(orgA, await criarPessoa(orgA), { usuario: null })).rejects.toThrow(
      /contas_anonimizada_sem_credenciais/,
    );
    await expect(criarConta(orgA, await criarPessoa(orgA), { hash_senha: null })).rejects.toThrow(
      /contas_anonimizada_sem_credenciais/,
    );
  });

  it('recusa a conta anonimizada que guarda usuário ou senha', async () => {
    await expect(
      criarConta(orgA, await criarPessoa(orgA), { hash_senha: null, situacao: 'anonimizada' }),
    ).rejects.toThrow(/contas_anonimizada_sem_credenciais/);
  });
});

describe('fim da sessão', () => {
  it.each(['conta-inativada', 'encerrada-pela-administracao', 'dois-passos-removidos'])(
    'aceita o motivo %s',
    async (motivo) => {
      const conta = await criarConta(orgA, await criarPessoa(orgA));
      await inserir(
        orgA,
        `insert into sessoes (org_id, conta_id, token_hash, token_csrf, expira_em, encerrada_em, motivo_do_fim)
         values ($1, $2, decode(md5(random()::text), 'hex'), 'csrf', now() + interval '1 hour', now(), $3)`,
        [orgA, conta, motivo],
      );
    },
  );
});
