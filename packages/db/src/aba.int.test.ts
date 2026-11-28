// As tabelas da aba dos colaboradores (change aba-dos-colaboradores, design, decisões 3, 5 e 8):
// isoladas por organização, uma chave e uma configuração por organização, o computador único na
// organização, uma sessão aberta por conta e aparelho e o alcance da sessão comum preso à sessão
// da aba.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

let dono: pg.Pool;
let app: pg.Pool;
let orgA = '';
let orgB = '';
let contaDeA = '';
let contaDeB = '';
let outraContaDeA = '';

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

let curtos = 0;
/** Um identificador curto do Crockford diferente a cada chamada. */
function curto(): string {
  curtos += 1;
  return `AB${String(curtos).padStart(4, '0')}`;
}

function criarAparelho(org: string, maquina: string, nome = 'PC-FIN-09'): Promise<string> {
  return emTransacao(app, org, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `insert into aparelhos_da_aba (org_id, identificador_da_maquina, identificador_curto, nome, token_hash)
       values ($1, $2, $3, $4, $5) returning id`,
      [org, maquina, curto(), nome, randomBytes(32)],
    );
    return rows[0]?.id ?? '';
  });
}

function criarSessaoDaAba(org: string, conta: string, aparelho: string): Promise<string> {
  return emTransacao(app, org, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `insert into sessoes_da_aba (org_id, conta_id, aparelho_id, entrada, token_hash, expira_em)
       values ($1, $2, $3, 'windows', $4, now() + interval '1 hour') returning id`,
      [org, conta, aparelho, randomBytes(32)],
    );
    return rows[0]?.id ?? '';
  });
}

/** O código do erro do PostgreSQL que a operação levanta, ou `null`. */
async function codigoDoErro(operacao: Promise<unknown>): Promise<string | null> {
  try {
    await operacao;
    return null;
  } catch (erro) {
    return (erro as { code?: string }).code ?? 'sem-codigo';
  }
}

beforeAll(async () => {
  dono = new pg.Pool({ connectionString: inject('urlDono') });
  app = new pg.Pool({ connectionString: inject('urlApp') });
  orgA = await criarOrganizacao('Organização A');
  orgB = await criarOrganizacao('Organização B');
  contaDeA = await criarConta(orgA, 'fernanda.lima');
  contaDeB = await criarConta(orgB, 'paulo.nunes');
  outraContaDeA = await criarConta(orgA, 'bruno.alves');
});

afterAll(async () => {
  await dono?.end();
  await app?.end();
});

describe('isolamento', () => {
  it('uma organização não vê a chave, a configuração, o aparelho, a sessão nem o bilhete da outra', async () => {
    const aparelho = await criarAparelho(orgB, 'maquina-de-b');
    const sessao = await criarSessaoDaAba(orgB, contaDeB, aparelho);
    await emTransacao(app, orgB, async (c) => {
      await c.query('insert into chaves_da_aba (org_id, hash) values ($1, $2)', [
        orgB,
        randomBytes(32),
      ]);
      await c.query('insert into configuracoes_da_aba (org_id) values ($1)', [orgB]);
      await c.query(
        `insert into bilhetes_da_aba (org_id, hash, sessao_da_aba_id, destino, expira_em)
         values ($1, $2, $3, 'chat', now() + interval '60 seconds')`,
        [orgB, randomBytes(32), sessao],
      );
    });
    // As aberturas dos chamados pedem um chamado; o RLS delas fica com o teste-guarda.
    const tabelas = [
      'chaves_da_aba',
      'configuracoes_da_aba',
      'aparelhos_da_aba',
      'sessoes_da_aba',
      'bilhetes_da_aba',
    ];
    const contar = (vista: string) =>
      emTransacao(app, vista, async (c) => {
        const resultado: number[] = [];
        for (const tabela of tabelas) {
          const { rows } = await c.query<{ n: number }>(
            `select count(*)::int as n from ${tabela} where org_id = $1`,
            [orgB],
          );
          resultado.push(rows[0]?.n ?? -1);
        }
        return resultado;
      });
    expect((await contar(orgB)).every((n) => n > 0)).toBe(true);
    expect(await contar(orgA)).toEqual([0, 0, 0, 0, 0]);
  });

  it('o aparelho de outra organização não serve à sessão da aba', async () => {
    const deB = await criarAparelho(orgB, 'outra-maquina-de-b');
    expect(await codigoDoErro(criarSessaoDaAba(orgA, contaDeA, deB))).toBe('23503');
  });
});

describe('chave e configuração', () => {
  it('a organização tem uma chave só, trocada na mesma linha', async () => {
    const org = await criarOrganizacao('Organização da chave');
    await emTransacao(app, org, (c) =>
      c.query('insert into chaves_da_aba (org_id, hash) values ($1, $2)', [org, randomBytes(32)]),
    );
    const segunda = emTransacao(app, org, (c) =>
      c.query('insert into chaves_da_aba (org_id, hash) values ($1, $2)', [org, randomBytes(32)]),
    );
    expect(await codigoDoErro(segunda)).toBe('23505');
    const trocada = await emTransacao(app, org, (c) =>
      c.query('update chaves_da_aba set hash = $1, trocada_em = now()', [randomBytes(32)]),
    );
    expect(trocada.rowCount).toBe(1);
  });

  it('a configuração nasce com a pílula e a versão 1, e recusa o contato vazio e o longo', async () => {
    const org = await criarOrganizacao('Organização da configuração');
    const { rows } = await emTransacao(app, org, (c) =>
      c.query<{ forma: string; versao: number }>(
        'insert into configuracoes_da_aba (org_id) values ($1) returning forma, versao',
        [org],
      ),
    );
    expect(rows[0]).toEqual({ forma: 'pilula', versao: 1 });
    for (const contato of ['  ', 'x'.repeat(81)]) {
      const erro = await codigoDoErro(
        emTransacao(app, org, (c) =>
          c.query('update configuracoes_da_aba set contato = $1', [contato]),
        ),
      );
      expect(erro).toBe('23514');
    }
  });
});

describe('aparelhos', () => {
  it('o mesmo computador não se repete na organização, e pode existir em outra', async () => {
    await criarAparelho(orgA, 'maquina-repetida');
    expect(await codigoDoErro(criarAparelho(orgA, 'maquina-repetida'))).toBe('23505');
    expect(await codigoDoErro(criarAparelho(orgB, 'maquina-repetida'))).toBeNull();
  });

  it('o mesmo nome em dois computadores entra, como o computador reinstalado', async () => {
    await criarAparelho(orgA, 'maquina-antiga', 'PC-RH-02');
    expect(await codigoDoErro(criarAparelho(orgA, 'maquina-nova', 'PC-RH-02'))).toBeNull();
  });

  it('o aparelho nasce com a entrada pelo Windows e o teto de 5, e recusa o teto zero', async () => {
    const aparelho = await criarAparelho(orgA, 'maquina-de-fabrica');
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query<{ entrada: string; teto: number }>(
        'select entrada, teto_de_contas as teto from aparelhos_da_aba where id = $1',
        [aparelho],
      ),
    );
    expect(rows[0]).toEqual({ entrada: 'windows', teto: 5 });
    const erro = await codigoDoErro(
      emTransacao(app, orgA, (c) =>
        c.query('update aparelhos_da_aba set teto_de_contas = 0 where id = $1', [aparelho]),
      ),
    );
    expect(erro).toBe('23514');
  });

  it('o identificador curto é do Crockford, em maiúsculas, e único na organização', async () => {
    const comCurto = (identificador: string, maquina: string) =>
      emTransacao(app, orgA, (c) =>
        c.query(
          `insert into aparelhos_da_aba (org_id, identificador_da_maquina, identificador_curto, nome, token_hash)
           values ($1, $2, $3, 'PC-CURTO', $4)`,
          [orgA, maquina, identificador, randomBytes(32)],
        ),
      );
    for (const errado of ['ab0001', 'AB000I', 'AB000L', 'AB000O', 'AB000U', 'AB00012']) {
      expect(await codigoDoErro(comCurto(errado, `maquina-${errado}`))).toBe('23514');
    }
    expect(await codigoDoErro(comCurto('ZZ9999', 'maquina-curta-1'))).toBeNull();
    expect(await codigoDoErro(comCurto('ZZ9999', 'maquina-curta-2'))).toBe('23505');
  });

  it('o papel da aplicação não apaga a chave, a configuração, o aparelho, a sessão nem a abertura', async () => {
    for (const tabela of [
      'chaves_da_aba',
      'configuracoes_da_aba',
      'aparelhos_da_aba',
      'sessoes_da_aba',
      'aberturas_dos_chamados',
    ]) {
      const erro = await codigoDoErro(
        emTransacao(app, orgA, (c) => c.query(`delete from ${tabela}`)),
      );
      expect(erro, tabela).toBe('42501');
    }
  });
});

describe('sessões da aba', () => {
  it('uma sessão aberta por conta e aparelho, e outra depois que a primeira termina', async () => {
    const aparelho = await criarAparelho(orgA, 'maquina-das-sessoes');
    const primeira = await criarSessaoDaAba(orgA, contaDeA, aparelho);
    expect(await codigoDoErro(criarSessaoDaAba(orgA, contaDeA, aparelho))).toBe('23505');
    await emTransacao(app, orgA, (c) =>
      c.query(
        "update sessoes_da_aba set encerrada_em = now(), motivo_do_fim = 'aparelho-bloqueado' where id = $1",
        [primeira],
      ),
    );
    expect(await codigoDoErro(criarSessaoDaAba(orgA, contaDeA, aparelho))).toBeNull();
  });

  it('o fim pede o motivo, e o motivo pede o fim', async () => {
    const aparelho = await criarAparelho(orgA, 'maquina-do-motivo');
    const sessao = await criarSessaoDaAba(orgA, contaDeA, aparelho);
    const semMotivo = emTransacao(app, orgA, (c) =>
      c.query('update sessoes_da_aba set encerrada_em = now() where id = $1', [sessao]),
    );
    expect(await codigoDoErro(semMotivo)).toBe('23514');
    const semFim = emTransacao(app, orgA, (c) =>
      c.query("update sessoes_da_aba set motivo_do_fim = 'sem-uso' where id = $1", [sessao]),
    );
    expect(await codigoDoErro(semFim)).toBe('23514');
    const foraDaLista = emTransacao(app, orgA, (c) =>
      c.query(
        "update sessoes_da_aba set encerrada_em = now(), motivo_do_fim = 'qualquer' where id = $1",
        [sessao],
      ),
    );
    expect(await codigoDoErro(foraDaLista)).toBe('23514');
  });
});

describe('alcance da sessão comum', () => {
  it('a sessão de hoje fica comum, sem a sessão da aba', async () => {
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query<{ alcance: string }>(
        `insert into sessoes (org_id, conta_id, token_hash, token_csrf, expira_em)
         values ($1, $2, $3, 'csrf', now() + interval '10 minutes') returning alcance`,
        [orgA, contaDeA, randomBytes(32)],
      ),
    );
    expect(rows[0]?.alcance).toBe('comum');
  });

  it('o chat da aba pede a sessão da aba, e a comum não a aceita', async () => {
    const aparelho = await criarAparelho(orgA, 'maquina-do-alcance');
    const sessaoDaAba = await criarSessaoDaAba(orgA, contaDeA, aparelho);
    const inserir = (alcance: string, ligada: string | null) =>
      emTransacao(app, orgA, (c) =>
        c.query(
          `insert into sessoes (org_id, conta_id, token_hash, token_csrf, expira_em, alcance, sessao_da_aba_id)
           values ($1, $2, $3, 'csrf', now() + interval '10 minutes', $4, $5)`,
          [orgA, contaDeA, randomBytes(32), alcance, ligada],
        ),
      );
    expect(await codigoDoErro(inserir('chat-da-aba', null))).toBe('23514');
    expect(await codigoDoErro(inserir('comum', sessaoDaAba))).toBe('23514');
    expect(await codigoDoErro(inserir('chat-da-aba', sessaoDaAba))).toBeNull();
  });

  it('o chat da aba fica preso à sessão da aba da mesma conta e da mesma organização', async () => {
    const aparelhoDeA = await criarAparelho(orgA, 'maquina-de-outra-conta');
    const daOutraConta = await criarSessaoDaAba(orgA, outraContaDeA, aparelhoDeA);
    const aparelhoDeB = await criarAparelho(orgB, 'maquina-de-outra-organizacao');
    const daOutraOrganizacao = await criarSessaoDaAba(orgB, contaDeB, aparelhoDeB);
    const inserir = (ligada: string) =>
      emTransacao(app, orgA, (c) =>
        c.query(
          `insert into sessoes (org_id, conta_id, token_hash, token_csrf, expira_em, alcance, sessao_da_aba_id)
           values ($1, $2, $3, 'csrf', now() + interval '10 minutes', 'chat-da-aba', $4)`,
          [orgA, contaDeA, randomBytes(32), ligada],
        ),
      );
    expect(await codigoDoErro(inserir(daOutraConta))).toBe('23503');
    expect(await codigoDoErro(inserir(daOutraOrganizacao))).toBe('23503');
  });
});

describe('bilhetes', () => {
  it('o destino chamado pede o número, e o chat não o aceita', async () => {
    const aparelho = await criarAparelho(orgA, 'maquina-dos-bilhetes');
    const sessao = await criarSessaoDaAba(orgA, contaDeA, aparelho);
    const inserir = (destino: string, numero: number | null) =>
      emTransacao(app, orgA, (c) =>
        c.query(
          `insert into bilhetes_da_aba (org_id, hash, sessao_da_aba_id, destino, chamado_numero, expira_em)
           values ($1, $2, $3, $4, $5, now() + interval '60 seconds')`,
          [orgA, randomBytes(32), sessao, destino, numero],
        ),
      );
    expect(await codigoDoErro(inserir('chamado', null))).toBe('23514');
    expect(await codigoDoErro(inserir('chat', 1041))).toBe('23514');
    expect(await codigoDoErro(inserir('chamado', 1041))).toBeNull();
    expect(await codigoDoErro(inserir('chat', null))).toBeNull();
  });

  it('o papel da aplicação apaga o bilhete, para a limpeza dos vencidos', async () => {
    const aparelho = await criarAparelho(orgA, 'maquina-da-limpeza');
    const sessao = await criarSessaoDaAba(orgA, contaDeA, aparelho);
    const apagados = await emTransacao(app, orgA, async (c) => {
      await c.query(
        `insert into bilhetes_da_aba (org_id, hash, sessao_da_aba_id, destino, expira_em)
         values ($1, $2, $3, 'chat', now() - interval '1 day')`,
        [orgA, randomBytes(32), sessao],
      );
      return c.query('delete from bilhetes_da_aba where sessao_da_aba_id = $1', [sessao]);
    });
    expect(apagados.rowCount).toBe(1);
  });
});
