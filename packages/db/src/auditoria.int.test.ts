// Auditoria só de inclusão (spec auditoria): o papel da aplicação inclui e lê, e o banco recusa a
// alteração e a exclusão de um registro.
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

let dono: pg.Pool;
let app: pg.Pool;
let orgA = '';
let orgB = '';
let registroDeA = '';

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

function registrar(org: string, colunas: Record<string, unknown>) {
  const nomes = Object.keys(colunas);
  const marcadores = nomes.map((_, i) => `$${i + 2}`);
  return emTransacao(app, org, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `insert into auditoria (org_id, ${nomes.join(', ')}) values ($1, ${marcadores.join(', ')}) returning id`,
      [org, ...Object.values(colunas)],
    );
    return rows[0]?.id ?? '';
  });
}

beforeAll(async () => {
  dono = new pg.Pool({ connectionString: inject('urlDono') });
  app = new pg.Pool({ connectionString: inject('urlApp') });
  orgA = await criarOrganizacao('Organização A');
  orgB = await criarOrganizacao('Organização B');
  registroDeA = await registrar(orgA, {
    acao: 'entrada.recusada',
    ator_tipo: 'anonimo',
    alvo_tipo: 'conta',
    dados: JSON.stringify({ usuario: 'joao.silva', motivo: 'credenciais' }),
    ip: '10.0.0.7',
    codigo_de_rastreio: 'R7K2-9QXM',
  });
});

afterAll(async () => {
  await dono?.end();
  await app?.end();
});

describe('auditoria só de inclusão', () => {
  it('o papel da aplicação inclui e lê um registro', async () => {
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query(
        'select acao, ator_tipo, dados, ip, codigo_de_rastreio from auditoria where id = $1',
        [registroDeA],
      ),
    );
    expect(rows).toEqual([
      {
        acao: 'entrada.recusada',
        ator_tipo: 'anonimo',
        dados: { usuario: 'joao.silva', motivo: 'credenciais' },
        ip: '10.0.0.7',
        codigo_de_rastreio: 'R7K2-9QXM',
      },
    ]);
  });

  it('o banco recusa a alteração de um registro', async () => {
    await expect(
      emTransacao(app, orgA, (c) =>
        c.query("update auditoria set acao = 'entrada.concluida' where id = $1", [registroDeA]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('o banco recusa a exclusão de um registro', async () => {
    await expect(
      emTransacao(app, orgA, (c) => c.query('delete from auditoria where id = $1', [registroDeA])),
    ).rejects.toThrow(/permission denied/);
  });

  it('cada organização vê só os próprios registros', async () => {
    const { rows } = await emTransacao(app, orgB, (c) => c.query('select id from auditoria'));
    expect(rows).toEqual([]);
  });
});

describe('quem fez', () => {
  it('a ação feita por uma conta traz a conta, e a feita sem sessão não traz', async () => {
    await expect(
      registrar(orgA, { acao: 'senha.trocada', ator_tipo: 'conta', alvo_tipo: 'conta' }),
    ).rejects.toThrow(/check constraint/);
    await expect(
      registrar(orgA, {
        acao: 'entrada.recusada',
        ator_tipo: 'anonimo',
        ator_descricao: 'comando no servidor',
        alvo_tipo: 'conta',
      }),
    ).rejects.toThrow(/check constraint/);
  });

  it('a ação do comando no servidor diz qual comando', async () => {
    await expect(
      registrar(orgA, { acao: 'acesso.redefinido', ator_tipo: 'sistema', alvo_tipo: 'conta' }),
    ).rejects.toThrow(/check constraint/);
    expect(
      await registrar(orgA, {
        acao: 'acesso.redefinido',
        ator_tipo: 'sistema',
        ator_descricao: 'comando no servidor: conta redefinir',
        alvo_tipo: 'conta',
      }),
    ).not.toBe('');
  });

  it('recusa uma ação fora do formato "assunto.verbo"', async () => {
    await expect(
      registrar(orgA, { acao: 'Senha trocada', ator_tipo: 'anonimo', alvo_tipo: 'conta' }),
    ).rejects.toThrow(/check constraint/);
  });
});
