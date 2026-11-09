// A migration do Administrador (design do F2b, decisão 8): as organizações criadas antes dela ganham
// o perfil protegido, atribuído à conta mais antiga, e exigem os dois passos se essa conta exigia. O
// RLS forçado, desligado só durante a semeadura, volta ao fim.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type BancoDeTeste, encerrarPool, iniciarBancoDeTeste } from '../test/banco-de-teste.ts';
import { tabelasSemIsolamento } from './guarda.ts';
import { migrar, pastaMigracoes } from './migrar.ts';

const MIGRACAO = '0010_administrador';

/** Uma cópia das migrations sem a do Administrador e as seguintes. */
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
const ids: Record<string, string> = {};

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

async function novoId(): Promise<string> {
  const { rows } = await dono.query<{ id: string }>('select uuidv7() as id');
  return rows[0]?.id ?? '';
}

/** Uma organização com as contas dadas, criadas na ordem, um minuto uma depois da outra. */
async function organizacaoAntiga(nome: string, contas: { usuario: string; exige: boolean }[]) {
  const org = await novoId();
  ids[nome] = org;
  await emTransacao(dono, org, async (c) => {
    await c.query('insert into organizacoes (id, nome) values ($1, $2)', [org, nome]);
    for (const [i, { usuario, exige }] of contas.entries()) {
      const pessoa = await novoId();
      const conta = await novoId();
      ids[usuario] = conta;
      const criada = new Date(Date.UTC(2026, 9, 1, 12, i)).toISOString();
      await c.query('insert into pessoas (id, org_id, nome) values ($1, $2, $3)', [
        pessoa,
        org,
        usuario,
      ]);
      await c.query(
        `insert into contas (id, org_id, pessoa_id, usuario, hash_senha, exige_dois_passos, criada_em)
         values ($1, $2, $3, $4, 'hash', $5, $6)`,
        [conta, org, pessoa, usuario, exige, criada],
      );
    }
  });
}

beforeAll(async () => {
  banco = await iniciarBancoDeTeste({ aplicarMigracoes: false });
  dono = new pg.Pool({ connectionString: banco.urlDono });
  app = new pg.Pool({ connectionString: banco.urlApp });
  pastaParcial = migracoesAnteriores();
  await migrar(banco.urlDono, pastaParcial);
  await organizacaoAntiga('Empresa', [
    { usuario: 'primeira', exige: true },
    { usuario: 'segunda', exige: false },
  ]);
  await organizacaoAntiga('Desenvolvimento', [{ usuario: 'admin', exige: false }]);
  await organizacaoAntiga('Vazia', []);
  await migrar(banco.urlDono);
});

afterAll(async () => {
  await encerrarPool(dono);
  await encerrarPool(app);
  await banco?.parar();
  if (pastaParcial) rmSync(pastaParcial, { recursive: true, force: true });
});

const perfisDa = (org: string) =>
  emTransacao(app, org, (c) =>
    c.query(
      `select nome, todas_as_permissoes, protegido, exige_dois_passos, situacao, permissoes
       from perfis`,
    ),
  );

const atribuicoesDa = (org: string) =>
  emTransacao(app, org, (c) =>
    c.query('select conta_id, grupo_id, local_id, encerrada_em from atribuicoes'),
  );

describe('migration do Administrador', () => {
  it('cria o Administrador protegido em cada organização', async () => {
    for (const org of ['Empresa', 'Desenvolvimento', 'Vazia']) {
      const { rows } = await perfisDa(ids[org] ?? '');
      expect(rows).toEqual([
        expect.objectContaining({
          nome: 'Administrador',
          todas_as_permissoes: true,
          protegido: true,
          situacao: 'ativo',
          permissoes: [],
        }),
      ]);
    }
  });

  it('atribui o Administrador à conta mais antiga, para a organização inteira', async () => {
    expect((await atribuicoesDa(ids.Empresa ?? '')).rows).toEqual([
      { conta_id: ids.primeira, grupo_id: null, local_id: null, encerrada_em: null },
    ]);
    expect((await atribuicoesDa(ids.Desenvolvimento ?? '')).rows).toEqual([
      { conta_id: ids.admin, grupo_id: null, local_id: null, encerrada_em: null },
    ]);
    expect((await atribuicoesDa(ids.Vazia ?? '')).rows).toEqual([]);
  });

  it('exige os dois passos se a conta mais antiga exigia, e na organização sem contas', async () => {
    const exige = async (org: string) =>
      (await perfisDa(ids[org] ?? '')).rows[0]?.exige_dois_passos as boolean;
    expect(await exige('Empresa')).toBe(true);
    expect(await exige('Desenvolvimento')).toBe(false);
    expect(await exige('Vazia')).toBe(true);
  });

  it('deixa todas as tabelas com o RLS forçado', async () => {
    expect(await tabelasSemIsolamento(dono)).toEqual([]);
  });
});
