// Os tipos de chamado de fábrica nas organizações que já existem (spec tipos-de-chamado, "Tipos de
// fábrica"; spec modulos-da-organizacao, "Chamados numa organização que já existia"; change
// chamados-da-ti, design, decisão 6): a migration grava os 9 tipos, Em uso e na ordem, em cada
// organização de antes, e o módulo Chamados começa ligado nelas. O texto da migration é conferido
// contra a lista do domínio no apps/api (src/chamados/fabrica.test.ts).
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type BancoDeTeste, encerrarPool, iniciarBancoDeTeste } from '../test/banco-de-teste.ts';
import { tabelasSemIsolamento } from './guarda.ts';
import { migrar, pastaMigracoes } from './migrar.ts';

const MIGRACAO = '0062_tipos_de_chamado_de_fabrica';

/** Os 9 tipos da spec: o nome, o ícone da lista e os ids dos campos do formulário do design. */
const DE_FABRICA = [
  ['Toner', 'gota', ['impressora', 'cor']],
  ['Computador', 'notebook', ['computador', 'problema', 'detalhes']],
  [
    'Impressora',
    'impressora',
    ['impressora', 'problema', 'manchas', 'foto', 'contador-de-paginas', 'contrato-de-manutencao'],
  ],
  ['Acesso e senha', 'cadeado', ['pedido', 'pasta-ou-sistema', 'motivo']],
  ['Software', 'janela', ['pedido', 'programa', 'detalhes']],
  ['Rede e internet', 'globo', ['problema', 'local', 'detalhes']],
  ['Telefone', 'telefone', ['telefone', 'problema']],
  ['Outro', 'reticencias', ['relato', 'local', 'foto']],
  ['Troca de equipamento', 'setas', ['equipamento', 'motivo']],
] as const;

/** Uma cópia das migrations sem a dos tipos de fábrica e as seguintes. */
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
const ids = { org: '', outra: '', nova: '' };

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

interface TipoLido {
  id: string;
  nome: string;
  icone: string;
  situacao: string;
  ordem: number;
  modo: string;
  resposta: string;
  resolucao: string;
  pode_virar_os: boolean;
  gera_solicitacao: string;
  pede_o_ativo: boolean;
  so_a_ti_abre: boolean;
  atende_por_padrao: string | null;
  sem_ninguem: string;
  tipo_de_ativo_do_equipamento: string | null;
  aparece_para_o_colaborador: boolean;
  duplicado_de: string | null;
  criado_por: string | null;
  formulario: { titulo: unknown; campos: { id: string }[] };
}

/** Os tipos de chamado da organização, na ordem, como a aplicação os lê. */
const tipos = (orgId: string) =>
  emTransacao(app, orgId, (c) =>
    c.query<TipoLido>(
      `select id, nome, icone, situacao, ordem, modo,
              resposta_valor || ' ' || resposta_unidade as resposta,
              resolucao_valor || ' ' || resolucao_unidade as resolucao,
              pode_virar_os, gera_solicitacao, pede_o_ativo, so_a_ti_abre, atende_por_padrao,
              sem_ninguem, tipo_de_ativo_do_equipamento, aparece_para_o_colaborador, duplicado_de,
              criado_por, formulario
         from tipos_de_chamado order by ordem`,
    ),
  ).then(({ rows }) => rows);

beforeAll(async () => {
  banco = await iniciarBancoDeTeste({ aplicarMigracoes: false });
  dono = new pg.Pool({ connectionString: banco.urlDono });
  app = new pg.Pool({ connectionString: banco.urlApp });
  pastaParcial = migracoesAnteriores();
  await migrar(banco.urlDono, pastaParcial);
  // Duas organizações de antes; a outra já tinha desligado o Salas.
  for (const chave of ['org', 'outra', 'nova'] as const) ids[chave] = await novoId();
  await emTransacao(dono, ids.org, (c) =>
    c.query('insert into organizacoes (id, nome) values ($1, $2)', [ids.org, 'Empresa']),
  );
  await emTransacao(dono, ids.outra, (c) =>
    c.query(`insert into organizacoes (id, nome, modulos_desligados) values ($1, $2, '{salas}')`, [
      ids.outra,
      'Outra',
    ]),
  );
  await migrar(banco.urlDono);
});

afterAll(async () => {
  await encerrarPool(dono);
  await encerrarPool(app);
  await banco?.parar();
  if (pastaParcial) rmSync(pastaParcial, { recursive: true, force: true });
});

describe('migration dos tipos de chamado de fábrica', () => {
  it('cada organização de antes ganha os 9 tipos de fábrica, Em uso, na ordem da spec, com o formulário de cada um', async () => {
    for (const orgId of [ids.org, ids.outra]) {
      const lidos = await tipos(orgId);
      expect(
        lidos.map(({ nome, icone, situacao, ordem, formulario }) => [
          nome,
          icone,
          formulario.campos.map(({ id }) => id),
          situacao,
          ordem,
        ]),
      ).toEqual(
        DE_FABRICA.map(([nome, icone, campos], posicao) => [
          nome,
          icone,
          campos,
          'em-uso',
          posicao + 1,
        ]),
      );
    }
  });

  it('os prazos e o "depois" de cada tipo, como na spec', async () => {
    const lidos = await tipos(ids.org);
    expect(
      lidos.map((lido) => [
        lido.nome,
        lido.modo,
        lido.resposta,
        lido.resolucao,
        lido.pode_virar_os,
        lido.gera_solicitacao,
        lido.pede_o_ativo,
        lido.so_a_ti_abre,
      ]),
    ).toEqual([
      ['Toner', 'corridas', '30 min', '8 h', false, 'toner', true, false],
      ['Computador', 'corridas', '30 min', '5 h', true, 'nao', true, false],
      ['Impressora', 'horario', '30 min', '8 h', true, 'nao', true, false],
      ['Acesso e senha', 'horario', '30 min', '4 h', false, 'nao', false, false],
      ['Software', 'corridas', '1 h', '24 h', false, 'nao', false, false],
      ['Rede e internet', 'corridas', '30 min', '8 h', false, 'nao', false, false],
      ['Telefone', 'corridas', '1 h', '10 h', false, 'nao', false, false],
      ['Outro', 'corridas', '1 h', '24 h', false, 'nao', false, false],
      ['Troca de equipamento', 'horario', '1 h', '3 d', true, 'nao', true, true],
    ]);
  });

  it('nenhum tipo tem quem atende por padrão: todos caem na triagem e aparecem para o colaborador, sem autor', async () => {
    const lidos = await tipos(ids.org);
    expect(lidos).toHaveLength(9);
    for (const lido of lidos) {
      expect(lido).toMatchObject({
        atende_por_padrao: null,
        sem_ninguem: 'triagem',
        tipo_de_ativo_do_equipamento: null,
        aparece_para_o_colaborador: true,
        duplicado_de: null,
        criado_por: null,
      });
    }
  });

  it('o módulo Chamados começa ligado nas organizações de antes, sem mudar os que elas desligaram', async () => {
    const { rows } = await dono.query<{ id: string; modulos_desligados: string[] }>(
      'select id, modulos_desligados from organizacoes where id = any($1) order by nome',
      [[ids.org, ids.outra]],
    );
    expect(rows).toEqual([
      { id: ids.org, modulos_desligados: [] },
      { id: ids.outra, modulos_desligados: ['salas'] },
    ]);
  });

  it('as tabelas que a gravação soltou voltam com o RLS ativo e forçado', async () => {
    expect(await tabelasSemIsolamento(dono)).toEqual([]);
  });

  it('o tipo é da organização: cada uma vê só os 9 dela', async () => {
    const daEmpresa = new Set((await tipos(ids.org)).map(({ id }) => id));
    const daOutra = await tipos(ids.outra);
    expect(daOutra).toHaveLength(9);
    expect(daOutra.filter(({ id }) => daEmpresa.has(id))).toEqual([]);
  });

  it('a organização criada depois da migration não ganha os tipos por ela: quem os grava é o comando que a cria', async () => {
    await emTransacao(dono, ids.nova, (c) =>
      c.query('insert into organizacoes (id, nome) values ($1, $2)', [ids.nova, 'Nova']),
    );
    expect(await tipos(ids.nova)).toEqual([]);
  });
});
