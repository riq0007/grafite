// Pessoas e contas (spec contas-de-acesso): toda conta pertence a uma pessoa da mesma organização,
// uma pessoa tem no máximo uma conta, e o usuário é único só dentro da organização.
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

function criarPessoa(org: string, nome: string, email: string | null = null): Promise<string> {
  return emTransacao(app, org, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      'insert into pessoas (org_id, nome, email) values ($1, $2, $3) returning id',
      [org, nome, email],
    );
    return rows[0]?.id ?? '';
  });
}

function criarConta(org: string, pessoa: string, usuario: string) {
  return emTransacao(app, org, (c) =>
    c.query(
      "insert into contas (org_id, pessoa_id, usuario, hash_senha) values ($1, $2, $3, 'hash')",
      [org, pessoa, usuario],
    ),
  );
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

describe('pessoas', () => {
  it('cada organização vê só as próprias pessoas', async () => {
    await criarPessoa(orgA, 'Ana Souza');
    await criarPessoa(orgB, 'Bruno Lima');
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query<{ nome: string }>('select nome from pessoas'),
    );
    expect(rows.map((r) => r.nome)).toEqual(['Ana Souza']);
  });

  it('a pessoa nasce ativa e pode não ter e-mail', async () => {
    const id = await criarPessoa(orgA, 'Carla Dias');
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select email, situacao from pessoas where id = $1', [id]),
    );
    expect(rows).toEqual([{ email: null, situacao: 'ativa' }]);
  });

  it('recusa o nome vazio e uma situação desconhecida', async () => {
    await expect(criarPessoa(orgA, '   ')).rejects.toThrow(/check constraint/);
    await expect(
      emTransacao(app, orgA, (c) =>
        c.query("insert into pessoas (org_id, nome, situacao) values ($1, 'Davi', 'apagada')", [
          orgA,
        ]),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('contas', () => {
  it('a conta nasce ativa, com a senha temporária e sem exigir os dois passos', async () => {
    const pessoa = await criarPessoa(orgA, 'Eva Rocha');
    await criarConta(orgA, pessoa, 'eva.rocha');
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query(
        "select situacao, senha_temporaria, exige_dois_passos from contas where usuario = 'eva.rocha'",
      ),
    );
    expect(rows).toEqual([{ situacao: 'ativa', senha_temporaria: true, exige_dois_passos: false }]);
  });

  it('o usuário é único na organização', async () => {
    await criarConta(orgA, await criarPessoa(orgA, 'João Silva'), 'joao.silva');
    await expect(
      criarConta(orgA, await criarPessoa(orgA, 'João Silva Neto'), 'joao.silva'),
    ).rejects.toThrow(/duplicate key/);
  });

  it('outra organização pode ter o mesmo usuário', async () => {
    const { rowCount } = await criarConta(
      orgB,
      await criarPessoa(orgB, 'João Silva'),
      'joao.silva',
    );
    expect(rowCount).toBe(1);
  });

  it('uma pessoa tem no máximo uma conta', async () => {
    const pessoa = await criarPessoa(orgA, 'Fábio Reis');
    await criarConta(orgA, pessoa, 'fabio.reis');
    await expect(criarConta(orgA, pessoa, 'fabio')).rejects.toThrow(/duplicate key/);
  });

  it('o banco recusa a conta ligada a uma pessoa de outra organização', async () => {
    const pessoaDeA = await criarPessoa(orgA, 'Gil Alves');
    await expect(criarConta(orgB, pessoaDeA, 'gil.alves')).rejects.toThrow(/foreign key/);
  });

  it('recusa o usuário fora da forma normalizada', async () => {
    const pessoa = await criarPessoa(orgA, 'Helena Prado');
    for (const errado of [
      'Helena.Prado',
      'he',
      'helena prado',
      'helêna',
      '.helena',
      'x'.repeat(65),
    ]) {
      await expect(criarConta(orgA, pessoa, errado), errado).rejects.toThrow(/check constraint/);
    }
  });
});
