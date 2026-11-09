// A troca do fornecedor em texto pela referência (spec cadastro-de-ativos, "Fornecedor dos ativos de
// antes"; change p4a-fornecedores, design, decisão 4): a migration cria um fornecedor para cada
// grafia, sem diferenciar acento, maiúsculas e espaços, com o nome mais usado, troca o texto de cada
// ativo pela referência sem mexer no estado, registra a criação na auditoria pelo sistema, converte
// os filtros salvos e religa o RLS forçado. Rodar de novo não muda nada.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type BancoDeTeste, encerrarPool, iniciarBancoDeTeste } from '../test/banco-de-teste.ts';
import { tabelasSemIsolamento } from './guarda.ts';
import { migrar, pastaMigracoes } from './migrar.ts';

const MIGRACAO = '0035_fornecedores';

/** Uma cópia das migrations sem a dos fornecedores e as seguintes. */
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
let outra = '';
const ids: Record<string, string> = {};

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

/** O estado de um valor gravado à mão, travado ou não, por quem e quando. */
const estadoManual = (autor: string, trava: boolean) => ({
  origem: 'manual',
  momento: '2026-09-01T12:00:00.000Z',
  autor,
  trava,
});

/** Uma organização de antes, com o tipo, a conta e os ativos com o fornecedor em texto. */
async function organizacaoDeAntes(nome: string, fornecedores: (string | null)[]) {
  const id = await novoId();
  const tipo = await novoId();
  const pessoa = await novoId();
  const conta = await novoId();
  await emTransacao(dono, id, async (c) => {
    await c.query('insert into organizacoes (id, nome) values ($1, $2)', [id, nome]);
    await c.query(
      `insert into tipos_de_ativo (id, org_id, nome, nome_normalizado, icone)
       values ($1, $2, 'Impressora', 'impressora', 'impressora')`,
      [tipo, id],
    );
    await c.query('insert into pessoas (id, org_id, nome) values ($1, $2, $3)', [
      pessoa,
      id,
      'Ana Souza',
    ]);
    await c.query(
      `insert into contas (id, org_id, pessoa_id, usuario, hash_senha)
       values ($1, $2, $3, 'ana', 'hash')`,
      [conta, id, pessoa],
    );
    for (const [i, fornecedor] of fornecedores.entries()) {
      const ativo = await novoId();
      ids[`${nome}:${i}`] = ativo;
      const valores = fornecedor === null ? {} : { 'ativo.fornecedor': fornecedor };
      const estado =
        fornecedor === null ? {} : { 'ativo.fornecedor': estadoManual(conta, i === 0) };
      await c.query(
        `insert into ativos (id, org_id, tipo_id, nome, valores, estado, busca, criado_em)
         values ($1, $2, $3, $4, $5, $6, '', $7)`,
        [
          ativo,
          id,
          tipo,
          `Impressora ${i + 1}`,
          JSON.stringify(valores),
          JSON.stringify(estado),
          new Date(Date.UTC(2026, 8, 1, 12, i)).toISOString(),
        ],
      );
    }
  });
  ids[`${nome}:conta`] = conta;
  return id;
}

/** Uma visão da organização e as mudanças guardadas da conta, com os filtros dados. */
async function filtrosSalvos(orgId: string, filtros: unknown[]) {
  await emTransacao(dono, orgId, async (c) => {
    await c.query(
      `insert into visoes (org_id, tabela, nome, nome_normalizado, definicao)
       values ($1, 'ativos', 'Locadas', 'locadas', $2)`,
      [orgId, JSON.stringify({ colunas: [], filtros })],
    );
    await c.query(
      `insert into mudancas_das_visoes (org_id, conta_id, tabela, definicao)
       values ($1, $2, 'ativos', $3)`,
      [orgId, ids[`${orgId === org ? 'Empresa' : 'Outra'}:conta`], JSON.stringify({ filtros })],
    );
  });
}

beforeAll(async () => {
  banco = await iniciarBancoDeTeste({ aplicarMigracoes: false });
  dono = new pg.Pool({ connectionString: banco.urlDono });
  app = new pg.Pool({ connectionString: banco.urlApp });
  pastaParcial = migracoesAnteriores();
  await migrar(banco.urlDono, pastaParcial);
  // Grafias do mesmo fornecedor: 2 "hp brasil", 3 "HP Brasil" e 1 "HP  Brasil"; o primeiro ativo,
  // com a trava. Mais dois fornecedores de locação, um ativo sem fornecedor e um em branco.
  org = await organizacaoDeAntes('Empresa', [
    'hp brasil',
    'HP Brasil',
    'hp brasil',
    'HP Brasil',
    'HP  Brasil',
    'HP Brasil',
    'Locadora Norte',
    'Locadora Sul',
    null,
    '   ',
  ]);
  outra = await organizacaoDeAntes('Outra', ['HP Brasil']);
  await filtrosSalvos(org, [
    { chave: 'ativo.fornecedor', operador: 'contem', texto: 'locadora' },
    { chave: 'ativo.nome', operador: 'contem', texto: 'Impressora' },
    { chave: 'ativo.fornecedor', operador: 'preenchido' },
  ]);
  await filtrosSalvos(outra, [{ chave: 'ativo.fornecedor', operador: 'contem', texto: 'canon' }]);
  await migrar(banco.urlDono);
});

afterAll(async () => {
  await encerrarPool(dono);
  await encerrarPool(app);
  await banco?.parar();
  if (pastaParcial) rmSync(pastaParcial, { recursive: true, force: true });
});

const fornecedoresDa = (orgId: string) =>
  emTransacao(app, orgId, (c) =>
    c.query<{ id: string; nome: string; nome_normalizado: string; situacao: string; cnpj: null }>(
      'select id, nome, nome_normalizado, situacao, cnpj from fornecedores order by nome',
    ),
  ).then(({ rows }) => rows);

const ativoDa = (orgId: string, chave: string) =>
  emTransacao(app, orgId, (c) =>
    c.query<{ valores: Record<string, unknown>; estado: Record<string, unknown> }>(
      'select valores, estado from ativos where id = $1',
      [ids[chave]],
    ),
  ).then(({ rows }) => rows[0]);

describe('migration dos fornecedores', () => {
  it('Grafias do mesmo fornecedor: um fornecedor só, com o nome mais usado, por organização', async () => {
    expect(await fornecedoresDa(org)).toEqual([
      expect.objectContaining({
        nome: 'HP Brasil',
        nome_normalizado: 'hp brasil',
        situacao: 'ativo',
        cnpj: null,
      }),
      expect.objectContaining({ nome: 'Locadora Norte', nome_normalizado: 'locadora norte' }),
      expect.objectContaining({ nome: 'Locadora Sul', nome_normalizado: 'locadora sul' }),
    ]);
    expect((await fornecedoresDa(outra)).map(({ nome }) => nome)).toEqual(['HP Brasil']);
  });

  it('troca o texto de cada ativo pela referência, e o branco pela falta do valor', async () => {
    const [hp] = await fornecedoresDa(org);
    for (const i of [0, 1, 2, 3, 4, 5]) {
      expect((await ativoDa(org, `Empresa:${i}`))?.valores['ativo.fornecedor']).toBe(hp?.id);
    }
    expect((await ativoDa(org, 'Empresa:8'))?.valores).toEqual({});
    expect((await ativoDa(org, 'Empresa:9'))?.valores).toEqual({});
  });

  it('Fornecedor travado: o estado do valor continua o mesmo, com a trava e o autor', async () => {
    expect((await ativoDa(org, 'Empresa:0'))?.estado['ativo.fornecedor']).toEqual(
      estadoManual(ids['Empresa:conta'] ?? '', true),
    );
    expect((await ativoDa(org, 'Empresa:1'))?.estado['ativo.fornecedor']).toEqual(
      estadoManual(ids['Empresa:conta'] ?? '', false),
    );
  });

  it('registra a criação de cada fornecedor na auditoria, pelo sistema', async () => {
    const { rows } = await emTransacao(app, org, (c) =>
      c.query(
        `select acao, ator_tipo, ator_descricao, alvo_tipo, depois, dados
           from auditoria where acao = 'fornecedor.criado' order by depois->>'nome'`,
      ),
    );
    expect(rows).toEqual(
      ['HP Brasil', 'Locadora Norte', 'Locadora Sul'].map((nome) => ({
        acao: 'fornecedor.criado',
        ator_tipo: 'sistema',
        ator_descricao: 'atualização do Grafite',
        alvo_tipo: 'fornecedor',
        depois: { nome },
        dados: { origem: 'Criado a partir do fornecedor dos ativos' },
      })),
    );
  });

  it('Visão com o filtro do fornecedor: o "contém" vira "é qualquer de" ou sai', async () => {
    const [, norte, sul] = await fornecedoresDa(org);
    const esperados = [
      {
        chave: 'ativo.fornecedor',
        operador: 'qualquer',
        valores: [norte?.id, sul?.id],
      },
      { chave: 'ativo.nome', operador: 'contem', texto: 'Impressora' },
      { chave: 'ativo.fornecedor', operador: 'preenchido' },
    ];
    const salvos = await emTransacao(app, org, (c) =>
      c.query<{ filtros: unknown }>(
        `select definicao->'filtros' as filtros from visoes
         union all select definicao->'filtros' from mudancas_das_visoes`,
      ),
    );
    expect(salvos.rows.map(({ filtros }) => filtros)).toEqual([esperados, esperados]);
    const daOutra = await emTransacao(app, outra, (c) =>
      c.query<{ filtros: unknown }>(
        `select definicao->'filtros' as filtros from visoes
         union all select definicao->'filtros' from mudancas_das_visoes`,
      ),
    );
    expect(daOutra.rows.map(({ filtros }) => filtros)).toEqual([[], []]);
  });

  it('religa o RLS forçado nas tabelas da troca', async () => {
    expect(await tabelasSemIsolamento(dono)).toEqual([]);
  });

  it('rodar a troca de novo não cria fornecedor nem muda os ativos', async () => {
    const antes = await fornecedoresDa(org);
    const ativoAntes = await ativoDa(org, 'Empresa:0');
    const sql = readFileSync(join(pastaMigracoes, `${MIGRACAO}.sql`), 'utf-8');
    const troca = sql.slice(sql.indexOf('-- A troca do fornecedor em texto'));
    // As funções da troca são temporárias, da sessão: os comandos vão por uma conexão só.
    const conexao = await dono.connect();
    try {
      for (const comando of troca.split('--> statement-breakpoint')) {
        if (comando.trim() !== '') await conexao.query(comando);
      }
    } finally {
      conexao.release();
    }
    expect(await fornecedoresDa(org)).toEqual(antes);
    expect(await ativoDa(org, 'Empresa:0')).toEqual(ativoAntes);
    expect(await tabelasSemIsolamento(dono)).toEqual([]);
  });
});
