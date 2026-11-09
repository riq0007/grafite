// As notificações (spec notificacoes; change p3b-notificacoes-no-servidor, design, decisão 2): uma
// linha por conta, com a severidade, os textos, o endereço e o alerta, a leitura e o momento,
// isoladas pela organização.
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

const conta = async (org: string) =>
  incluir('contas', org, {
    pessoa_id: await incluir('pessoas', org, { nome: unico('Pessoa') }),
    usuario: unico('conta').replace(' ', '.'),
    hash_senha: 'hash',
  });

const alertaDoToner = async (org: string) => {
  const nome = unico('Tipo');
  const tipo = await incluir('tipos_de_ativo', org, {
    nome,
    nome_normalizado: nome.toLowerCase(),
    icone: 'impressora',
  });
  const ativo = await incluir('ativos', org, { tipo_id: tipo, busca: unico('ativo') });
  const regra = unico('Regra');
  return incluir('alertas', org, {
    regra_id: await incluir('regras_de_alerta', org, {
      nome: regra,
      nome_normalizado: regra.toLowerCase(),
      condicao: 'toner.nivel',
      parametros: JSON.stringify({ limite: 10, folga: 5 }),
      severidade: 'critico',
    }),
    ativo_id: ativo,
    situacao: 'aberto',
    severidade: 'critico',
    texto: 'Black Toner Cartridge em 8%',
    observado_em: new Date('2026-10-14T10:00:00.000Z'),
    aberto_em: new Date('2026-10-14T10:00:00.000Z'),
  });
};

const notificacao = (org: string, colunas: Record<string, unknown>) =>
  incluir('notificacoes', org, {
    severidade: 'critico',
    titulo: 'Black Toner Cartridge em 8%',
    origem: 'Alertas',
    ...colunas,
  });

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

describe('notificações', () => {
  it('cada organização vê só as próprias notificações', async () => {
    const deA = await notificacao(orgA, { conta_id: await conta(orgA) });
    const deB = await notificacao(orgB, { conta_id: await conta(orgB) });
    const { rows } = await emTransacao(app, orgA, (c) => c.query('select id from notificacoes'));
    expect(rows.map((r) => r.id)).toContain(deA);
    expect(rows.map((r) => r.id)).not.toContain(deB);
  });

  it('nasce não lida, com o momento da gravação, sem descrição, endereço nem alerta', async () => {
    const id = await notificacao(orgA, { conta_id: await conta(orgA) });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query(
        `select lida_em, descricao, destino, alerta_id, criada_em > now() - interval '1 minute' as agora
           from notificacoes where id = $1`,
        [id],
      ),
    );
    expect(rows).toEqual([
      { lida_em: null, descricao: null, destino: null, alerta_id: null, agora: true },
    ]);
  });

  it('guarda o alerta de que trata, com o endereço da ficha', async () => {
    const alerta = await alertaDoToner(orgA);
    const id = await notificacao(orgA, {
      conta_id: await conta(orgA),
      alerta_id: alerta,
      descricao: 'HP LaserJet M404 · PAT-00412',
      destino: '/ativos/0199d3a0-0000-7000-8000-0000000000a1',
    });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select alerta_id from notificacoes where id = $1', [id]),
    );
    expect(rows).toEqual([{ alerta_id: alerta }]);
  });

  it('é de uma conta e de um alerta da própria organização', async () => {
    const deB = await conta(orgB);
    expect(await recusada(notificacao(orgA, { conta_id: deB }))).toBe('notificacoes_conta_fk');
    expect(
      await recusada(
        notificacao(orgA, { conta_id: await conta(orgA), alerta_id: await alertaDoToner(orgB) }),
      ),
    ).toBe('notificacoes_alerta_fk');
  });

  it('confere a severidade, os textos e o endereço', async () => {
    const daConta = await conta(orgA);
    expect(await recusada(notificacao(orgA, { conta_id: daConta, severidade: 'grave' }))).toBe(
      'notificacoes_severidade_valida',
    );
    expect(await recusada(notificacao(orgA, { conta_id: daConta, titulo: '' }))).toBe(
      'notificacoes_titulo_valido',
    );
    expect(await recusada(notificacao(orgA, { conta_id: daConta, titulo: 'x'.repeat(201) }))).toBe(
      'notificacoes_titulo_valido',
    );
    expect(
      await recusada(notificacao(orgA, { conta_id: daConta, descricao: 'x'.repeat(301) })),
    ).toBe('notificacoes_descricao_valida');
    expect(await recusada(notificacao(orgA, { conta_id: daConta, origem: '' }))).toBe(
      'notificacoes_origem_valida',
    );
    expect(
      await recusada(notificacao(orgA, { conta_id: daConta, destino: 'https://outro.site/' })),
    ).toBe('notificacoes_destino_valido');
  });

  it('a leitura fica com o momento dela', async () => {
    const id = await notificacao(orgA, { conta_id: await conta(orgA) });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('update notificacoes set lida_em = now() where id = $1 returning lida_em', [id]),
    );
    expect(rows[0]?.lida_em).toBeInstanceOf(Date);
  });
});
