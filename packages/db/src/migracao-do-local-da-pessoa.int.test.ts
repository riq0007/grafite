// O local da pessoa na abertura no chamado (spec chamados, "Ativo ligado e campos da TI"; change
// chamados-da-ti, design, "O local da pessoa na abertura", tarefa 4.15): a migration põe a coluna,
// com a chave estrangeira da organização, e os chamados que já existiam ficam com o local de agora
// da pessoa, o único que se conhece, ou sem local, com a pessoa sem local. O RLS volta forçado. A
// chave estrangeira está no teste dos chamados.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type BancoDeTeste, encerrarPool, iniciarBancoDeTeste } from '../test/banco-de-teste.ts';
import { tabelasSemIsolamento } from './guarda.ts';
import { migrar, pastaMigracoes } from './migrar.ts';

const MIGRACAO = '0064_local_da_pessoa_no_chamado';

/** Uma cópia das migrations sem a do local da pessoa e as seguintes. */
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
const ids = {
  org: '',
  local: '',
  comLocal: '',
  semLocal: '',
  conta: '',
  tipo: '',
  chamadoComLocal: '',
  chamadoSemLocal: '',
};

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

const FORMULARIO_VAZIO = { titulo: { comecaPeloTipo: true, campoId: null }, campos: [] };

const PRAZO = {
  modo: 'horario',
  respostaMin: 30,
  resolucaoMin: 480,
  resposta: { valor: 30, unidade: 'min' },
  resolucao: { valor: 8, unidade: 'h' },
};

/** Um chamado Na triagem, aberto pela TI antes da migration. */
const chamadoDeAntes = (c: pg.PoolClient, id: string, numero: number, pessoa: string) =>
  c.query(
    `insert into chamados (id, org_id, numero, tipo_id, titulo, titulo_normalizado, pessoa_id,
       origem, aberto_por, formulario, situacao, prazo, relogio_desde, primeira_resposta_em)
     values ($1, $2, $3, $4, 'Impressora manchando', 'impressora manchando', $5, 'ti', $6, $7,
       'triagem', $8, now(), now())`,
    [id, ids.org, numero, ids.tipo, pessoa, ids.conta, FORMULARIO_VAZIO, PRAZO],
  );

beforeAll(async () => {
  banco = await iniciarBancoDeTeste({ aplicarMigracoes: false });
  dono = new pg.Pool({ connectionString: banco.urlDono });
  app = new pg.Pool({ connectionString: banco.urlApp });
  pastaParcial = migracoesAnteriores();
  await migrar(banco.urlDono, pastaParcial);
  for (const chave of Object.keys(ids) as (keyof typeof ids)[]) ids[chave] = await novoId();
  await emTransacao(dono, ids.org, async (c) => {
    await c.query('insert into organizacoes (id, nome) values ($1, $2)', [ids.org, 'Empresa']);
    await c.query(
      `insert into locais (id, org_id, nome, nome_normalizado, tipo)
       values ($1, $2, 'Jundiaí', 'jundiai', 'sala')`,
      [ids.local, ids.org],
    );
    await c.query('insert into pessoas (id, org_id, nome, local_id) values ($1, $2, $3, $4)', [
      ids.comLocal,
      ids.org,
      'Marina Lopes',
      ids.local,
    ]);
    await c.query('insert into pessoas (id, org_id, nome) values ($1, $2, $3)', [
      ids.semLocal,
      ids.org,
      'Otávio Reis',
    ]);
    await c.query(
      `insert into contas (id, org_id, pessoa_id, usuario, hash_senha)
       values ($1, $2, $3, 'ana', 'hash')`,
      [ids.conta, ids.org, ids.comLocal],
    );
    await c.query(
      `insert into tipos_de_chamado (id, org_id, nome, nome_normalizado, icone, frase, situacao,
         ordem, resposta_valor, resposta_unidade, resolucao_valor, resolucao_unidade, modo,
         sem_ninguem, gera_solicitacao, formulario)
       values ($1, $2, 'Impressora', 'impressora', 'impressora', 'Mancha, atola ou não imprime',
         'em-uso', 1, 30, 'min', 8, 'h', 'horario', 'triagem', 'nao', $3)`,
      [ids.tipo, ids.org, FORMULARIO_VAZIO],
    );
    await chamadoDeAntes(c, ids.chamadoComLocal, 1001, ids.comLocal);
    await chamadoDeAntes(c, ids.chamadoSemLocal, 1002, ids.semLocal);
  });
  await migrar(banco.urlDono);
});

afterAll(async () => {
  await encerrarPool(dono);
  await encerrarPool(app);
  await banco?.parar();
  if (pastaParcial) rmSync(pastaParcial, { recursive: true, force: true });
});

describe('migration do local da pessoa no chamado', () => {
  it('o chamado de antes fica com o local de agora da pessoa, ou sem local, com a pessoa sem local', async () => {
    const { rows } = await emTransacao(app, ids.org, (c) =>
      c.query<{ id: string; local_da_pessoa: string | null }>(
        'select id, local_da_pessoa from chamados order by numero',
      ),
    );
    expect(rows).toEqual([
      { id: ids.chamadoComLocal, local_da_pessoa: ids.local },
      { id: ids.chamadoSemLocal, local_da_pessoa: null },
    ]);
  });

  it('o RLS dos chamados e das pessoas volta forçado', async () => {
    expect(await tabelasSemIsolamento(dono)).toEqual([]);
  });
});
