// O que muda nos chamados com o chat, na migration (spec chamados; change chat-com-chamados, design,
// decisão 2 e Migration Plan; tarefa 1.2): os CHECKs só se alargam. O que a versão anterior gravou
// fica como estava, a resposta pronta de antes fica com as opções vazias, e o que ela grava continua
// aceito no banco novo, que a volta do runbook usa: a abertura pela TI, a mensagem da conta e a da
// pessoa, a nota, o evento com autor, a resposta pronta sem as opções, o resolver e o reabrir. A
// leitura nova nasce isolada pela organização. As checagens novas estão no teste dos chamados pelo
// chat.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type BancoDeTeste, encerrarPool, iniciarBancoDeTeste } from '../test/banco-de-teste.ts';
import { tabelasSemIsolamento } from './guarda.ts';
import { migrar, pastaMigracoes } from './migrar.ts';

const MIGRACAO = '0066_chamados_pelo_chat';

/** Uma cópia das migrations sem a dos chamados pelo chat e as seguintes. */
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
  pessoa: '',
  pessoaDaConta: '',
  conta: '',
  tipo: '',
  emAtendimento: '',
  resolvido: '',
  resposta: '',
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

/** A abertura como a versão anterior a grava: pela TI, com quem abriu e a primeira resposta. */
const abrirComoAntes = (c: pg.PoolClient, id: string, numero: number) =>
  c.query(
    `insert into chamados (id, org_id, numero, tipo_id, titulo, titulo_normalizado, pessoa_id,
       origem, aberto_por, formulario, situacao, responsavel_id, responsavel_desde, prazo,
       relogio_desde, primeira_resposta_em)
     values ($1, $2, $3, $4, 'Impressora manchando', 'impressora manchando', $5, 'ti', $6, $7,
       'em-atendimento', $6, now(), $8, now(), now())`,
    [id, ids.org, numero, ids.tipo, ids.pessoa, ids.conta, FORMULARIO_VAZIO, PRAZO],
  );

/** A conversa como a versão anterior a grava: a mensagem da conta e a da pessoa, a nota e o evento. */
async function conversarComoAntes(c: pg.PoolClient, chamado: string) {
  const gravar = (colunas: string[], valores: unknown[]) =>
    c.query(
      `insert into mensagens_dos_chamados (org_id, chamado_id, ${colunas.join(', ')})
       values ($1, $2, ${valores.map((_, i) => `$${i + 3}`).join(', ')})`,
      [ids.org, chamado, ...valores],
    );
  await gravar(['especie', 'autor_conta', 'texto'], ['mensagem', ids.conta, 'Qual é a pasta?']);
  await gravar(['especie', 'autor_pessoa', 'texto'], ['mensagem', ids.pessoa, 'Financeiro-2026']);
  await gravar(['especie', 'autor_conta', 'texto'], ['nota', ids.conta, 'A pasta é do Comercial.']);
  await gravar(
    ['especie', 'autor_conta', 'evento', 'dados'],
    ['evento', ids.conta, 'assumiu', { de: null, desde: '2026-11-11T13:20:00.000Z' }],
  );
}

/** A resposta pronta como a versão anterior a cadastra, sem as opções. */
const responderComoAntes = (c: pg.PoolClient, id: string, rotulo: string) =>
  c.query(
    `insert into respostas_prontas (id, org_id, rotulo, rotulo_normalizado, texto, ordem)
     values ($1, $2, $3, lower($3), 'Pode mandar o print do erro, {nome}?', 1)`,
    [id, ids.org, rotulo],
  );

/** O resolver e o reabrir como a versão anterior os grava. */
const resolverComoAntes = (c: pg.PoolClient, id: string) =>
  c.query(
    `update chamados set situacao = 'resolvido', relogio_desde = null, resolvido_em = now(),
       resolvido_por = $2, versao = versao + 1
     where id = $1`,
    [id, ids.conta],
  );
const reabrirComoAntes = (c: pg.PoolClient, id: string) =>
  c.query(
    `update chamados set situacao = 'em-atendimento', relogio_desde = now(), resolvido_em = null,
       resolvido_por = null, versao = versao + 1
     where id = $1`,
    [id],
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
    await c.query('insert into pessoas (id, org_id, nome) values ($1, $2, $3), ($4, $2, $5)', [
      ids.pessoa,
      ids.org,
      'Fernanda Rocha',
      ids.pessoaDaConta,
      'Ana Souza',
    ]);
    await c.query(
      `insert into contas (id, org_id, pessoa_id, usuario, hash_senha)
       values ($1, $2, $3, 'ana', 'hash')`,
      [ids.conta, ids.org, ids.pessoaDaConta],
    );
    await c.query(
      `insert into tipos_de_chamado (id, org_id, nome, nome_normalizado, icone, frase, situacao,
         ordem, resposta_valor, resposta_unidade, resolucao_valor, resolucao_unidade, modo,
         sem_ninguem, gera_solicitacao, formulario)
       values ($1, $2, 'Impressora', 'impressora', 'impressora', 'Mancha, atola ou não imprime',
         'em-uso', 1, 30, 'min', 8, 'h', 'horario', 'triagem', 'nao', $3)`,
      [ids.tipo, ids.org, FORMULARIO_VAZIO],
    );
    await abrirComoAntes(c, ids.emAtendimento, 1001);
    await conversarComoAntes(c, ids.emAtendimento);
    await abrirComoAntes(c, ids.resolvido, 1002);
    await resolverComoAntes(c, ids.resolvido);
    await responderComoAntes(c, ids.resposta, 'Pedir o print do erro');
  });
  await migrar(banco.urlDono);
});

afterAll(async () => {
  await encerrarPool(dono);
  await encerrarPool(app);
  await banco?.parar();
  if (pastaParcial) rmSync(pastaParcial, { recursive: true, force: true });
});

describe('migration dos chamados pelo chat', () => {
  it('o que a versão anterior gravou fica como estava, e a resposta pronta fica sem opções', async () => {
    const lido = await emTransacao(app, ids.org, async (c) => ({
      chamados: (
        await c.query(
          `select numero, origem, situacao, origem_conversa_id, origem_mensagem_id, fechado_em
             from chamados order by numero`,
        )
      ).rows,
      conversa: (
        await c.query(
          `select especie, evento, opcoes, cartao from mensagens_dos_chamados
            where chamado_id = $1 order by id`,
          [ids.emAtendimento],
        )
      ).rows,
      respostas: (await c.query('select id, opcoes from respostas_prontas')).rows,
    }));
    const semOrigem = { origem: 'ti', origem_conversa_id: null, origem_mensagem_id: null };
    expect(lido.chamados).toEqual([
      { numero: 1001, situacao: 'em-atendimento', fechado_em: null, ...semOrigem },
      { numero: 1002, situacao: 'resolvido', fechado_em: null, ...semOrigem },
    ]);
    const semExtras = { evento: null, opcoes: null, cartao: null };
    expect(lido.conversa).toEqual([
      { especie: 'mensagem', ...semExtras },
      { especie: 'mensagem', ...semExtras },
      { especie: 'nota', ...semExtras },
      { especie: 'evento', ...semExtras, evento: 'assumiu' },
    ]);
    expect(lido.respostas).toEqual([{ id: ids.resposta, opcoes: [] }]);
  });

  it('o que a versão anterior grava continua aceito: a abertura, a conversa, a resposta pronta, o resolver e o reabrir', async () => {
    const novo = await novoId();
    await emTransacao(app, ids.org, async (c) => {
      await abrirComoAntes(c, novo, 1003);
      await conversarComoAntes(c, novo);
      await responderComoAntes(c, await novoId(), 'Pedir o modelo');
      await resolverComoAntes(c, novo);
      await reabrirComoAntes(c, novo);
      // O resolvido de antes da migration, que ainda não fechou, também se reabre.
      await reabrirComoAntes(c, ids.resolvido);
    });
    const { rows } = await emTransacao(app, ids.org, (c) =>
      c.query(`select numero from chamados where situacao = 'em-atendimento' order by numero`),
    );
    expect(rows).toEqual([{ numero: 1001 }, { numero: 1002 }, { numero: 1003 }]);
  });

  it('a leitura dos chamados nasce isolada, e o RLS das tabelas mudadas fica forçado', async () => {
    expect(await tabelasSemIsolamento(dono)).toEqual([]);
  });
});
