// O estoque (spec estoque, "Movimentação do estoque", "Saldo que nunca fica negativo" e "Mínimo do
// consumível no local"; change p4c-estoque, design, decisão 2): o livro-razão, só de inclusão para
// o papel da aplicação, com as checagens de cada tipo, e o saldo de cada consumível em cada local,
// nunca negativo, com o mínimo e o momento em que ficou abaixo dele, isolados pela organização.
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
const unico = (prefixo: string) => `${prefixo}${++nomes}`;

/** O erro do PostgreSQL de uma inclusão que devia ser recusada. */
async function recusada(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
  } catch (erro) {
    return (erro as { constraint?: string; message: string }).constraint ?? (erro as Error).message;
  }
  throw new Error('a inclusão não foi recusada');
}

const consumivel = (org: string) => {
  const codigo = unico('CF');
  return incluir('consumiveis', org, { codigo, codigo_normalizado: codigo, tipo: 'toner' });
};

const local = (org: string) => {
  const nome = unico('Almoxarifado ');
  return incluir('locais', org, { nome, nome_normalizado: nome.toLowerCase(), tipo: 'sala' });
};

const fornecedor = (org: string) => {
  const nome = unico('Fornecedor ');
  return incluir('fornecedores', org, { nome, nome_normalizado: nome.toLowerCase() });
};

async function ativo(org: string): Promise<string> {
  const nome = unico('Impressora ');
  const tipo = await incluir('tipos_de_ativo', org, {
    nome,
    nome_normalizado: nome.toLowerCase(),
    icone: 'impressora',
  });
  return incluir('ativos', org, { tipo_id: tipo, busca: unico('pat-') });
}

const conta = async (org: string) =>
  incluir('contas', org, {
    pessoa_id: await incluir('pessoas', org, { nome: unico('Pessoa ') }),
    usuario: unico('conta.'),
    hash_senha: 'hash',
  });

/** As referências de uma organização, para as movimentações dela. */
interface Referencias {
  consumivel: string;
  almoxarifado: string;
  expedicao: string;
  fornecedor: string;
  ativo: string;
  conta: string;
}

async function referencias(org: string): Promise<Referencias> {
  return {
    consumivel: await consumivel(org),
    almoxarifado: await local(org),
    expedicao: await local(org),
    fornecedor: await fornecedor(org),
    ativo: await ativo(org),
    conta: await conta(org),
  };
}

let deA: Referencias;
let deB: Referencias;

beforeAll(async () => {
  dono = new pg.Pool({ connectionString: inject('urlDono') });
  app = new pg.Pool({ connectionString: inject('urlApp') });
  orgA = await criarOrganizacao('Organização A');
  orgB = await criarOrganizacao('Organização B');
  deA = await referencias(orgA);
  deB = await referencias(orgB);
});

afterAll(async () => {
  await dono?.end();
  await app?.end();
});

const entrada = (org: string, r: Referencias, colunas: Record<string, unknown> = {}) =>
  incluir('movimentos_do_estoque', org, {
    tipo: 'entrada',
    consumivel_id: r.consumivel,
    quantidade: 10,
    destino_id: r.almoxarifado,
    fornecedor_id: r.fornecedor,
    nota_fiscal: '12345',
    lancado_por: r.conta,
    ...colunas,
  });

const saida = (org: string, r: Referencias, colunas: Record<string, unknown> = {}) =>
  incluir('movimentos_do_estoque', org, {
    tipo: 'saida',
    consumivel_id: r.consumivel,
    quantidade: 1,
    origem_id: r.almoxarifado,
    ativo_id: r.ativo,
    lancado_por: r.conta,
    ...colunas,
  });

const transferencia = (org: string, r: Referencias, colunas: Record<string, unknown> = {}) =>
  incluir('movimentos_do_estoque', org, {
    tipo: 'transferencia',
    consumivel_id: r.consumivel,
    quantidade: 3,
    origem_id: r.almoxarifado,
    destino_id: r.expedicao,
    lancado_por: r.conta,
    ...colunas,
  });

const ajuste = (org: string, r: Referencias, colunas: Record<string, unknown> = {}) =>
  incluir('movimentos_do_estoque', org, {
    tipo: 'ajuste',
    consumivel_id: r.consumivel,
    quantidade: 1,
    origem_id: r.almoxarifado,
    motivo: 'inventario',
    lancado_por: r.conta,
    ...colunas,
  });

const agora = new Date().toISOString();

const saldo = (org: string, r: Referencias, colunas: Record<string, unknown> = {}) =>
  incluir('saldos_do_estoque', org, {
    consumivel_id: r.consumivel,
    local_id: r.almoxarifado,
    ...colunas,
  });

describe('livro-razão do estoque', () => {
  it('lança os quatro tipos, com o momento e quem lançou', async () => {
    const id = await entrada(orgA, deA);
    await saida(orgA, deA, { contador_paginas: 45_210, contador_lido_em: '2026-10-21T14:32:00Z' });
    await saida(orgA, deA);
    await transferencia(orgA, deA);
    await ajuste(orgA, deA);
    await ajuste(orgA, deA, {
      origem_id: null,
      destino_id: deA.expedicao,
      motivo: 'outro',
      observacao: 'Achado na sala do CPD',
    });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query(
        `select tipo, quantidade, nota_fiscal, lancado_por = $2 as da_conta,
                momento > now() - interval '1 minute' as agora
           from movimentos_do_estoque where id = $1`,
        [id, deA.conta],
      ),
    );
    expect(rows).toEqual([
      { tipo: 'entrada', quantidade: 10, nota_fiscal: '12345', da_conta: true, agora: true },
    ]);
  });

  it('Movimentação lançada: o papel da aplicação não muda nem apaga', async () => {
    const id = await entrada(orgA, deA);
    await expect(
      emTransacao(app, orgA, (c) =>
        c.query('update movimentos_do_estoque set quantidade = 99 where id = $1', [id]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      emTransacao(app, orgA, (c) =>
        c.query('delete from movimentos_do_estoque where id = $1', [id]),
      ),
    ).rejects.toThrow(/permission denied/);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select quantidade from movimentos_do_estoque where id = $1', [id]),
    );
    expect(rows).toEqual([{ quantidade: 10 }]);
  });

  it('cada organização vê só as próprias movimentações', async () => {
    const daA = await entrada(orgA, deA);
    const daB = await entrada(orgB, deB);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select id from movimentos_do_estoque'),
    );
    expect(rows.map((r) => r.id)).toContain(daA);
    expect(rows.map((r) => r.id)).not.toContain(daB);
  });

  it('recusa as referências de outra organização', async () => {
    expect(await recusada(entrada(orgA, deA, { consumivel_id: deB.consumivel }))).toBe(
      'movimentos_do_estoque_consumivel_fk',
    );
    expect(await recusada(entrada(orgA, deA, { destino_id: deB.almoxarifado }))).toBe(
      'movimentos_do_estoque_destino_fk',
    );
    expect(await recusada(saida(orgA, deA, { origem_id: deB.almoxarifado }))).toBe(
      'movimentos_do_estoque_origem_fk',
    );
    expect(await recusada(entrada(orgA, deA, { fornecedor_id: deB.fornecedor }))).toBe(
      'movimentos_do_estoque_fornecedor_fk',
    );
    expect(await recusada(saida(orgA, deA, { ativo_id: deB.ativo }))).toBe(
      'movimentos_do_estoque_ativo_fk',
    );
    expect(await recusada(entrada(orgA, deA, { lancado_por: deB.conta }))).toBe(
      'movimentos_do_estoque_lancado_por_fk',
    );
  });

  it('confere o tipo, a quantidade, a nota, a observação, o motivo e o contador', async () => {
    expect(await recusada(entrada(orgA, deA, { tipo: 'emprestimo' }))).toBe(
      'movimentos_do_estoque_tipo_valido',
    );
    expect(await recusada(entrada(orgA, deA, { quantidade: 0 }))).toBe(
      'movimentos_do_estoque_quantidade_valida',
    );
    expect(await recusada(entrada(orgA, deA, { quantidade: 100_001 }))).toBe(
      'movimentos_do_estoque_quantidade_valida',
    );
    expect(await recusada(entrada(orgA, deA, { nota_fiscal: 'N'.repeat(41) }))).toBe(
      'movimentos_do_estoque_nota_valida',
    );
    expect(await recusada(entrada(orgA, deA, { nota_fiscal: ' ' }))).toBe(
      'movimentos_do_estoque_nota_valida',
    );
    expect(await recusada(entrada(orgA, deA, { observacao: 'O'.repeat(201) }))).toBe(
      'movimentos_do_estoque_observacao_valida',
    );
    expect(await recusada(entrada(orgA, deA, { observacao: '' }))).toBe(
      'movimentos_do_estoque_observacao_valida',
    );
    expect(await recusada(ajuste(orgA, deA, { motivo: 'furto' }))).toBe(
      'movimentos_do_estoque_motivo_valido',
    );
    expect(await recusada(saida(orgA, deA, { contador_paginas: 45_210 }))).toBe(
      'movimentos_do_estoque_contador_valido',
    );
    expect(
      await recusada(
        saida(orgA, deA, { contador_paginas: -1, contador_lido_em: '2026-10-21T14:32:00Z' }),
      ),
    ).toBe('movimentos_do_estoque_contador_valido');
    await entrada(orgA, deA, { quantidade: 100_000, nota_fiscal: 'N'.repeat(40) });
  });

  it('diz o que cada tipo preenche e o que fica vazio', async () => {
    const recusas = [
      () => entrada(orgA, deA, { destino_id: null }),
      () => entrada(orgA, deA, { fornecedor_id: null }),
      () => entrada(orgA, deA, { nota_fiscal: null }),
      () => entrada(orgA, deA, { origem_id: deA.expedicao }),
      () => entrada(orgA, deA, { ativo_id: deA.ativo }),
      () => saida(orgA, deA, { origem_id: null }),
      () => saida(orgA, deA, { ativo_id: null }),
      () => saida(orgA, deA, { destino_id: deA.expedicao }),
      () => saida(orgA, deA, { fornecedor_id: deA.fornecedor }),
      () => transferencia(orgA, deA, { destino_id: null }),
      () => transferencia(orgA, deA, { destino_id: deA.almoxarifado }),
      () => transferencia(orgA, deA, { motivo: 'inventario' }),
      () =>
        transferencia(orgA, deA, { contador_paginas: 1, contador_lido_em: '2026-10-21T14:32:00Z' }),
      () => ajuste(orgA, deA, { destino_id: deA.expedicao }),
      () => ajuste(orgA, deA, { origem_id: null }),
      () => ajuste(orgA, deA, { motivo: null }),
      () => ajuste(orgA, deA, { nota_fiscal: '12345' }),
    ];
    for (const recusa of recusas) {
      expect(await recusada(recusa())).toBe('movimentos_do_estoque_campos_do_tipo');
    }
  });

  it('Ajuste sem a observação: o motivo Outro exige a observação', async () => {
    expect(await recusada(ajuste(orgA, deA, { motivo: 'outro' }))).toBe(
      'movimentos_do_estoque_outro_com_observacao',
    );
    await ajuste(orgA, deA, { motivo: 'outro', observacao: 'Caixa amassada' });
  });

  it('tem os índices das leituras e das movimentações filtradas', async () => {
    const { rows } = await dono.query<{ indexname: string }>(
      "select indexname from pg_indexes where tablename = 'movimentos_do_estoque' order by 1",
    );
    expect(rows.map((r) => r.indexname)).toEqual([
      'movimentos_do_estoque_ativo_idx',
      'movimentos_do_estoque_consumivel_idx',
      'movimentos_do_estoque_destino_idx',
      'movimentos_do_estoque_fornecedor_idx',
      'movimentos_do_estoque_momento_idx',
      'movimentos_do_estoque_org_id_id_unico',
      'movimentos_do_estoque_origem_idx',
      'movimentos_do_estoque_pkey',
    ]);
  });
});

describe('saldos do estoque', () => {
  it('nasce com o saldo e o mínimo zerados, fora do mínimo', async () => {
    const r = { ...deA, consumivel: await consumivel(orgA) };
    const id = await saldo(orgA, r);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query(
        `select saldo, minimo, abaixo_desde, atualizado_em > now() - interval '1 minute' as agora
           from saldos_do_estoque where id = $1`,
        [id],
      ),
    );
    expect(rows).toEqual([{ saldo: 0, minimo: 0, abaixo_desde: null, agora: true }]);
  });

  it('tem um saldo só por consumível e local, na organização', async () => {
    const r = { ...deA, consumivel: await consumivel(orgA) };
    await saldo(orgA, r);
    expect(await recusada(saldo(orgA, r))).toBe('saldos_do_estoque_par_unico');
    await saldo(orgA, { ...r, almoxarifado: r.expedicao });
  });

  it('nunca fica negativo, e o mínimo vai de 0 a 100.000', async () => {
    const r = { ...deA, consumivel: await consumivel(orgA) };
    expect(await recusada(saldo(orgA, r, { saldo: -1 }))).toBe('saldos_do_estoque_saldo_valido');
    expect(await recusada(saldo(orgA, r, { minimo: -1 }))).toBe('saldos_do_estoque_minimo_valido');
    expect(await recusada(saldo(orgA, r, { minimo: 100_001, abaixo_desde: agora }))).toBe(
      'saldos_do_estoque_minimo_valido',
    );
    const id = await saldo(orgA, r, { saldo: 2 });
    await expect(
      emTransacao(app, orgA, (c) =>
        c.query('update saldos_do_estoque set saldo = saldo - 3 where id = $1', [id]),
      ),
    ).rejects.toThrow(/saldos_do_estoque_saldo_valido/);
  });

  it('o momento abaixo do mínimo existe só com o mínimo e o saldo abaixo dele', async () => {
    const r = { ...deA, consumivel: await consumivel(orgA) };
    expect(await recusada(saldo(orgA, r, { saldo: 4, minimo: 5 }))).toBe(
      'saldos_do_estoque_abaixo_do_minimo_coerente',
    );
    expect(await recusada(saldo(orgA, r, { saldo: 5, minimo: 5, abaixo_desde: agora }))).toBe(
      'saldos_do_estoque_abaixo_do_minimo_coerente',
    );
    expect(await recusada(saldo(orgA, r, { saldo: 0, minimo: 0, abaixo_desde: agora }))).toBe(
      'saldos_do_estoque_abaixo_do_minimo_coerente',
    );
    await saldo(orgA, r, { saldo: 0, minimo: 5, abaixo_desde: agora });
  });

  it('recusa o consumível e o local de outra organização', async () => {
    expect(await recusada(saldo(orgA, { ...deA, consumivel: deB.consumivel }))).toBe(
      'saldos_do_estoque_consumivel_fk',
    );
    expect(await recusada(saldo(orgA, { ...deA, almoxarifado: deB.almoxarifado }))).toBe(
      'saldos_do_estoque_local_fk',
    );
  });

  it('cada organização vê só os próprios saldos', async () => {
    const daB = await saldo(orgB, { ...deB, consumivel: await consumivel(orgB) });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select 1 from saldos_do_estoque where id = $1', [daB]),
    );
    expect(rows).toEqual([]);
  });

  it('o índice dos que estão abaixo do mínimo guarda só eles, os mais antigos primeiro', async () => {
    const { rows } = await dono.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where indexname = 'saldos_do_estoque_abaixo_idx'",
    );
    expect(rows[0]?.indexdef).toMatch(
      /\(org_id, abaixo_desde, id\) WHERE \(abaixo_desde IS NOT NULL\)/,
    );
  });
});
