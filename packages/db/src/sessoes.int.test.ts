// Sessões, tentativas de entrada, verificação em dois passos e códigos de recuperação
// (specs entrada-e-sessoes e verificacao-em-dois-passos): isoladas por organização e ligadas à
// conta da mesma organização pela chave composta.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

let dono: pg.Pool;
let app: pg.Pool;
let orgA = '';
let orgB = '';
let contaDeA = '';
let contaDeB = '';

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

function criarConta(org: string, usuario: string): Promise<string> {
  return emTransacao(app, org, async (c) => {
    const pessoa = await c.query<{ id: string }>(
      'insert into pessoas (org_id, nome) values ($1, $2) returning id',
      [org, usuario],
    );
    const conta = await c.query<{ id: string }>(
      "insert into contas (org_id, pessoa_id, usuario, hash_senha) values ($1, $2, $3, 'hash') returning id",
      [org, pessoa.rows[0]?.id, usuario],
    );
    return conta.rows[0]?.id ?? '';
  });
}

function criarSessao(org: string, conta: string, tokenHash = randomBytes(32)) {
  return emTransacao(app, org, (c) =>
    c.query(
      `insert into sessoes (org_id, conta_id, token_hash, token_csrf, expira_em)
       values ($1, $2, $3, 'csrf', now() + interval '10 minutes')`,
      [org, conta, tokenHash],
    ),
  );
}

function criarDoisPassos(org: string, conta: string) {
  return emTransacao(app, org, (c) =>
    c.query('insert into dois_passos (org_id, conta_id, segredo_cifrado) values ($1, $2, $3)', [
      org,
      conta,
      randomBytes(48),
    ]),
  );
}

function criarCodigo(org: string, conta: string) {
  return emTransacao(app, org, (c) =>
    c.query('insert into codigos_de_recuperacao (org_id, conta_id, hash) values ($1, $2, $3)', [
      org,
      conta,
      randomBytes(32),
    ]),
  );
}

function registrarTentativa(org: string, usuario: string) {
  return emTransacao(app, org, (c) =>
    c.query(
      'insert into tentativas_de_entrada (org_id, usuario, falhas_seguidas) values ($1, $2, 1)',
      [org, usuario],
    ),
  );
}

beforeAll(async () => {
  dono = new pg.Pool({ connectionString: inject('urlDono') });
  app = new pg.Pool({ connectionString: inject('urlApp') });
  orgA = await criarOrganizacao('Organização A');
  orgB = await criarOrganizacao('Organização B');
  contaDeA = await criarConta(orgA, 'ana.souza');
  contaDeB = await criarConta(orgB, 'bruno.lima');
});

afterAll(async () => {
  await dono?.end();
  await app?.end();
});

describe('isolamento', () => {
  it('cada organização vê só as próprias linhas das quatro tabelas', async () => {
    await criarSessao(orgB, contaDeB);
    await criarDoisPassos(orgB, contaDeB);
    await criarCodigo(orgB, contaDeB);
    await registrarTentativa(orgB, 'bruno.lima');
    const contagens = await emTransacao(app, orgA, async (c) => {
      const tabelas = ['sessoes', 'dois_passos', 'codigos_de_recuperacao', 'tentativas_de_entrada'];
      const resultado: Record<string, number> = {};
      for (const tabela of tabelas) {
        const { rows } = await c.query<{ n: number }>(`select count(*)::int as n from ${tabela}`);
        resultado[tabela] = rows[0]?.n ?? -1;
      }
      return resultado;
    });
    expect(contagens).toEqual({
      sessoes: 0,
      dois_passos: 0,
      codigos_de_recuperacao: 0,
      tentativas_de_entrada: 0,
    });
  });
});

describe('sessões', () => {
  it('a sessão nasce sem uso de código, sem segundo passo e sem fim', async () => {
    const hash = randomBytes(32);
    await criarSessao(orgA, contaDeA, hash);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query(
        `select tentativas_de_codigo, ativada_em, segundo_passo_em, encerrada_em, motivo_do_fim
           from sessoes where token_hash = $1`,
        [hash],
      ),
    );
    expect(rows).toEqual([
      {
        tentativas_de_codigo: 0,
        ativada_em: null,
        segundo_passo_em: null,
        encerrada_em: null,
        motivo_do_fim: null,
      },
    ]);
  });

  it('o hash do token é único', async () => {
    const hash = randomBytes(32);
    await criarSessao(orgA, contaDeA, hash);
    await expect(criarSessao(orgA, contaDeA, hash)).rejects.toThrow(/duplicate key/);
  });

  it('o banco recusa a sessão ligada a uma conta de outra organização', async () => {
    await expect(criarSessao(orgB, contaDeA)).rejects.toThrow(/foreign key/);
  });

  it('o fim da sessão tem sempre um motivo conhecido', async () => {
    const encerrar = (motivo: string | null) =>
      emTransacao(app, orgA, async (c) => {
        const hash = randomBytes(32);
        await c.query(
          `insert into sessoes (org_id, conta_id, token_hash, token_csrf, expira_em)
           values ($1, $2, $3, 'csrf', now())`,
          [orgA, contaDeA, hash],
        );
        return c.query(
          'update sessoes set encerrada_em = now(), motivo_do_fim = $1 where token_hash = $2',
          [motivo, hash],
        );
      });
    expect((await encerrar('saida')).rowCount).toBe(1);
    await expect(encerrar(null)).rejects.toThrow(/check constraint/);
    await expect(encerrar('apagada')).rejects.toThrow(/check constraint/);
  });
});

describe('verificação em dois passos e códigos de recuperação', () => {
  it('uma conta tem no máximo uma linha de dois passos', async () => {
    const conta = await criarConta(orgA, 'carla.dias');
    await criarDoisPassos(orgA, conta);
    await expect(criarDoisPassos(orgA, conta)).rejects.toThrow(/duplicate key/);
  });

  it('o banco recusa os dois passos e o código ligados a uma conta de outra organização', async () => {
    await expect(criarDoisPassos(orgB, contaDeA)).rejects.toThrow(/foreign key/);
    await expect(criarCodigo(orgB, contaDeA)).rejects.toThrow(/foreign key/);
  });
});

describe('tentativas de entrada', () => {
  it('um usuário digitado tem uma linha só por organização, mesmo sem conta', async () => {
    await registrarTentativa(orgA, 'nao.existe');
    await expect(registrarTentativa(orgA, 'nao.existe')).rejects.toThrow(/duplicate key/);
    expect((await registrarTentativa(orgB, 'nao.existe')).rowCount).toBe(1);
  });
});
