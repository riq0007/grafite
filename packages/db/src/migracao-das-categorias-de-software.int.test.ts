// As categorias da base de software no banco (spec distribuicao-de-software, "Categorias da base" e
// "Base de software"; change software-por-pacote, design, decisões 1 e 3): a migration cria a tabela
// das categorias, isolada por organização, com as 7 de fábrica em cada organização que já existe, e
// põe no pacote a categoria, o nome no inventário, com o normalizado, e quem guardou o arquivo e
// quando. Os pacotes de antes vão para Utilitários, com o nome no inventário normalizado pelo nome.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type BancoDeTeste, encerrarPool, iniciarBancoDeTeste } from '../test/banco-de-teste.ts';
import { tabelasSemIsolamento } from './guarda.ts';
import { migrar, pastaMigracoes } from './migrar.ts';

const MIGRACAO = '0057_categorias_de_software';

const DE_FABRICA = [
  'Navegadores',
  'Compactadores',
  'Drivers',
  'Escritório',
  'Utilitários',
  'Rede e segurança',
  'Mídia',
];

/** Uma cópia das migrations sem a das categorias e as seguintes. */
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
const ids = { org: '', outra: '', pacote: '' };

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

/** As categorias da organização, na ordem, como a aplicação as lê. */
const categorias = (orgId: string) =>
  emTransacao(app, orgId, (c) =>
    c.query<{ id: string; nome: string; ordem: number }>(
      'select id, nome, ordem from categorias_de_software order by ordem',
    ),
  ).then(({ rows }) => rows);

beforeAll(async () => {
  banco = await iniciarBancoDeTeste({ aplicarMigracoes: false });
  dono = new pg.Pool({ connectionString: banco.urlDono });
  app = new pg.Pool({ connectionString: banco.urlApp });
  pastaParcial = migracoesAnteriores();
  await migrar(banco.urlDono, pastaParcial);
  // Duas organizações de antes; a primeira com um pacote na base.
  for (const chave of ['org', 'outra', 'pacote'] as const) ids[chave] = await novoId();
  await emTransacao(dono, ids.org, async (c) => {
    await c.query('insert into organizacoes (id, nome) values ($1, $2)', [ids.org, 'Empresa']);
    await c.query(
      `insert into pacotes_de_software (id, org_id, nome, nome_normalizado, versao, comando)
       values ($1, $2, 'Google Chrome', 'google chrome', '131', 'msiexec /i chrome.msi /qn')`,
      [ids.pacote, ids.org],
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

describe('migration das categorias de software', () => {
  it('cada organização de antes ganha as 7 categorias de fábrica, na ordem do mockup', async () => {
    for (const orgId of [ids.org, ids.outra]) {
      const lidas = await categorias(orgId);
      expect(lidas.map(({ nome }) => nome)).toEqual(DE_FABRICA);
      expect(lidas.map(({ ordem }) => ordem)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    }
  });

  it('o pacote de antes vai para Utilitários, com o nome no inventário normalizado pelo nome', async () => {
    const utilitarios = (await categorias(ids.org)).find(({ nome }) => nome === 'Utilitários');
    const lido = await emTransacao(app, ids.org, (c) =>
      c.query(
        `select categoria_id, nome_no_inventario, nome_no_inventario_normalizado,
                arquivo_guardado_em, arquivo_guardado_por
           from pacotes_de_software`,
      ),
    ).then(({ rows }) => rows);
    expect(lido).toEqual([
      {
        categoria_id: utilitarios?.id,
        nome_no_inventario: null,
        nome_no_inventario_normalizado: 'google chrome',
        arquivo_guardado_em: null,
        arquivo_guardado_por: null,
      },
    ]);
  });

  it('a tabela nova e as que a semeadura soltou ficam com o RLS ativo e forçado', async () => {
    expect(await tabelasSemIsolamento(dono)).toEqual([]);
  });

  it('a categoria é da organização: a outra não a vê nem grava nela', async () => {
    const daOutra = await categorias(ids.outra);
    expect(daOutra.some(({ id }) => id === undefined)).toBe(false);
    const daEmpresa = new Set((await categorias(ids.org)).map(({ id }) => id));
    expect(daOutra.filter(({ id }) => daEmpresa.has(id))).toEqual([]);
    await expect(
      emTransacao(app, ids.outra, (c) =>
        c.query(
          `insert into categorias_de_software (org_id, nome, nome_normalizado, ordem)
           values ($1, 'Jogos', 'jogos', 8)`,
          [ids.org],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('o nome da categoria é único sem acento na organização e tem de 1 a 40 caracteres', async () => {
    const gravar = (nome: string, normalizado: string) =>
      emTransacao(app, ids.org, (c) =>
        c.query(
          `insert into categorias_de_software (org_id, nome, nome_normalizado, ordem)
           values ($1, $2, $3, 8)`,
          [ids.org, nome, normalizado],
        ),
      );
    await expect(gravar('Midia', 'midia')).rejects.toThrow(/categorias_de_software_nome_unico/);
    await expect(gravar('   ', '')).rejects.toThrow(/categorias_de_software_nome_valido/);
    await expect(gravar('x'.repeat(41), 'x'.repeat(41))).rejects.toThrow(
      /categorias_de_software_nome_valido/,
    );
    // A outra organização pode ter o mesmo nome.
    await emTransacao(app, ids.outra, (c) =>
      c.query(
        `insert into categorias_de_software (org_id, nome, nome_normalizado, ordem)
         values ($1, 'Jogos', 'jogos', 8)`,
        [ids.outra],
      ),
    );
  });

  it('o pacote não aponta para a categoria de outra organização, e a categoria com pacote não sai', async () => {
    const [daOutra] = await categorias(ids.outra);
    await expect(
      emTransacao(app, ids.org, (c) =>
        c.query('update pacotes_de_software set categoria_id = $1', [daOutra?.id]),
      ),
    ).rejects.toThrow(/pacotes_de_software_categoria_fk/);
    await expect(
      emTransacao(app, ids.org, (c) =>
        c.query("delete from categorias_de_software where nome = 'Utilitários'"),
      ),
    ).rejects.toThrow(/pacotes_de_software_categoria_fk/);
  });

  it('o nome no inventário tem até 120 caracteres', async () => {
    await expect(
      emTransacao(app, ids.org, (c) =>
        c.query('update pacotes_de_software set nome_no_inventario = $1', ['x'.repeat(121)]),
      ),
    ).rejects.toThrow(/pacotes_de_software_nome_no_inventario_valido/);
  });
});
