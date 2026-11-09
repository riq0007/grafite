// As solicitações (spec solicitacoes, "Solicitação", "Itens do toner", "Contador congelado na
// solicitação" e "Entrega do toner"; change p4d-solicitacoes, design, decisão 2): a solicitação,
// que o papel da aplicação não apaga, com as checagens de cada tipo; as impressoras do toner, com o
// contador congelado; os itens, que o item entregue trava; e a numeração por organização, sem
// buraco nem repetição. Todas isoladas pela organização.
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

const pessoa = (org: string) => incluir('pessoas', org, { nome: unico('Pessoa ') });

const local = (org: string) => {
  const nome = unico('Local ');
  return incluir('locais', org, { nome, nome_normalizado: nome.toLowerCase(), tipo: 'sala' });
};

const tipoDeAtivo = (org: string) => {
  const nome = unico('Tipo ');
  return incluir('tipos_de_ativo', org, {
    nome,
    nome_normalizado: nome.toLowerCase(),
    icone: 'impressora',
  });
};

const consumivel = (org: string) => {
  const codigo = unico('CF');
  return incluir('consumiveis', org, { codigo, codigo_normalizado: codigo, tipo: 'toner' });
};

const fornecedor = (org: string) => {
  const nome = unico('Fornecedor ');
  return incluir('fornecedores', org, { nome, nome_normalizado: nome.toLowerCase() });
};

/** As referências de uma organização, para as solicitações dela. */
interface Referencias {
  pessoa: string;
  conta: string;
  local: string;
  tipo: string;
  impressora: string;
  outraImpressora: string;
  consumivel: string;
  fornecedor: string;
}

async function referencias(org: string): Promise<Referencias> {
  const tipo = await tipoDeAtivo(org);
  const quemPede = await pessoa(org);
  return {
    pessoa: quemPede,
    conta: await incluir('contas', org, {
      pessoa_id: await pessoa(org),
      usuario: unico('conta.'),
      hash_senha: 'hash',
    }),
    local: await local(org),
    tipo,
    impressora: await incluir('ativos', org, { tipo_id: tipo, busca: unico('pat-') }),
    outraImpressora: await incluir('ativos', org, { tipo_id: tipo, busca: unico('pat-') }),
    consumivel: await consumivel(org),
    fornecedor: await fornecedor(org),
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

const toner = (org: string, r: Referencias, colunas: Record<string, unknown> = {}) =>
  incluir('solicitacoes', org, {
    numero: ++numeros,
    tipo: 'toner',
    situacao: 'aberta',
    pessoa_id: r.pessoa,
    locais: [r.local],
    registrada_por: r.conta,
    ...colunas,
  });

const conserto = (org: string, r: Referencias, colunas: Record<string, unknown> = {}) =>
  incluir('solicitacoes', org, {
    numero: ++numeros,
    tipo: 'conserto',
    situacao: 'aberta',
    pessoa_id: r.pessoa,
    ativo_id: r.impressora,
    defeito: 'Não liga',
    locais: [r.local],
    registrada_por: r.conta,
    ...colunas,
  });

const equipamento = (org: string, r: Referencias, colunas: Record<string, unknown> = {}) =>
  incluir('solicitacoes', org, {
    numero: ++numeros,
    tipo: 'equipamento',
    situacao: 'aberta',
    pessoa_id: r.pessoa,
    tipo_de_ativo_id: r.tipo,
    quantidade: 2,
    motivo: 'Dois contratados novos',
    local_id: r.local,
    locais: [r.local],
    registrada_por: r.conta,
    ...colunas,
  });

const impressora = (org: string, solicitacao: string, ativo: string, colunas = {}) =>
  incluir('impressoras_das_solicitacoes', org, {
    solicitacao_id: solicitacao,
    ativo_id: ativo,
    ...colunas,
  });

const item = (org: string, solicitacao: string, ativo: string, colunas = {}) =>
  incluir('itens_das_solicitacoes', org, {
    solicitacao_id: solicitacao,
    impressora_id: ativo,
    cor: 'preto',
    quantidade: 1,
    ...colunas,
  });

/** Um toner com a impressora e um item pendente, para os testes da entrega. */
async function tonerComItem(org: string, r: Referencias) {
  const solicitacao = await toner(org, r);
  await impressora(org, solicitacao, r.impressora);
  return { solicitacao, item: await item(org, solicitacao, r.impressora) };
}

/** Uma saída do estoque, para a entrega do estoque apontar. */
const saida = (org: string, r: Referencias) =>
  incluir('movimentos_do_estoque', org, {
    tipo: 'saida',
    consumivel_id: r.consumivel,
    quantidade: 1,
    origem_id: r.local,
    ativo_id: r.impressora,
    lancado_por: r.conta,
  });

describe('solicitações', () => {
  it('registra os três tipos, com o número, quem pediu, os locais e quem registrou', async () => {
    const ids = [
      await toner(orgA, deA),
      await conserto(orgA, deA),
      await equipamento(orgA, deA, { sem_local: true }),
    ];
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query(
        `select tipo, situacao, locais, sem_local, registrada_em is not null as momento
         from solicitacoes where id = any($1) order by numero`,
        [ids],
      ),
    );
    expect(rows).toEqual([
      { tipo: 'toner', situacao: 'aberta', locais: [deA.local], sem_local: false, momento: true },
      {
        tipo: 'conserto',
        situacao: 'aberta',
        locais: [deA.local],
        sem_local: false,
        momento: true,
      },
      {
        tipo: 'equipamento',
        situacao: 'aberta',
        locais: [deA.local],
        sem_local: true,
        momento: true,
      },
    ]);
  });

  it('Solicitação não se apaga: o papel da aplicação não apaga', async () => {
    const id = await conserto(orgA, deA);
    expect(
      await recusada(
        emTransacao(app, orgA, (c) => c.query('delete from solicitacoes where id = $1', [id])),
      ),
    ).toMatch(/permission denied/);
    await emTransacao(app, orgA, (c) =>
      c.query("update solicitacoes set situacao = 'em-atendimento' where id = $1", [id]),
    );
  });

  it('o número é único na organização, e outra organização repete o número', async () => {
    const numero = ++numeros;
    await conserto(orgA, deA, { numero });
    expect(await recusada(conserto(orgA, deA, { numero }))).toBe('solicitacoes_numero_unico');
    await conserto(orgB, deB, { numero });
  });

  it('cada organização vê só as próprias solicitações', async () => {
    const id = await conserto(orgB, deB);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select id from solicitacoes where id = $1', [id]),
    );
    expect(rows).toEqual([]);
  });

  it('recusa as referências de outra organização', async () => {
    expect(await recusada(conserto(orgA, deA, { pessoa_id: deB.pessoa }))).toBe(
      'solicitacoes_pessoa_fk',
    );
    expect(await recusada(conserto(orgA, deA, { ativo_id: deB.impressora }))).toBe(
      'solicitacoes_ativo_fk',
    );
    expect(await recusada(equipamento(orgA, deA, { tipo_de_ativo_id: deB.tipo }))).toBe(
      'solicitacoes_tipo_de_ativo_fk',
    );
    expect(await recusada(equipamento(orgA, deA, { local_id: deB.local }))).toBe(
      'solicitacoes_local_fk',
    );
    expect(await recusada(toner(orgA, deA, { fornecedor_id: deB.fornecedor }))).toBe(
      'solicitacoes_fornecedor_fk',
    );
    expect(await recusada(toner(orgA, deA, { registrada_por: deB.conta }))).toBe(
      'solicitacoes_registrada_por_fk',
    );
  });

  it('confere o tipo, a situação, a quantidade e o tamanho dos textos', async () => {
    expect(await recusada(conserto(orgA, deA, { tipo: 'reparo' }))).toBe(
      'solicitacoes_tipo_valido',
    );
    expect(await recusada(conserto(orgA, deA, { situacao: 'pausada' }))).toBe(
      'solicitacoes_situacao_valida',
    );
    expect(await recusada(equipamento(orgA, deA, { quantidade: 100 }))).toBe(
      'solicitacoes_quantidade_valida',
    );
    expect(await recusada(conserto(orgA, deA, { observacao: 'a'.repeat(501) }))).toBe(
      'solicitacoes_textos_validos',
    );
    expect(await recusada(conserto(orgA, deA, { defeito: 'a'.repeat(1001) }))).toBe(
      'solicitacoes_textos_validos',
    );
    expect(
      await recusada(toner(orgA, deA, { fornecedor_id: deA.fornecedor, os_do_fornecedor: ' ' })),
    ).toBe('solicitacoes_textos_validos');
  });

  it('diz o que cada tipo preenche e o que fica vazio', async () => {
    expect(await recusada(conserto(orgA, deA, { ativo_id: null }))).toBe(
      'solicitacoes_campos_do_tipo',
    );
    expect(await recusada(equipamento(orgA, deA, { motivo: null }))).toBe(
      'solicitacoes_campos_do_tipo',
    );
    expect(await recusada(toner(orgA, deA, { defeito: 'Não liga' }))).toBe(
      'solicitacoes_campos_do_tipo',
    );
    expect(await recusada(conserto(orgA, deA, { fornecedor_id: deA.fornecedor }))).toBe(
      'solicitacoes_campos_do_tipo',
    );
    expect(await recusada(conserto(orgA, deA, { situacao: 'aguardando-entrega' }))).toBe(
      'solicitacoes_campos_do_tipo',
    );
    expect(await recusada(toner(orgA, deA, { os_do_fornecedor: 'OS-7781' }))).toBe(
      'solicitacoes_campos_do_tipo',
    );
  });

  it('a encerrada tem quem e quando; a cancelada, o motivo; a concluída, o que foi feito', async () => {
    const encerrada = { encerrada_por: deA.conta, encerrada_em: new Date().toISOString() };
    await conserto(orgA, deA, {
      situacao: 'concluida',
      o_que_foi_feito: 'Fonte trocada',
      ...encerrada,
    });
    await conserto(orgA, deA, {
      situacao: 'cancelada',
      motivo_do_cancelamento: 'Pedido em duplicidade',
      ...encerrada,
    });
    expect(await recusada(conserto(orgA, deA, { situacao: 'concluida' }))).toBe(
      'solicitacoes_encerramento_coerente',
    );
    expect(await recusada(conserto(orgA, deA, { encerrada_em: encerrada.encerrada_em }))).toBe(
      'solicitacoes_encerramento_coerente',
    );
    expect(await recusada(conserto(orgA, deA, { situacao: 'cancelada', ...encerrada }))).toBe(
      'solicitacoes_encerramento_coerente',
    );
    expect(await recusada(conserto(orgA, deA, { o_que_foi_feito: 'Fonte trocada' }))).toBe(
      'solicitacoes_encerramento_coerente',
    );
  });

  it('tem os índices da lista, das situações, do ativo e dos locais', async () => {
    const { rows } = await dono.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes
       where tablename in ('solicitacoes', 'impressoras_das_solicitacoes', 'itens_das_solicitacoes')
       order by indexname`,
    );
    const nomesDosIndices = rows.map(({ indexname }) => indexname);
    expect(nomesDosIndices).toEqual(
      expect.arrayContaining([
        'solicitacoes_registrada_idx',
        'solicitacoes_situacao_idx',
        'solicitacoes_ativo_idx',
        'solicitacoes_locais_idx',
        'impressoras_das_solicitacoes_ativo_idx',
        'itens_das_solicitacoes_solicitacao_idx',
      ]),
    );
    expect(rows.find(({ indexname }) => indexname === 'solicitacoes_locais_idx')?.indexdef).toMatch(
      /USING gin/,
    );
  });
});

describe('impressoras e itens do toner', () => {
  it('guarda o contador congelado de cada impressora, ou nenhum, uma vez por solicitação', async () => {
    const solicitacao = await toner(orgA, deA);
    await impressora(orgA, solicitacao, deA.impressora, {
      contador_paginas: 48_210,
      contador_lido_em: '2026-10-21T14:02:00Z',
    });
    await impressora(orgA, solicitacao, deA.outraImpressora);
    expect(await recusada(impressora(orgA, solicitacao, deA.impressora))).toBe(
      'impressoras_das_solicitacoes_unica',
    );
    expect(
      await recusada(
        impressora(orgA, await toner(orgA, deA), deA.impressora, { contador_paginas: 10 }),
      ),
    ).toBe('impressoras_das_solicitacoes_contador_valido');
    expect(await recusada(impressora(orgA, await toner(orgA, deA), deB.impressora))).toBe(
      'impressoras_das_solicitacoes_ativo_fk',
    );
  });

  it('o item aponta para uma impressora da solicitação, uma cor uma vez', async () => {
    const solicitacao = await toner(orgA, deA);
    await impressora(orgA, solicitacao, deA.impressora);
    await item(orgA, solicitacao, deA.impressora);
    await item(orgA, solicitacao, deA.impressora, { cor: 'ciano' });
    expect(await recusada(item(orgA, solicitacao, deA.impressora))).toBe(
      'itens_das_solicitacoes_cor_unica',
    );
    expect(await recusada(item(orgA, solicitacao, deA.outraImpressora))).toBe(
      'itens_das_solicitacoes_impressora_fk',
    );
  });

  it('confere a cor, a quantidade e a entrega de cada origem', async () => {
    const { solicitacao } = await tonerComItem(orgA, deA);
    const entregue = { entregue_por: deA.conta, entregue_em: new Date().toISOString() };
    expect(await recusada(item(orgA, solicitacao, deA.impressora, { cor: 'verde' }))).toBe(
      'itens_das_solicitacoes_cor_valida',
    );
    expect(
      await recusada(item(orgA, solicitacao, deA.impressora, { cor: 'ciano', quantidade: 0 })),
    ).toBe('itens_das_solicitacoes_quantidade_valida');
    expect(
      await recusada(
        item(orgA, solicitacao, deA.impressora, { cor: 'ciano', origem: 'estoque', ...entregue }),
      ),
    ).toBe('itens_das_solicitacoes_entrega_coerente');
    expect(
      await recusada(
        item(orgA, solicitacao, deA.impressora, {
          cor: 'ciano',
          origem: 'fornecedor',
          movimento_id: await saida(orgA, deA),
          fornecedor_id: deA.fornecedor,
          ...entregue,
        }),
      ),
    ).toBe('itens_das_solicitacoes_entrega_coerente');
    await item(orgA, solicitacao, deA.impressora, {
      cor: 'ciano',
      origem: 'estoque',
      consumivel_id: deA.consumivel,
      movimento_id: await saida(orgA, deA),
      ...entregue,
    });
    await item(orgA, solicitacao, deA.impressora, {
      cor: 'magenta',
      origem: 'fornecedor',
      fornecedor_id: deA.fornecedor,
      ...entregue,
    });
  });

  it('o item pendente muda e sai', async () => {
    const { item: id } = await tonerComItem(orgA, deA);
    await emTransacao(app, orgA, async (c) => {
      await c.query('update itens_das_solicitacoes set quantidade = 2 where id = $1', [id]);
      await c.query('delete from itens_das_solicitacoes where id = $1', [id]);
    });
  });

  it('Impressora com item entregue: o item entregue não muda nem sai, e a impressora fica', async () => {
    const { solicitacao, item: id } = await tonerComItem(orgA, deA);
    await emTransacao(app, orgA, (c) =>
      c.query(
        `update itens_das_solicitacoes
         set origem = 'fornecedor', fornecedor_id = $2, entregue_por = $3, entregue_em = now()
         where id = $1`,
        [id, deA.fornecedor, deA.conta],
      ),
    );
    expect(
      await recusada(
        emTransacao(app, orgA, (c) =>
          c.query('update itens_das_solicitacoes set quantidade = 2 where id = $1', [id]),
        ),
      ),
    ).toMatch(/item entregue/);
    expect(
      await recusada(
        emTransacao(app, orgA, (c) =>
          c.query('delete from itens_das_solicitacoes where id = $1', [id]),
        ),
      ),
    ).toMatch(/item entregue/);
    expect(
      await recusada(
        emTransacao(app, orgA, (c) =>
          c.query('delete from impressoras_das_solicitacoes where solicitacao_id = $1', [
            solicitacao,
          ]),
        ),
      ),
    ).toBe('itens_das_solicitacoes_impressora_fk');
  });
});

describe('numeração das solicitações', () => {
  const proximo = (c: pg.PoolClient) =>
    c
      .query<{ ultimo: number }>(
        `insert into numeracao_das_solicitacoes (org_id, ultimo) values (app.current_org(), 1)
         on conflict (org_id) do update set ultimo = numeracao_das_solicitacoes.ultimo + 1
         returning ultimo`,
      )
      .then(({ rows }) => rows[0]?.ultimo);

  it('dá o próximo número de cada organização, a partir de 1', async () => {
    const org = await criarOrganizacao('Organização da numeração');
    expect(await emTransacao(app, org, proximo)).toBe(1);
    expect(await emTransacao(app, org, proximo)).toBe(2);
    const outra = await criarOrganizacao('Outra da numeração');
    expect(await emTransacao(app, outra, proximo)).toBe(1);
  });

  it('dois registros ao mesmo tempo esperam um pelo outro, e o desfeito devolve o número', async () => {
    const org = await criarOrganizacao('Organização concorrente');
    const primeiro = await app.connect();
    const segundo = await app.connect();
    try {
      for (const c of [primeiro, segundo]) {
        await c.query('begin');
        await c.query("select set_config('app.org_id', $1, true)", [org]);
      }
      expect(await proximo(primeiro)).toBe(1);
      const esperando = proximo(segundo);
      await primeiro.query('rollback');
      expect(await esperando).toBe(1);
      await segundo.query('commit');
    } finally {
      primeiro.release();
      segundo.release();
    }
    expect(await emTransacao(app, org, proximo)).toBe(2);
  });
});
