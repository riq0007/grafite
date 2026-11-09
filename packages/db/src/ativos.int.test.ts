// Os ativos (spec cadastro-de-ativos; design do P1b, decisões 1 e 12): isolados pela organização,
// com o modelo preso ao tipo do ativo pelo banco, o patrimônio único pela forma normalizada e os
// valores e o estado como objetos; e os módulos desligados na organização. Do P1d (decisões 2 a 4),
// a imagem do ativo, o índice dos valores e as ligações livres, com o par em ordem e único.
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

const tipo = (org: string) => {
  const nome = unico('Tipo');
  return incluir('tipos_de_ativo', org, {
    nome,
    nome_normalizado: nome.toLowerCase(),
    icone: 'generico',
  });
};

const modelo = (org: string, tipoId: string) => {
  const nome = unico('Modelo');
  return incluir('modelos', org, {
    tipo_id: tipoId,
    fabricante: 'HP',
    fabricante_normalizado: 'hp',
    nome,
    nome_normalizado: nome.toLowerCase(),
    busca: `hp ${nome.toLowerCase()}`,
  });
};

const ativo = (org: string, tipoId: string, colunas: Record<string, unknown> = {}) =>
  incluir('ativos', org, { tipo_id: tipoId, busca: '', ...colunas });

const arquivo = (org: string) =>
  incluir('arquivos', org, { tipo: 'image/webp', bytes: 1234, largura: 512, altura: 384 });

/** Uma conta nova da organização, com a pessoa dela. */
async function conta(org: string): Promise<string> {
  const pessoa = await incluir('pessoas', org, { nome: unico('Pessoa') });
  return incluir('contas', org, {
    pessoa_id: pessoa,
    usuario: unico('conta').replace(' ', '.'),
    hash_senha: 'hash',
  });
}

/** Dois ativos novos da organização, na ordem do par da ligação. */
async function par(org: string): Promise<[string, string]> {
  const tipoId = await tipo(org);
  const um = await ativo(org, tipoId);
  const outro = await ativo(org, tipoId);
  return um < outro ? [um, outro] : [outro, um];
}

const ligar = (org: string, [a, b]: readonly string[], colunas: Record<string, unknown> = {}) =>
  incluir('ligacoes_de_ativos', org, { ativo_a: a, ativo_b: b, ...colunas });

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

describe('ativos', () => {
  it('cada organização vê só os próprios ativos', async () => {
    const deA = await ativo(orgA, await tipo(orgA));
    const deB = await ativo(orgB, await tipo(orgB));
    const { rows } = await emTransacao(app, orgA, (c) => c.query('select id from ativos'));
    expect(rows.map((r) => r.id)).toContain(deA);
    expect(rows.map((r) => r.id)).not.toContain(deB);
  });

  it('o ativo nasce ativo, em uso, com os valores e o estado vazios', async () => {
    const id = await ativo(orgA, await tipo(orgA));
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select situacao, uso, valores, estado, modelo_id from ativos where id = $1', [id]),
    );
    expect(rows).toEqual([
      { situacao: 'ativo', uso: 'em-uso', valores: {}, estado: {}, modelo_id: null },
    ]);
  });

  it('o modelo é do tipo do ativo: o banco recusa o modelo de outro tipo', async () => {
    const impressora = await tipo(orgA);
    const computador = await tipo(orgA);
    const daImpressora = await modelo(orgA, impressora);
    expect(await ativo(orgA, impressora, { modelo_id: daImpressora })).not.toBe('');
    await expect(ativo(orgA, computador, { modelo_id: daImpressora })).rejects.toThrow(
      /foreign key/,
    );
  });

  it('o banco recusa o tipo, o modelo, o local e o responsável de outra organização', async () => {
    const tipoDeA = await tipo(orgA);
    const tipoDeB = await tipo(orgB);
    await expect(ativo(orgA, tipoDeB)).rejects.toThrow(/foreign key/);
    const localDeB = await incluir('locais', orgB, {
      nome: 'Jundiaí',
      nome_normalizado: 'jundiai',
      tipo: 'unidade',
    });
    await expect(ativo(orgA, tipoDeA, { local_id: localDeB })).rejects.toThrow(/foreign key/);
    const pessoaDeB = await incluir('pessoas', orgB, { nome: 'João', busca: 'joao' });
    await expect(ativo(orgA, tipoDeA, { responsavel_id: pessoaDeB })).rejects.toThrow(
      /foreign key/,
    );
  });

  it('o patrimônio é único na organização pela forma normalizada, e vários ativos ficam sem', async () => {
    const tipoId = await tipo(orgA);
    await ativo(orgA, tipoId, { patrimonio: 'PAT-00412', patrimonio_normalizado: 'pat-00412' });
    await expect(
      ativo(orgA, tipoId, { patrimonio: 'pat-00412', patrimonio_normalizado: 'pat-00412' }),
    ).rejects.toThrow(/unique/);
    expect(await ativo(orgA, tipoId)).not.toBe('');
    expect(await ativo(orgA, tipoId)).not.toBe('');
    expect(
      await ativo(orgB, await tipo(orgB), {
        patrimonio: 'PAT-00412',
        patrimonio_normalizado: 'pat-00412',
      }),
    ).not.toBe('');
  });

  it('confere o uso, a situação e a forma e o tamanho dos valores e do estado', async () => {
    const tipoId = await tipo(orgA);
    await expect(ativo(orgA, tipoId, { uso: 'quebrado' })).rejects.toThrow(/check constraint/);
    await expect(ativo(orgA, tipoId, { situacao: 'apagado' })).rejects.toThrow(/check constraint/);
    await expect(ativo(orgA, tipoId, { valores: JSON.stringify([1]) })).rejects.toThrow(
      /check constraint/,
    );
    await expect(ativo(orgA, tipoId, { estado: JSON.stringify('x') })).rejects.toThrow(
      /check constraint/,
    );
    const grande = JSON.stringify({ texto: 'a'.repeat(262_200) });
    await expect(ativo(orgA, tipoId, { valores: grande })).rejects.toThrow(/check constraint/);
    expect(
      await ativo(orgA, tipoId, {
        uso: 'em-manutencao',
        valores: JSON.stringify({ 'ativo.fornecedor': 'Dell' }),
      }),
    ).not.toBe('');
  });
});

describe('imagem do ativo', () => {
  it('o ativo nasce sem imagem e aponta para um arquivo da própria organização', async () => {
    const tipoId = await tipo(orgA);
    const semImagem = await ativo(orgA, tipoId);
    const imagem = await arquivo(orgA);
    const comImagem = await ativo(orgA, tipoId, { imagem_id: imagem });
    const lerImagem = async (id: string) => {
      const { rows } = await emTransacao(app, orgA, (c) =>
        c.query('select imagem_id from ativos where id = $1', [id]),
      );
      return rows[0]?.imagem_id;
    };
    expect(await lerImagem(semImagem)).toBeNull();
    expect(await lerImagem(comImagem)).toBe(imagem);
  });

  it('o banco recusa a imagem de outra organização', async () => {
    const deB = await arquivo(orgB);
    await expect(ativo(orgA, await tipo(orgA), { imagem_id: deB })).rejects.toThrow(/foreign key/);
  });
});

describe('índice dos valores', () => {
  // O uso do índice pelo lado de lá é medido na API, com 10 mil ativos: numa tabela quase vazia, o
  // planejador prefere o índice da organização, e o plano não diria nada.
  it('os valores têm o índice GIN jsonb_path_ops, que atende a busca por @>', async () => {
    const { rows } = await dono.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where tablename = 'ativos' and indexname = 'ativos_valores_idx'",
    );
    expect(rows.map((r) => r.indexdef)).toEqual([
      expect.stringMatching(/USING gin \(valores jsonb_path_ops\)$/),
    ]);
  });
});

describe('ligações livres', () => {
  it('cada organização vê só as próprias ligações', async () => {
    const deA = await ligar(orgA, await par(orgA));
    const deB = await ligar(orgB, await par(orgB));
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select id from ligacoes_de_ativos'),
    );
    expect(rows.map((r) => r.id)).toContain(deA);
    expect(rows.map((r) => r.id)).not.toContain(deB);
  });

  it('a ligação nasce com o momento e guarda quem ligou', async () => {
    const quem = await conta(orgA);
    const id = await ligar(orgA, await par(orgA), { criado_por: quem });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query(
        'select criado_por, criado_em is not null as criada from ligacoes_de_ativos where id = $1',
        [id],
      ),
    );
    expect(rows).toEqual([{ criado_por: quem, criada: true }]);
  });

  it('o par vai sempre em ordem: o banco recusa o par invertido e o ativo com ele mesmo', async () => {
    const [menor, maior] = await par(orgA);
    await expect(ligar(orgA, [maior, menor])).rejects.toThrow(/check constraint/);
    await expect(ligar(orgA, [menor, menor])).rejects.toThrow(/check constraint/);
    expect(await ligar(orgA, [menor, maior])).not.toBe('');
  });

  it('o mesmo par entra uma vez só', async () => {
    const ativos = await par(orgA);
    await ligar(orgA, ativos);
    await expect(ligar(orgA, ativos)).rejects.toThrow(/unique/);
  });

  it('o banco recusa o ativo e a conta de outra organização', async () => {
    const [deA] = await par(orgA);
    const [deB] = await par(orgB);
    await expect(ligar(orgA, deA < deB ? [deA, deB] : [deB, deA])).rejects.toThrow(/foreign key/);
    const quem = await conta(orgB);
    await expect(ligar(orgA, await par(orgA), { criado_por: quem })).rejects.toThrow(/foreign key/);
  });
});

describe('módulos desligados na organização', () => {
  it('começam vazios, e a organização guarda os que desligou', async () => {
    const nova = await criarOrganizacao('Organização C');
    const ler = () =>
      emTransacao(app, nova, (c) =>
        c.query('select modulos_desligados from organizacoes where id = $1', [nova]),
      );
    expect((await ler()).rows).toEqual([{ modulos_desligados: [] }]);
    await emTransacao(app, nova, (c) =>
      c.query("update organizacoes set modulos_desligados = '{ativos}' where id = $1", [nova]),
    );
    expect((await ler()).rows).toEqual([{ modulos_desligados: ['ativos'] }]);
  });
});
