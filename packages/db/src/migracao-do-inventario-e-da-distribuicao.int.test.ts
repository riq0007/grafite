// O inventário, a distribuição e o agente no banco (spec distribuicao-de-software e
// inventario-pelo-agente; change software-por-pacote, design, decisões 1, 6, 7, 8, 8a, 9 e 11): o
// programa do ativo ganha o nome normalizado, que casa com o pacote, e o "do sistema"; a
// distribuição, o quando, o momento, o fuso e o "para quem"; a máquina, a situação "tirada", o
// código de saída e o último chamado; o agente, até quando ele volta; e o cadastro dos agentes, o
// prazo do sem contato. Os dados de antes ficam como estavam: a distribuição é de agora, e o prazo,
// o de fábrica.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type BancoDeTeste, encerrarPool, iniciarBancoDeTeste } from '../test/banco-de-teste.ts';
import { tabelasSemIsolamento } from './guarda.ts';
import { migrar, pastaMigracoes } from './migrar.ts';

const MIGRACAO = '0058_inventario_distribuicao_e_agente';

/** Os nomes do inventário de antes e o normalizado que a migration grava em cada um. */
const PROGRAMAS: [string, string][] = [
  ['  Configuração   do Office ', 'configuracao do office'],
  ['ÁUDIO Ótimo Ção', 'audio otimo cao'],
  ['7-Zip 23.01 (x64)', '7-zip 23.01 (x64)'],
  ['Microsoft\tEdge', 'microsoft edge'],
];

/** Uma cópia das migrations sem a do inventário e da distribuição e as seguintes. */
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
  conta: '',
  tipo: '',
  ativo: '',
  agente: '',
  pacote: '',
  distribuicao: '',
  maquina: '',
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

/** Uma consulta do papel da aplicação na organização. */
const naEmpresa = (texto: string, valores: unknown[] = []) =>
  emTransacao(app, ids.org, (c) => c.query(texto, valores)).then(({ rows }) => rows);

/** Uma distribuição nova, com o quando, o momento e o fuso dados. */
const distribuir = (quando: string, aPartirDe: string | null, fuso: string | null) =>
  naEmpresa(
    `insert into distribuicoes (org_id, pacote_id, criada_por, quando, a_partir_de, fuso)
     values ($1, $2, $3, $4, $5, $6)`,
    [ids.org, ids.pacote, ids.conta, quando, aPartirDe, fuso],
  );

beforeAll(async () => {
  banco = await iniciarBancoDeTeste({ aplicarMigracoes: false });
  dono = new pg.Pool({ connectionString: banco.urlDono });
  app = new pg.Pool({ connectionString: banco.urlApp });
  pastaParcial = migracoesAnteriores();
  await migrar(banco.urlDono, pastaParcial);
  // Uma organização de antes, com um computador inventariado pelo agente, o cadastro automático
  // e uma distribuição com a máquina aguardando o agente.
  for (const chave of Object.keys(ids) as (keyof typeof ids)[]) ids[chave] = await novoId();
  await emTransacao(dono, ids.org, async (c) => {
    await c.query('insert into organizacoes (id, nome) values ($1, $2)', [ids.org, 'Empresa']);
    await c.query('insert into pessoas (id, org_id, nome) values ($1, $2, $3)', [
      ids.pessoa,
      ids.org,
      'Técnica',
    ]);
    await c.query(
      `insert into contas (id, org_id, pessoa_id, usuario, hash_senha)
       values ($1, $2, $3, 'tecnica', 'hash')`,
      [ids.conta, ids.org, ids.pessoa],
    );
    await c.query(
      `insert into tipos_de_ativo (id, org_id, nome, nome_normalizado, icone)
       values ($1, $2, 'Computador', 'computador', 'computador')`,
      [ids.tipo, ids.org],
    );
    await c.query(
      `insert into ativos (id, org_id, tipo_id, nome, busca)
       values ($1, $2, $3, 'Computador 1', 'computador 1')`,
      [ids.ativo, ids.org, ids.tipo],
    );
    await c.query(
      `insert into agentes (id, org_id, deviceid, nome, ip, ativo_id)
       values ($1, $2, 'computador-1-2026-11-14-10-00-00', 'Computador 1', '10.0.0.7', $3)`,
      [ids.agente, ids.org, ids.ativo],
    );
    for (const [nome] of PROGRAMAS) {
      await c.query(
        `insert into softwares_dos_ativos (org_id, ativo_id, nome, inventariado_em)
         values ($1, $2, $3, now())`,
        [ids.org, ids.ativo, nome],
      );
    }
    await c.query('insert into cadastro_dos_agentes (org_id, tipo_id) values ($1, $2)', [
      ids.org,
      ids.tipo,
    ]);
    await c.query(
      `insert into pacotes_de_software
         (id, org_id, nome, nome_normalizado, nome_no_inventario_normalizado, comando)
       values ($1, $2, '7-Zip', '7-zip', '7-zip', 'msiexec /i 7z.msi /qn')`,
      [ids.pacote, ids.org],
    );
    await c.query(
      'insert into distribuicoes (id, org_id, pacote_id, criada_por) values ($1, $2, $3, $4)',
      [ids.distribuicao, ids.org, ids.pacote, ids.conta],
    );
    await c.query(
      `insert into maquinas_das_distribuicoes (id, org_id, distribuicao_id, ativo_id, agente_id)
       values ($1, $2, $3, $4, $5)`,
      [ids.maquina, ids.org, ids.distribuicao, ids.ativo, ids.agente],
    );
  });
  await migrar(banco.urlDono);
});

afterAll(async () => {
  await encerrarPool(dono);
  await encerrarPool(app);
  await banco?.parar();
  if (pastaParcial) rmSync(pastaParcial, { recursive: true, force: true });
});

describe('migration do inventário, da distribuição e do agente', () => {
  it('o programa de antes ganha o nome sem acento, em minúsculas e com os espaços juntados, e não é do sistema', async () => {
    // A ordem vem do JavaScript, e não da colação do banco.
    const lidos = (
      await naEmpresa('select nome, nome_normalizado, do_sistema from softwares_dos_ativos')
    ).sort((a, b) => (a.nome < b.nome ? -1 : 1));
    expect(lidos).toEqual(
      [...PROGRAMAS]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([nome, normalizado]) => ({
          nome,
          nome_normalizado: normalizado,
          do_sistema: false,
        })),
    );
  });

  it('a distribuição de antes é de agora, sem o dia, o fuso e o "para quem"', async () => {
    expect(
      await naEmpresa('select quando, a_partir_de, fuso, para_quem from distribuicoes'),
    ).toEqual([{ quando: 'agora', a_partir_de: null, fuso: null, para_quem: null }]);
  });

  it('a máquina de antes fica sem o código de saída e sem o chamado, e o agente, sem a volta', async () => {
    expect(
      await naEmpresa(
        `select situacao, codigo_de_saida, chamada_em, chamada_respondeu
           from maquinas_das_distribuicoes`,
      ),
    ).toEqual([
      { situacao: 'aguardando', codigo_de_saida: null, chamada_em: null, chamada_respondeu: null },
    ]);
    expect(await naEmpresa('select volta_ate from agentes')).toEqual([{ volta_ate: null }]);
  });

  it('o cadastro dos agentes fica com o prazo de fábrica de 2 dias, que vai de 1 a 30', async () => {
    expect(await naEmpresa('select dias_sem_contato from cadastro_dos_agentes')).toEqual([
      { dias_sem_contato: 2 },
    ]);
    const prazo = (dias: number) =>
      naEmpresa('update cadastro_dos_agentes set dias_sem_contato = $1', [dias]);
    await expect(prazo(0)).rejects.toThrow(/cadastro_dos_agentes_dias_sem_contato_valido/);
    await expect(prazo(31)).rejects.toThrow(/cadastro_dos_agentes_dias_sem_contato_valido/);
    await prazo(30);
    expect(await naEmpresa('select dias_sem_contato from cadastro_dos_agentes')).toEqual([
      { dias_sem_contato: 30 },
    ]);
  });

  it('o quando é agora, noite ou dia; só o dia tem o momento, e a noite e o dia têm o fuso', async () => {
    const amanha = '2026-11-15T22:00:00-03:00';
    await expect(distribuir('semana', null, 'America/Sao_Paulo')).rejects.toThrow(
      /distribuicoes_quando_valido/,
    );
    await expect(distribuir('dia', null, 'America/Sao_Paulo')).rejects.toThrow(
      /distribuicoes_a_partir_de_valido/,
    );
    await expect(distribuir('agora', amanha, 'America/Sao_Paulo')).rejects.toThrow(
      /distribuicoes_a_partir_de_valido/,
    );
    await expect(distribuir('noite', null, null)).rejects.toThrow(/distribuicoes_fuso_valido/);
    await expect(distribuir('dia', amanha, null)).rejects.toThrow(/distribuicoes_fuso_valido/);
    await distribuir('noite', null, 'America/Sao_Paulo');
    await distribuir('dia', amanha, 'America/Sao_Paulo');
    await distribuir('agora', null, null);
  });

  it('a máquina sai da fila, guarda o código e tem o chamado com o momento e a resposta juntos', async () => {
    await naEmpresa(
      `update maquinas_das_distribuicoes
          set situacao = 'tirada', codigo_de_saida = 2147944003, terminada_em = now()`,
    );
    expect(
      await naEmpresa('select situacao, codigo_de_saida from maquinas_das_distribuicoes'),
    ).toEqual([{ situacao: 'tirada', codigo_de_saida: '2147944003' }]);
    await expect(
      naEmpresa('update maquinas_das_distribuicoes set chamada_em = now()'),
    ).rejects.toThrow(/maquinas_das_distribuicoes_chamada_valida/);
    await naEmpresa(
      'update maquinas_das_distribuicoes set chamada_em = now(), chamada_respondeu = false',
    );
    await expect(
      naEmpresa("update maquinas_das_distribuicoes set situacao = 'sumiu'"),
    ).rejects.toThrow(/maquinas_das_distribuicoes_situacao_valida/);
  });

  it('as tabelas que a migration mexeu seguem com o RLS ativo e forçado', async () => {
    expect(await tabelasSemIsolamento(dono)).toEqual([]);
  });
});
