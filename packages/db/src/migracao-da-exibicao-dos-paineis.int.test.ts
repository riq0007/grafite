// A exibição dos painéis no banco (spec painel-de-dashboards, "Exibição do painel"; change
// diagnostico-dos-paineis, design, decisão 2): a migration acrescenta as colunas `exibicao` e
// `motivo_da_exibicao` à tabela `paineis`, as duas nulas nos painéis de antes, que esperam a
// verificação seguinte, e o banco confere os valores.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type BancoDeTeste, encerrarPool, iniciarBancoDeTeste } from '../test/banco-de-teste.ts';
import { tabelasSemIsolamento } from './guarda.ts';
import { migrar, pastaMigracoes } from './migrar.ts';

const MIGRACAO = '0055_exibicao_dos_paineis';

/** Uma cópia das migrations sem a da exibição e as seguintes. */
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
let org = '';
let painel = '';

async function emTransacao<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
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

/** O que o papel da aplicação lê do painel. */
const lido = () =>
  emTransacao(app, (c) =>
    c.query<{ verificacao: string; exibicao: string | null; motivo_da_exibicao: string | null }>(
      'select verificacao, exibicao, motivo_da_exibicao from paineis where id = $1',
      [painel],
    ),
  ).then(({ rows }) => rows[0]);

/** O papel da aplicação grava a exibição, como a verificação. */
const gravar = (exibicao: string | null, motivo: string | null) =>
  emTransacao(app, (c) =>
    c.query('update paineis set exibicao = $2, motivo_da_exibicao = $3 where id = $1', [
      painel,
      exibicao,
      motivo,
    ]),
  );

beforeAll(async () => {
  banco = await iniciarBancoDeTeste({ aplicarMigracoes: false });
  dono = new pg.Pool({ connectionString: banco.urlDono });
  app = new pg.Pool({ connectionString: banco.urlApp });
  pastaParcial = migracoesAnteriores();
  await migrar(banco.urlDono, pastaParcial);
  // Um painel de antes, já verificado e no ar.
  const { rows } = await dono.query<{ id: string }>('select uuidv7() as id');
  org = rows[0]?.id ?? '';
  await emTransacao(dono, async (c) => {
    await c.query('insert into organizacoes (id, nome) values ($1, $2)', [org, 'Empresa']);
    const inserido = await c.query<{ id: string }>(
      `insert into paineis
         (org_id, nome, nome_normalizado, endereco, verificacao, verificado_em, tempo_da_resposta)
       values ($1, 'Linha 2', 'linha 2', 'https://grafana.empresa.local', 'no-ar', now(), 40)
       returning id`,
      [org],
    );
    painel = inserido.rows[0]?.id ?? '';
  });
  await migrar(banco.urlDono);
});

afterAll(async () => {
  await encerrarPool(dono);
  await encerrarPool(app);
  await banco?.parar();
  if (pastaParcial) rmSync(pastaParcial, { recursive: true, force: true });
});

describe('migration da exibição dos painéis', () => {
  it('o painel de antes continua no ar, sem exibição, até a verificação seguinte', async () => {
    expect(await lido()).toEqual({
      verificacao: 'no-ar',
      exibicao: null,
      motivo_da_exibicao: null,
    });
  });

  it('guarda os três valores da exibição, com o motivo', async () => {
    await gravar('recusa', 'A ferramenta manda X-Frame-Options: DENY.');
    expect(await lido()).toMatchObject({
      exibicao: 'recusa',
      motivo_da_exibicao: 'A ferramenta manda X-Frame-Options: DENY.',
    });
    await gravar('pede-entrada', 'Respondeu 401.');
    expect((await lido())?.exibicao).toBe('pede-entrada');
    await gravar('aparece', null);
    expect(await lido()).toMatchObject({ exibicao: 'aparece', motivo_da_exibicao: null });
  });

  it('recusa a exibição fora dos três valores', async () => {
    await expect(gravar('conferido', null)).rejects.toThrow(/paineis_exibicao_valida/);
  });

  it('recusa o motivo em branco e o com mais de 200 caracteres', async () => {
    await expect(gravar('recusa', '   ')).rejects.toThrow(/paineis_motivo_da_exibicao_valido/);
    await expect(gravar('recusa', 'x'.repeat(201))).rejects.toThrow(
      /paineis_motivo_da_exibicao_valido/,
    );
  });

  it('a tabela continua com o RLS ativo e forçado', async () => {
    expect(await tabelasSemIsolamento(dono)).toEqual([]);
  });
});
