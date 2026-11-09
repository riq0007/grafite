// Os alertas (spec alertas; change p3a-regras-e-alertas, design, decisão 3): as regras da
// organização, com a chave da regra de fábrica, os alertas de um ativo ou de um coletor, que nunca
// têm dois iguais não resolvidos, e o silêncio de um ativo, isolados pela organização.
import { createHash } from 'node:crypto';
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
const unico = (prefixo: string) => `${prefixo} ${++nomes}`;

const conta = async (org: string) =>
  incluir('contas', org, {
    pessoa_id: await incluir('pessoas', org, { nome: unico('Pessoa') }),
    usuario: unico('conta').replace(' ', '.'),
    hash_senha: 'hash',
  });

const ativo = async (org: string) => {
  const nome = unico('Tipo');
  const tipo = await incluir('tipos_de_ativo', org, {
    nome,
    nome_normalizado: nome.toLowerCase(),
    icone: 'impressora',
  });
  return incluir('ativos', org, { tipo_id: tipo, busca: unico('ativo') });
};

const coletor = (org: string) => {
  const nome = unico('Coletor');
  return incluir('coletores', org, {
    nome,
    nome_normalizado: nome.toLowerCase(),
    token_hash: createHash('sha256').update(nome).digest(),
  });
};

const regra = (org: string, colunas: Record<string, unknown> = {}) => {
  const nome = unico('Regra');
  return incluir('regras_de_alerta', org, {
    nome,
    nome_normalizado: nome.toLowerCase(),
    condicao: 'toner.nivel',
    parametros: JSON.stringify({ limite: 10, folga: 5 }),
    severidade: 'critico',
    ...colunas,
  });
};

const alerta = async (org: string, colunas: Record<string, unknown>) =>
  incluir('alertas', org, {
    situacao: 'aberto',
    severidade: 'critico',
    texto: 'Toner preto em 8%',
    observado_em: new Date('2026-10-14T10:00:00.000Z'),
    aberto_em: new Date('2026-10-14T10:00:00.000Z'),
    ...colunas,
  });

/** O erro do PostgreSQL de uma inclusão que devia ser recusada. */
async function recusada(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
  } catch (erro) {
    return (erro as { constraint?: string; message: string }).constraint ?? (erro as Error).message;
  }
  throw new Error('a inclusão não foi recusada');
}

beforeAll(async () => {
  dono = new pg.Pool({ connectionString: inject('urlDono') });
  app = new pg.Pool({ connectionString: inject('urlApp') });
  orgA = await criarOrganizacao('Organização A');
  orgB = await criarOrganizacao('Organização B');
});

afterAll(async () => {
  await dono?.end();
  await app?.end();
});

describe('regras de alerta', () => {
  it('cada organização vê só as próprias regras', async () => {
    const deA = await regra(orgA);
    const deB = await regra(orgB);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select id from regras_de_alerta'),
    );
    expect(rows.map((r) => r.id)).toContain(deA);
    expect(rows.map((r) => r.id)).not.toContain(deB);
  });

  it('nasce ativa, para a organização inteira, sem duração e sem a chave de fábrica', async () => {
    const id = await regra(orgA);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query(
        'select situacao, escopo, escopo_id, duracao, fabrica from regras_de_alerta where id = $1',
        [id],
      ),
    );
    expect(rows).toEqual([
      { situacao: 'ativa', escopo: 'organizacao', escopo_id: null, duracao: 0, fabrica: null },
    ]);
  });

  it('recusa o nome repetido na organização, e aceita o mesmo nome em outra', async () => {
    await regra(orgA, { nome: 'Toner baixo', nome_normalizado: 'toner baixo' });
    expect(
      await recusada(regra(orgA, { nome: 'Toner Baixo', nome_normalizado: 'toner baixo' })),
    ).toBe('regras_de_alerta_nome_unico');
    await regra(orgB, { nome: 'Toner baixo', nome_normalizado: 'toner baixo' });
  });

  it('a regra de fábrica entra uma vez por organização', async () => {
    await regra(orgA, { fabrica: 'toner-10' });
    expect(await recusada(regra(orgA, { fabrica: 'toner-10' }))).toBe(
      'regras_de_alerta_fabrica_unica',
    );
    await regra(orgB, { fabrica: 'toner-10' });
  });

  it('confere a condição, a severidade, a duração e o escopo', async () => {
    expect(await recusada(regra(orgA, { condicao: 'cpu.uso' }))).toBe(
      'regras_de_alerta_condicao_valida',
    );
    expect(await recusada(regra(orgA, { severidade: 'grave' }))).toBe(
      'regras_de_alerta_severidade_valida',
    );
    expect(await recusada(regra(orgA, { duracao: 1441 }))).toBe('regras_de_alerta_duracao_valida');
    expect(await recusada(regra(orgA, { escopo: 'tipo' }))).toBe(
      'regras_de_alerta_escopo_com_o_registro',
    );
    expect(await recusada(regra(orgA, { escopo_id: '0199d3a0-0000-7000-8000-000000000001' }))).toBe(
      'regras_de_alerta_escopo_com_o_registro',
    );
    expect(await recusada(regra(orgA, { parametros: JSON.stringify([1]) }))).toBe(
      'regras_de_alerta_parametros_validos',
    );
  });
});

describe('alertas', () => {
  it('cada organização vê só os próprios alertas', async () => {
    const deA = await alerta(orgA, { regra_id: await regra(orgA), ativo_id: await ativo(orgA) });
    const deB = await alerta(orgB, { regra_id: await regra(orgB), ativo_id: await ativo(orgB) });
    const { rows } = await emTransacao(app, orgA, (c) => c.query('select id from alertas'));
    expect(rows.map((r) => r.id)).toContain(deA);
    expect(rows.map((r) => r.id)).not.toContain(deB);
  });

  it('é de um ativo ou de um coletor, nunca dos dois nem de nenhum', async () => {
    const daRegra = await regra(orgA);
    expect(await recusada(alerta(orgA, { regra_id: daRegra }))).toBe('alertas_um_alvo');
    expect(
      await recusada(
        alerta(orgA, {
          regra_id: daRegra,
          ativo_id: await ativo(orgA),
          coletor_id: await coletor(orgA),
        }),
      ),
    ).toBe('alertas_um_alvo');
    await alerta(orgA, { regra_id: daRegra, coletor_id: await coletor(orgA), item: '' });
  });

  it('nunca tem dois iguais não resolvidos, nem o pendente e o aberto', async () => {
    const daRegra = await regra(orgA);
    const doAtivo = await ativo(orgA);
    await alerta(orgA, { regra_id: daRegra, ativo_id: doAtivo, item: '1' });
    expect(
      await recusada(
        alerta(orgA, {
          regra_id: daRegra,
          ativo_id: doAtivo,
          item: '1',
          situacao: 'pendente',
          aberto_em: null,
        }),
      ),
    ).toBe('alertas_um_nao_resolvido');
    // Outro item, outro ativo e outra regra são outros alertas.
    await alerta(orgA, { regra_id: daRegra, ativo_id: doAtivo, item: '2' });
    await alerta(orgA, { regra_id: daRegra, ativo_id: await ativo(orgA), item: '1' });
    await alerta(orgA, { regra_id: await regra(orgA), ativo_id: doAtivo, item: '1' });
  });

  it('o resolvido deixa abrir outro igual', async () => {
    const daRegra = await regra(orgA);
    const doAtivo = await ativo(orgA);
    await alerta(orgA, {
      regra_id: daRegra,
      ativo_id: doAtivo,
      situacao: 'resolvido',
      resolvido_em: new Date('2026-10-14T11:00:00.000Z'),
      como_terminou: 'voltou-ao-normal',
    });
    await alerta(orgA, { regra_id: daRegra, ativo_id: doAtivo });
  });

  it('confere as datas de cada situação, o texto, o reconhecimento e o adiamento', async () => {
    const daRegra = await regra(orgA);
    const novo = async (colunas: Record<string, unknown>) =>
      alerta(orgA, { regra_id: daRegra, ativo_id: await ativo(orgA), ...colunas });
    expect(await recusada(novo({ aberto_em: null }))).toBe('alertas_aberto_com_a_abertura');
    expect(await recusada(novo({ situacao: 'pendente' }))).toBe('alertas_aberto_com_a_abertura');
    expect(await recusada(novo({ situacao: 'resolvido' }))).toBe('alertas_resolvido_com_o_fim');
    expect(
      await recusada(novo({ resolvido_em: new Date(), como_terminou: 'voltou-ao-normal' })),
    ).toBe('alertas_resolvido_com_o_fim');
    expect(await recusada(novo({ texto: '' }))).toBe('alertas_texto_valido');
    expect(await recusada(novo({ texto: 'x'.repeat(201) }))).toBe('alertas_texto_valido');
    expect(await recusada(novo({ reconhecido_em: new Date() }))).toBe(
      'alertas_reconhecimento_completo',
    );
    expect(await recusada(novo({ adiado_ate: new Date() }))).toBe('alertas_adiamento_completo');
    const quem = await conta(orgA);
    const reconhecido = await novo({
      reconhecido_por: quem,
      reconhecido_em: new Date(),
      adiado_por: quem,
      adiado_ate: new Date(),
    });
    expect(reconhecido).not.toBe('');
  });
});

describe('silêncio dos ativos', () => {
  it('um por ativo, isolado pela organização, com o motivo curto', async () => {
    const doAtivo = await ativo(orgA);
    const quem = await conta(orgA);
    const id = await incluir('silencios_dos_ativos', orgA, {
      ativo_id: doAtivo,
      ate: null,
      motivo: 'Impressora fiscal',
      criado_por: quem,
    });
    expect(
      await recusada(
        incluir('silencios_dos_ativos', orgA, {
          ativo_id: doAtivo,
          ate: new Date('2026-10-20T21:00:00.000Z'),
          criado_por: quem,
        }),
      ),
    ).toBe('silencios_dos_ativos_um_por_ativo');
    expect(
      await recusada(
        incluir('silencios_dos_ativos', orgA, {
          ativo_id: await ativo(orgA),
          motivo: 'x'.repeat(201),
          criado_por: quem,
        }),
      ),
    ).toBe('silencios_dos_ativos_motivo_valido');
    const { rows } = await emTransacao(app, orgB, (c) =>
      c.query('select id from silencios_dos_ativos'),
    );
    expect(rows.map((r) => r.id)).not.toContain(id);
  });
});
