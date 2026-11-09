// As ordens de serviço (spec ordens-de-servico; change p4e-ordens-de-servico, design, decisão 2): a
// OS, que o papel da aplicação não apaga, com as checagens de cada situação e uma OS por
// solicitação; o histórico das situações e as peças, só de inclusão; e a numeração por
// organização, separada da das solicitações. Todas isoladas pela organização.
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

/** O erro do PostgreSQL de uma mudança que devia ser recusada: a checagem, ou a mensagem. */
async function recusada(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
  } catch (erro) {
    return (erro as { constraint?: string; message: string }).constraint ?? (erro as Error).message;
  }
  throw new Error('a mudança não foi recusada');
}

/** Executa um comando com o papel da aplicação, no contexto da organização. */
const executar = (org: string, comando: string, valores: unknown[]) =>
  emTransacao(app, org, (c) => c.query(comando, valores));

const pessoa = (org: string) => incluir('pessoas', org, { nome: unico('Pessoa ') });

/** As referências de uma organização, para as OS dela. */
interface Referencias {
  pessoa: string;
  conta: string;
  local: string;
  ativo: string;
  peca: string;
  fornecedor: string;
}

async function referencias(org: string): Promise<Referencias> {
  const nomeDoLocal = unico('Local ');
  const nomeDoTipo = unico('Tipo ');
  const tipo = await incluir('tipos_de_ativo', org, {
    nome: nomeDoTipo,
    nome_normalizado: nomeDoTipo.toLowerCase(),
    icone: 'notebook',
  });
  const codigo = unico('FNT');
  const nomeDoFornecedor = unico('Fornecedor ');
  return {
    pessoa: await pessoa(org),
    conta: await incluir('contas', org, {
      pessoa_id: await pessoa(org),
      usuario: unico('conta.'),
      hash_senha: 'hash',
    }),
    local: await incluir('locais', org, {
      nome: nomeDoLocal,
      nome_normalizado: nomeDoLocal.toLowerCase(),
      tipo: 'sala',
    }),
    ativo: await incluir('ativos', org, { tipo_id: tipo, busca: unico('nb-') }),
    peca: await incluir('consumiveis', org, {
      codigo,
      codigo_normalizado: codigo,
      tipo: 'peca',
    }),
    fornecedor: await incluir('fornecedores', org, {
      nome: nomeDoFornecedor,
      nome_normalizado: nomeDoFornecedor.toLowerCase(),
    }),
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

let numeros = 1000;

const ordem = (org: string, r: Referencias, colunas: Record<string, unknown> = {}) =>
  incluir('ordens_de_servico', org, {
    numero: ++numeros,
    ativo_id: r.ativo,
    local_id: r.local,
    problema: 'Não liga',
    situacao: 'aberta',
    aberta_por: r.conta,
    ...colunas,
  });

const conserto = (org: string, r: Referencias) =>
  incluir('solicitacoes', org, {
    numero: ++numeros,
    tipo: 'conserto',
    situacao: 'em-atendimento',
    pessoa_id: r.pessoa,
    ativo_id: r.ativo,
    defeito: 'Não liga',
    locais: [r.local],
    registrada_por: r.conta,
  });

const mudanca = (org: string, r: Referencias, ordemId: string, colunas = {}) =>
  incluir('historico_das_ordens', org, {
    ordem_id: ordemId,
    situacao: 'aberta',
    mudada_por: r.conta,
    ...colunas,
  });

/** Uma saída do estoque, para a peça apontar. */
const saida = (org: string, r: Referencias) =>
  incluir('movimentos_do_estoque', org, {
    tipo: 'saida',
    consumivel_id: r.peca,
    quantidade: 1,
    origem_id: r.local,
    ativo_id: r.ativo,
    observacao: 'OS 12',
    lancado_por: r.conta,
  });

const peca = async (org: string, r: Referencias, ordemId: string, colunas = {}) =>
  incluir('pecas_das_ordens', org, {
    ordem_id: ordemId,
    consumivel_id: r.peca,
    quantidade: 1,
    local_id: r.local,
    movimento_id: await saida(org, r),
    lancada_por: r.conta,
    ...colunas,
  });

const agora = () => new Date().toISOString();

describe('ordens de serviço', () => {
  it('Manutenção achada pela TI: a OS nasce no ativo, com o local, o problema e quem abriu', async () => {
    const id = await ordem(orgA, deA, { problema: 'Teclado falhando' });
    const { rows } = await executar(
      orgA,
      `select situacao, ativo_id, local_id, problema, aberta_por, aberta_em is not null as momento
       from ordens_de_servico where id = $1`,
      [id],
    );
    expect(rows).toEqual([
      {
        situacao: 'aberta',
        ativo_id: deA.ativo,
        local_id: deA.local,
        problema: 'Teclado falhando',
        aberta_por: deA.conta,
        momento: true,
      },
    ]);
    await ordem(orgA, deA, { local_id: null });
  });

  it('a OS não se apaga: o papel da aplicação muda a OS e não a apaga', async () => {
    const id = await ordem(orgA, deA);
    expect(
      await recusada(executar(orgA, 'delete from ordens_de_servico where id = $1', [id])),
    ).toMatch(/permission denied/);
    await executar(orgA, "update ordens_de_servico set situacao = 'em-atendimento' where id = $1", [
      id,
    ]);
  });

  it('o número é único na organização, e outra organização repete o número', async () => {
    const numero = ++numeros;
    await ordem(orgA, deA, { numero });
    expect(await recusada(ordem(orgA, deA, { numero }))).toBe('ordens_de_servico_numero_unico');
    await ordem(orgB, deB, { numero });
  });

  it('uma OS por solicitação, e muitas sem solicitação', async () => {
    const solicitacao = await conserto(orgA, deA);
    await ordem(orgA, deA, { solicitacao_id: solicitacao });
    expect(await recusada(ordem(orgA, deA, { solicitacao_id: solicitacao }))).toBe(
      'ordens_de_servico_solicitacao_unica',
    );
    await ordem(orgA, deA);
    await ordem(orgA, deA);
  });

  it('cada organização vê só as próprias OS', async () => {
    const id = await ordem(orgB, deB);
    const { rows } = await executar(orgA, 'select id from ordens_de_servico where id = $1', [id]);
    expect(rows).toEqual([]);
  });

  it('recusa as referências de outra organização', async () => {
    expect(await recusada(ordem(orgA, deA, { ativo_id: deB.ativo }))).toBe(
      'ordens_de_servico_ativo_fk',
    );
    expect(await recusada(ordem(orgA, deA, { local_id: deB.local }))).toBe(
      'ordens_de_servico_local_fk',
    );
    expect(await recusada(ordem(orgA, deA, { solicitacao_id: await conserto(orgB, deB) }))).toBe(
      'ordens_de_servico_solicitacao_fk',
    );
    expect(
      await recusada(
        ordem(orgA, deA, { situacao: 'aguardando-fornecedor', fornecedor_id: deB.fornecedor }),
      ),
    ).toBe('ordens_de_servico_fornecedor_fk');
    expect(await recusada(ordem(orgA, deA, { aberta_por: deB.conta }))).toBe(
      'ordens_de_servico_aberta_por_fk',
    );
  });

  it('confere a situação e o tamanho dos textos', async () => {
    expect(await recusada(ordem(orgA, deA, { situacao: 'pausada' }))).toBe(
      'ordens_de_servico_situacao_valida',
    );
    expect(await recusada(ordem(orgA, deA, { problema: ' ' }))).toBe(
      'ordens_de_servico_textos_validos',
    );
    expect(await recusada(ordem(orgA, deA, { problema: 'a'.repeat(1001) }))).toBe(
      'ordens_de_servico_textos_validos',
    );
    expect(
      await recusada(
        ordem(orgA, deA, {
          situacao: 'aguardando-fornecedor',
          fornecedor_id: deA.fornecedor,
          os_do_fornecedor: 'a'.repeat(41),
        }),
      ),
    ).toBe('ordens_de_servico_textos_validos');
  });

  it('a Aguardando fornecedor tem o fornecedor, e a OS dele pede o fornecedor', async () => {
    expect(await recusada(ordem(orgA, deA, { situacao: 'aguardando-fornecedor' }))).toBe(
      'ordens_de_servico_fornecedor_coerente',
    );
    expect(await recusada(ordem(orgA, deA, { os_do_fornecedor: 'DL-5521' }))).toBe(
      'ordens_de_servico_fornecedor_coerente',
    );
    // O fornecedor fica na OS que sai de Aguardando fornecedor e na resolvida.
    await ordem(orgA, deA, {
      situacao: 'em-atendimento',
      fornecedor_id: deA.fornecedor,
      os_do_fornecedor: 'DL-5521',
    });
  });

  it('a Resolvida tem o que foi feito, quem e quando, e a em aberto não tem a resolução', async () => {
    const resolucao = {
      solucao: 'Fonte trocada',
      resolvida_por: deA.conta,
      resolvida_em: agora(),
    };
    await ordem(orgA, deA, { situacao: 'resolvida', ...resolucao });
    expect(await recusada(ordem(orgA, deA, { situacao: 'resolvida' }))).toBe(
      'ordens_de_servico_resolucao_coerente',
    );
    expect(
      await recusada(ordem(orgA, deA, { situacao: 'resolvida', ...resolucao, solucao: null })),
    ).toBe('ordens_de_servico_resolucao_coerente');
    expect(await recusada(ordem(orgA, deA, { situacao: 'em-atendimento', ...resolucao }))).toBe(
      'ordens_de_servico_resolucao_coerente',
    );
  });

  it('a Encerrada tem quem e quando e, sem resolver, o motivo', async () => {
    const encerramento = { encerrada_por: deA.conta, encerrada_em: agora() };
    const resolucao = {
      solucao: 'Fonte trocada',
      resolvida_por: deA.conta,
      resolvida_em: agora(),
    };
    await ordem(orgA, deA, { situacao: 'encerrada', ...resolucao, ...encerramento });
    await ordem(orgA, deA, {
      situacao: 'encerrada',
      motivo_do_encerramento: 'Aberta no ativo errado',
      ...encerramento,
    });
    expect(await recusada(ordem(orgA, deA, { situacao: 'encerrada', ...resolucao }))).toBe(
      'ordens_de_servico_encerramento_coerente',
    );
    expect(await recusada(ordem(orgA, deA, { situacao: 'encerrada', ...encerramento }))).toBe(
      'ordens_de_servico_encerramento_coerente',
    );
    expect(
      await recusada(
        ordem(orgA, deA, {
          situacao: 'encerrada',
          motivo_do_encerramento: 'Duplicada',
          ...resolucao,
          ...encerramento,
        }),
      ),
    ).toBe('ordens_de_servico_encerramento_coerente');
    expect(await recusada(ordem(orgA, deA, { motivo_do_encerramento: 'Duplicada' }))).toBe(
      'ordens_de_servico_encerramento_coerente',
    );
    expect(
      await recusada(
        ordem(orgA, deA, {
          situacao: 'encerrada',
          motivo_do_encerramento: 'a'.repeat(201),
          ...encerramento,
        }),
      ),
    ).toBe('ordens_de_servico_textos_validos');
  });

  it('tem os índices da lista, das situações, do ativo e dos locais', async () => {
    const { rows } = await dono.query<{ indexname: string }>(
      `select indexname from pg_indexes
       where tablename in ('ordens_de_servico', 'historico_das_ordens', 'pecas_das_ordens')
       order by indexname`,
    );
    expect(rows.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        'ordens_de_servico_aberta_idx',
        'ordens_de_servico_situacao_idx',
        'ordens_de_servico_ativo_idx',
        'ordens_de_servico_local_idx',
        'historico_das_ordens_ordem_idx',
        'pecas_das_ordens_ordem_idx',
      ]),
    );
  });
});

describe('histórico das situações', () => {
  it('guarda a situação, o texto, quem mudou e quando, e só cresce', async () => {
    const id = await ordem(orgA, deA);
    await mudanca(orgA, deA, id);
    const mudou = await mudanca(orgA, deA, id, {
      situacao: 'aguardando-peca',
      texto: 'Fonte pedida ao almoxarifado',
    });
    const { rows } = await executar(
      orgA,
      `select situacao, texto, mudada_por, mudada_em is not null as momento
       from historico_das_ordens where ordem_id = $1 order by mudada_em, id`,
      [id],
    );
    expect(rows).toEqual([
      { situacao: 'aberta', texto: null, mudada_por: deA.conta, momento: true },
      {
        situacao: 'aguardando-peca',
        texto: 'Fonte pedida ao almoxarifado',
        mudada_por: deA.conta,
        momento: true,
      },
    ]);
    expect(
      await recusada(
        executar(orgA, "update historico_das_ordens set texto = 'outro' where id = $1", [mudou]),
      ),
    ).toMatch(/permission denied/);
    expect(
      await recusada(executar(orgA, 'delete from historico_das_ordens where id = $1', [mudou])),
    ).toMatch(/permission denied/);
  });

  it('confere a situação, o texto, o fornecedor da Aguardando fornecedor e a OS', async () => {
    const id = await ordem(orgA, deA);
    expect(await recusada(mudanca(orgA, deA, id, { situacao: 'pausada' }))).toBe(
      'historico_das_ordens_situacao_valida',
    );
    expect(await recusada(mudanca(orgA, deA, id, { texto: ' ' }))).toBe(
      'historico_das_ordens_texto_valido',
    );
    expect(await recusada(mudanca(orgA, deA, id, { texto: 'a'.repeat(1001) }))).toBe(
      'historico_das_ordens_texto_valido',
    );
    expect(await recusada(mudanca(orgA, deA, id, { situacao: 'aguardando-fornecedor' }))).toBe(
      'historico_das_ordens_fornecedor_coerente',
    );
    expect(await recusada(mudanca(orgA, deA, id, { fornecedor_id: deA.fornecedor }))).toBe(
      'historico_das_ordens_fornecedor_coerente',
    );
    await mudanca(orgA, deA, id, {
      situacao: 'aguardando-fornecedor',
      fornecedor_id: deA.fornecedor,
    });
    expect(await recusada(mudanca(orgA, deA, await ordem(orgB, deB)))).toBe(
      'historico_das_ordens_ordem_fk',
    );
  });
});

describe('peças das OS', () => {
  it('Fonte trocada: a peça aponta para a saída do estoque, uma vez, e só cresce', async () => {
    const id = await ordem(orgA, deA);
    const lancada = await peca(orgA, deA, id);
    const { rows } = await executar(
      orgA,
      `select consumivel_id, quantidade, local_id, lancada_por, lancada_em is not null as momento
       from pecas_das_ordens where id = $1`,
      [lancada],
    );
    expect(rows).toEqual([
      {
        consumivel_id: deA.peca,
        quantidade: 1,
        local_id: deA.local,
        lancada_por: deA.conta,
        momento: true,
      },
    ]);
    const { rows: movimento } = await executar(
      orgA,
      'select movimento_id from pecas_das_ordens where id = $1',
      [lancada],
    );
    expect(await recusada(peca(orgA, deA, id, { movimento_id: movimento[0]?.movimento_id }))).toBe(
      'pecas_das_ordens_movimento_unico',
    );
    expect(
      await recusada(
        executar(orgA, 'update pecas_das_ordens set quantidade = 2 where id = $1', [lancada]),
      ),
    ).toMatch(/permission denied/);
    expect(
      await recusada(executar(orgA, 'delete from pecas_das_ordens where id = $1', [lancada])),
    ).toMatch(/permission denied/);
  });

  it('confere a quantidade e as referências da mesma organização', async () => {
    const id = await ordem(orgA, deA);
    expect(await recusada(peca(orgA, deA, id, { quantidade: 0 }))).toBe(
      'pecas_das_ordens_quantidade_valida',
    );
    expect(await recusada(peca(orgA, deA, id, { quantidade: 100_001 }))).toBe(
      'pecas_das_ordens_quantidade_valida',
    );
    expect(await recusada(peca(orgA, deA, id, { consumivel_id: deB.peca }))).toBe(
      'pecas_das_ordens_consumivel_fk',
    );
    expect(await recusada(peca(orgA, deA, id, { local_id: deB.local }))).toBe(
      'pecas_das_ordens_local_fk',
    );
    expect(await recusada(peca(orgA, deA, await ordem(orgB, deB)))).toBe(
      'pecas_das_ordens_ordem_fk',
    );
    expect(await recusada(peca(orgA, deA, id, { lancada_por: deB.conta }))).toBe(
      'pecas_das_ordens_lancada_por_fk',
    );
  });
});

describe('numeração das OS', () => {
  const proximo = (c: pg.PoolClient) =>
    c
      .query<{ ultimo: number }>(
        `insert into numeracao_das_ordens (org_id, ultimo) values (app.current_org(), 1)
         on conflict (org_id) do update set ultimo = numeracao_das_ordens.ultimo + 1
         returning ultimo`,
      )
      .then(({ rows }) => rows[0]?.ultimo);

  it('dá o próximo número de cada organização, a partir de 1, separado do das solicitações', async () => {
    const org = await criarOrganizacao('Organização da numeração das OS');
    await emTransacao(app, org, (c) =>
      c.query('insert into numeracao_das_solicitacoes (org_id, ultimo) values ($1, 42)', [org]),
    );
    expect(await emTransacao(app, org, proximo)).toBe(1);
    expect(await emTransacao(app, org, proximo)).toBe(2);
    const outra = await criarOrganizacao('Outra da numeração das OS');
    expect(await emTransacao(app, outra, proximo)).toBe(1);
  });
});
