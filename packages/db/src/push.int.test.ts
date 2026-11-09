// Os aparelhos do push e as marcas do envio (spec notificacoes, "Aparelhos do push", "E-mail do
// crítico na hora" e "Resumo diário por e-mail"; change p3c-email-e-push, design, decisões 3 e 8):
// a inscrição de cada aparelho, da conta, isolada pela organização, e o momento em que cada
// notificação foi por e-mail e teve o push decidido.
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

// As chaves de uma inscrição, no formato que o navegador dá: 65 e 16 bytes em base64url.
const P256DH = `B${'A'.repeat(86)}`;
const AUTH = 'A'.repeat(22);

const inscricao = (org: string, colunas: Record<string, unknown>) =>
  incluir('inscricoes_de_push', org, {
    endpoint: `https://fcm.googleapis.com/fcm/send/${unico('aparelho').replace(' ', '-')}`,
    p256dh: P256DH,
    auth: AUTH,
    aparelho: 'Chrome no Android',
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

describe('aparelhos do push', () => {
  it('cada organização vê só os próprios aparelhos', async () => {
    const deA = await inscricao(orgA, { conta_id: await conta(orgA) });
    const deB = await inscricao(orgB, { conta_id: await conta(orgB) });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select id from inscricoes_de_push'),
    );
    expect(rows.map((r) => r.id)).toContain(deA);
    expect(rows.map((r) => r.id)).not.toContain(deB);
  });

  it('nasce com o momento da inscrição e sem envio', async () => {
    const id = await inscricao(orgA, { conta_id: await conta(orgA) });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query(
        `select ultimo_envio_em, criada_em > now() - interval '1 minute' as agora
           from inscricoes_de_push where id = $1`,
        [id],
      ),
    );
    expect(rows).toEqual([{ ultimo_envio_em: null, agora: true }]);
  });

  it('o mesmo endereço não se inscreve duas vezes na organização', async () => {
    const daConta = await conta(orgA);
    const endpoint = 'https://fcm.googleapis.com/fcm/send/repetido';
    await inscricao(orgA, { conta_id: daConta, endpoint });
    expect(await recusada(inscricao(orgA, { conta_id: await conta(orgA), endpoint }))).toBe(
      'inscricoes_de_push_endpoint_unico',
    );
  });

  it('é de uma conta da própria organização', async () => {
    expect(await recusada(inscricao(orgA, { conta_id: await conta(orgB) }))).toBe(
      'inscricoes_de_push_conta_fk',
    );
  });

  it('confere o endereço, as chaves e o nome do aparelho', async () => {
    const daConta = await conta(orgA);
    expect(await recusada(inscricao(orgA, { conta_id: daConta, endpoint: 'fcm/send/x' }))).toBe(
      'inscricoes_de_push_endpoint_valido',
    );
    expect(
      await recusada(
        inscricao(orgA, { conta_id: daConta, endpoint: `https://${'x'.repeat(1000)}` }),
      ),
    ).toBe('inscricoes_de_push_endpoint_valido');
    expect(await recusada(inscricao(orgA, { conta_id: daConta, p256dh: 'curta' }))).toBe(
      'inscricoes_de_push_chaves_validas',
    );
    expect(await recusada(inscricao(orgA, { conta_id: daConta, auth: 'A'.repeat(21) }))).toBe(
      'inscricoes_de_push_chaves_validas',
    );
    expect(await recusada(inscricao(orgA, { conta_id: daConta, aparelho: '' }))).toBe(
      'inscricoes_de_push_aparelho_valido',
    );
    expect(await recusada(inscricao(orgA, { conta_id: daConta, aparelho: 'x'.repeat(81) }))).toBe(
      'inscricoes_de_push_aparelho_valido',
    );
  });
});

describe('marcas do envio das notificações', () => {
  it('nascem sem marca, e cada uma guarda o momento dela', async () => {
    const id = await incluir('notificacoes', orgA, {
      conta_id: await conta(orgA),
      severidade: 'critico',
      titulo: 'Black Toner Cartridge em 8%',
      origem: 'Alertas',
    });
    const antes = await emTransacao(app, orgA, (c) =>
      c.query('select email_em, push_em from notificacoes where id = $1', [id]),
    );
    expect(antes.rows).toEqual([{ email_em: null, push_em: null }]);
    const depois = await emTransacao(app, orgA, (c) =>
      c.query(
        'update notificacoes set email_em = now(), push_em = now() where id = $1 returning email_em, push_em',
        [id],
      ),
    );
    expect(depois.rows[0]?.email_em).toBeInstanceOf(Date);
    expect(depois.rows[0]?.push_em).toBeInstanceOf(Date);
  });
});
