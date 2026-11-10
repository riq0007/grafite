// Os aparelhos confiáveis no banco (spec verificacao-em-dois-passos, "Aparelho confiável" e "Prazo
// da confiança"; change aparelho-confiavel, design, decisões 1 e 4): a migration cria a tabela dos
// aparelhos, com o hash do token, e a da política de entrada, uma por organização, as duas isoladas
// por organização, e as colunas do prazo na conta e no perfil e a do aparelho na sessão, todas
// vazias nos dados de antes. O banco recusa o prazo fora de 0 a 90 dias.
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type BancoDeTeste, encerrarPool, iniciarBancoDeTeste } from '../test/banco-de-teste.ts';
import { tabelasSemIsolamento } from './guarda.ts';
import { migrar, pastaMigracoes } from './migrar.ts';

const MIGRACAO = '0056_aparelhos_confiaveis';

/** Uma cópia das migrations sem a dos aparelhos e as seguintes. */
function migracoesAnteriores(): string {
  const pasta = mkdtempSync(join(tmpdir(), 'grafite-migracoes-'));
  cpSync(pastaMigracoes, pasta, { recursive: true });
  const caminho = join(pasta, 'meta', '_journal.json');
  const diario = JSON.parse(readFileSync(caminho, 'utf-8')) as { entries: { tag: string }[] };
  const posicao = diario.entries.findIndex((entrada) => entrada.tag === MIGRACAO);
  if (posicao >= 0) diario.entries = diario.entries.slice(0, posicao);
  writeFileSync(caminho, JSON.stringify(diario));
  return pasta;
}

let banco: BancoDeTeste;
let dono: pg.Pool;
let app: pg.Pool;
let pastaParcial = '';
const ids = { org: '', outra: '', conta: '', perfil: '', sessao: '' };

async function emTransacao<T>(
  pool: pg.Pool,
  orgId: string,
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query("select set_config('app.org_id', $1, true)", [orgId]);
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

async function novoId(): Promise<string> {
  const { rows } = await dono.query<{ id: string }>('select uuidv7() as id');
  return rows[0]?.id ?? '';
}

const hash = () => createHash('sha256').update(randomBytes(32)).digest();

/** O papel da aplicação marca um aparelho da conta, como a entrada. */
const marcar = (orgId = ids.org) =>
  emTransacao(app, orgId, (c) =>
    c.query<{ id: string }>(
      `insert into aparelhos_confiaveis (org_id, conta_id, token_hash, dispositivo, ip)
       values ($1, $2, $3, 'Chrome no Windows', '10.0.0.7') returning id`,
      [orgId, ids.conta, hash()],
    ),
  );

beforeAll(async () => {
  banco = await iniciarBancoDeTeste({ aplicarMigracoes: false });
  dono = new pg.Pool({ connectionString: banco.urlDono });
  app = new pg.Pool({ connectionString: banco.urlApp });
  pastaParcial = migracoesAnteriores();
  await migrar(banco.urlDono, pastaParcial);
  // Uma organização de antes, com a pessoa, a conta, um perfil e uma sessão aberta.
  for (const chave of ['org', 'outra', 'conta', 'perfil', 'sessao'] as const) {
    ids[chave] = await novoId();
  }
  const pessoa = await novoId();
  await emTransacao(dono, ids.org, async (c) => {
    await c.query('insert into organizacoes (id, nome) values ($1, $2)', [ids.org, 'Empresa']);
    await c.query('insert into pessoas (id, org_id, nome) values ($1, $2, $3)', [
      pessoa,
      ids.org,
      'Bruno Costa',
    ]);
    await c.query(
      `insert into contas (id, org_id, pessoa_id, usuario, hash_senha)
       values ($1, $2, $3, 'bruno', 'hash')`,
      [ids.conta, ids.org, pessoa],
    );
    await c.query(
      `insert into perfis (id, org_id, nome, nome_normalizado) values ($1, $2, 'Técnico', 'tecnico')`,
      [ids.perfil, ids.org],
    );
    await c.query(
      `insert into sessoes (id, org_id, conta_id, token_hash, token_csrf, expira_em)
       values ($1, $2, $3, $4, 'csrf', now() + interval '1 hour')`,
      [ids.sessao, ids.org, ids.conta, hash()],
    );
  });
  await emTransacao(dono, ids.outra, (c) =>
    c.query('insert into organizacoes (id, nome) values ($1, $2)', [ids.outra, 'Outra']),
  );
  await migrar(banco.urlDono);
});

afterAll(async () => {
  await encerrarPool(dono);
  await encerrarPool(app);
  await banco?.parar();
  if (pastaParcial) rmSync(pastaParcial, { recursive: true, force: true });
});

describe('migration dos aparelhos confiáveis', () => {
  it('a conta, o perfil e a sessão de antes ficam sem prazo e sem aparelho', async () => {
    const lido = await emTransacao(app, ids.org, async (c) => ({
      conta: (await c.query('select dias_de_confianca from contas')).rows,
      perfil: (await c.query('select dias_de_confianca from perfis')).rows,
      sessao: (await c.query('select aparelho_id from sessoes')).rows,
      politica: (await c.query('select * from politica_de_entrada')).rows,
      aparelhos: (await c.query('select * from aparelhos_confiaveis')).rows,
    }));
    expect(lido).toEqual({
      conta: [{ dias_de_confianca: null }],
      perfil: [{ dias_de_confianca: null }],
      sessao: [{ aparelho_id: null }],
      politica: [],
      aparelhos: [],
    });
  });

  it('as duas tabelas novas ficam com o RLS ativo e forçado', async () => {
    expect(await tabelasSemIsolamento(dono)).toEqual([]);
  });

  it('o aparelho é da organização: a outra não o vê nem grava nele', async () => {
    const [marcado] = (await marcar()).rows;
    const visto = (orgId: string) =>
      emTransacao(app, orgId, (c) =>
        c.query('select id, dispositivo, ip, criado_em, usado_em from aparelhos_confiaveis'),
      ).then(({ rows }) => rows);
    expect(await visto(ids.org)).toEqual([
      expect.objectContaining({
        id: marcado?.id,
        dispositivo: 'Chrome no Windows',
        ip: '10.0.0.7',
      }),
    ]);
    expect(await visto(ids.outra)).toEqual([]);
    await expect(
      emTransacao(app, ids.outra, (c) =>
        c.query(
          `insert into aparelhos_confiaveis (org_id, conta_id, token_hash, dispositivo)
           values ($1, $2, $3, 'Edge no Windows')`,
          [ids.org, ids.conta, hash()],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('o hash do token é único', async () => {
    const repetido = hash();
    const gravar = () =>
      emTransacao(app, ids.org, (c) =>
        c.query(
          `insert into aparelhos_confiaveis (org_id, conta_id, token_hash, dispositivo)
           values ($1, $2, $3, 'Firefox no Linux')`,
          [ids.org, ids.conta, repetido],
        ),
      );
    await gravar();
    await expect(gravar()).rejects.toThrow(/aparelhos_confiaveis_token_hash_unico/);
  });

  it('a política de entrada é uma por organização, com 30 dias de fábrica', async () => {
    const gravar = () =>
      emTransacao(app, ids.org, (c) =>
        c.query<{ dias_de_confianca: number }>(
          'insert into politica_de_entrada (org_id) values ($1) returning dias_de_confianca',
          [ids.org],
        ),
      );
    expect((await gravar()).rows).toEqual([{ dias_de_confianca: 30 }]);
    await expect(gravar()).rejects.toThrow(/politica_de_entrada_uma_por_organizacao/);
  });

  it('Prazo fora do intervalo: o banco recusa menos de 0 e mais de 90 dias nos três níveis', async () => {
    const mudar = (sql: string, dias: number) =>
      emTransacao(app, ids.org, (c) => c.query(sql, [dias]));
    for (const dias of [-1, 91, 120]) {
      await expect(mudar('update contas set dias_de_confianca = $1', dias)).rejects.toThrow(
        /contas_dias_de_confianca_valido/,
      );
      await expect(mudar('update perfis set dias_de_confianca = $1', dias)).rejects.toThrow(
        /perfis_dias_de_confianca_valido/,
      );
      await expect(
        mudar('update politica_de_entrada set dias_de_confianca = $1', dias),
      ).rejects.toThrow(/politica_de_entrada_dias_de_confianca_valido/);
    }
    for (const dias of [0, 90]) {
      await mudar('update contas set dias_de_confianca = $1', dias);
      await mudar('update perfis set dias_de_confianca = $1', dias);
      await mudar('update politica_de_entrada set dias_de_confianca = $1', dias);
    }
  });

  it('a sessão guarda o aparelho pelo qual entrou', async () => {
    const [marcado] = (await marcar()).rows;
    await emTransacao(app, ids.org, (c) =>
      c.query('update sessoes set aparelho_id = $1 where id = $2', [marcado?.id, ids.sessao]),
    );
    const { rows } = await emTransacao(app, ids.org, (c) =>
      c.query('select aparelho_id from sessoes where id = $1', [ids.sessao]),
    );
    expect(rows).toEqual([{ aparelho_id: marcado?.id }]);
  });
});
