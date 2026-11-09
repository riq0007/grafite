// Os backups do Control iD (spec backup-do-control-id; change p5a-backup-do-control-id, design,
// decisão 2): o pedido e o histórico numa tabela, com um pedido aberto por controle, as checagens
// da situação e da origem, a exclusão pela retenção e o isolamento pela organização.
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

async function recusada(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
  } catch (erro) {
    return (erro as { constraint?: string; message: string }).constraint ?? (erro as Error).message;
  }
  throw new Error('a mudança não foi recusada');
}

async function controle(org: string): Promise<string> {
  const nomeDoTipo = unico('Controle ');
  const tipo = await incluir('tipos_de_ativo', org, {
    nome: nomeDoTipo,
    nome_normalizado: nomeDoTipo.toLowerCase(),
    icone: 'controle-de-acesso',
  });
  return incluir('ativos', org, { tipo_id: tipo, busca: unico('ctrl-') });
}

let ativoA = '';

beforeAll(async () => {
  dono = new pg.Pool({ connectionString: inject('urlDono') });
  app = new pg.Pool({ connectionString: inject('urlApp') });
  orgA = await criarOrganizacao('Organização A');
  orgB = await criarOrganizacao('Organização B');
  ativoA = await controle(orgA);
});

afterAll(async () => {
  await dono?.end();
  await app?.end();
});

describe('os backups do Control iD', () => {
  it('aceitam um pedido aberto por controle, e o seguinte só depois do fim', async () => {
    const primeiro = await incluir('backups_do_control_id', orgA, {
      ativo_id: ativoA,
      origem: 'manual',
      situacao: 'na-fila',
    });
    expect(
      await recusada(
        incluir('backups_do_control_id', orgA, {
          ativo_id: ativoA,
          origem: 'agendado',
          situacao: 'na-fila',
        }),
      ),
    ).toBe('backups_do_control_id_aberto_unico');
    await emTransacao(app, orgA, (c) =>
      c.query(
        "update backups_do_control_id set situacao = 'falha', concluido_em = now(), erro = 'x' where id = $1",
        [primeiro],
      ),
    );
    await incluir('backups_do_control_id', orgA, {
      ativo_id: ativoA,
      origem: 'agendado',
      situacao: 'na-fila',
    });
  });

  it('recusam a situação e a origem desconhecidas e o fim sem o momento', async () => {
    const outro = await controle(orgA);
    expect(
      await recusada(
        incluir('backups_do_control_id', orgA, {
          ativo_id: outro,
          origem: 'manual',
          situacao: 'perdido',
        }),
      ),
    ).toBe('backups_do_control_id_situacao_valida');
    expect(
      await recusada(
        incluir('backups_do_control_id', orgA, {
          ativo_id: outro,
          origem: 'outra',
          situacao: 'na-fila',
        }),
      ),
    ).toBe('backups_do_control_id_origem_valida');
    expect(
      await recusada(
        incluir('backups_do_control_id', orgA, {
          ativo_id: outro,
          origem: 'manual',
          situacao: 'sucesso',
        }),
      ),
    ).toBe('backups_do_control_id_fim_coerente');
  });

  it('saem pela retenção, com o papel da aplicação, e ficam na organização', async () => {
    const outro = await controle(orgA);
    const backup = await incluir('backups_do_control_id', orgA, {
      ativo_id: outro,
      origem: 'agendado',
      situacao: 'sucesso',
      concluido_em: new Date(),
      arquivo: 'controlid/x.zip',
      tamanho: 10,
    });
    const deB = await emTransacao(app, orgB, (c) =>
      c.query('select id from backups_do_control_id where id = $1', [backup]),
    );
    expect(deB.rowCount).toBe(0);
    const apagados = await emTransacao(app, orgA, (c) =>
      c.query('delete from backups_do_control_id where id = $1', [backup]),
    );
    expect(apagados.rowCount).toBe(1);
  });
});

// As operações no controle (change p5b-comparacao-e-restauracao, design, decisão 1): uma aberta por
// controle, as checagens e a saída em cascata com o backup.
describe('as operações do Control iD', () => {
  it('aceitam uma aberta por controle e saem com o backup', async () => {
    const alvo = await controle(orgA);
    const backup = await incluir('backups_do_control_id', orgA, {
      ativo_id: alvo,
      origem: 'manual',
      situacao: 'sucesso',
      concluido_em: new Date(),
    });
    await incluir('operacoes_do_control_id', orgA, {
      backup_id: backup,
      ativo_id: alvo,
      tipo: 'comparacao',
      situacao: 'na-fila',
    });
    expect(
      await recusada(
        incluir('operacoes_do_control_id', orgA, {
          backup_id: backup,
          ativo_id: alvo,
          tipo: 'restauracao',
          situacao: 'na-fila',
        }),
      ),
    ).toBe('operacoes_do_control_id_aberta_unica');
    expect(
      await recusada(
        incluir('operacoes_do_control_id', orgA, {
          backup_id: backup,
          ativo_id: await controle(orgA),
          tipo: 'apagar',
          situacao: 'na-fila',
        }),
      ),
    ).toBe('operacoes_do_control_id_tipo_valido');
    await emTransacao(app, orgA, (c) =>
      c.query('delete from backups_do_control_id where id = $1', [backup]),
    );
    const restantes = await emTransacao(app, orgA, (c) =>
      c.query('select id from operacoes_do_control_id where backup_id = $1', [backup]),
    );
    expect(restantes.rowCount).toBe(0);
  });
});
