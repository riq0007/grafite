// O catálogo de ativos (spec catalogo-de-ativos; design do P1a, decisão 1): os tipos, os campos da
// organização, os campos de cada tipo e os modelos, isolados pela organização, com os nomes únicos
// pela forma normalizada e as referências levando o org_id junto.
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

const tipo = (org: string, colunas: Record<string, unknown> = {}) => {
  const nome = unico('Tipo');
  return incluir('tipos_de_ativo', org, {
    nome,
    nome_normalizado: nome.toLowerCase(),
    icone: 'generico',
    ...colunas,
  });
};

const campo = (org: string, colunas: Record<string, unknown> = {}) => {
  const rotulo = unico('Campo');
  return incluir('campos', org, {
    rotulo,
    rotulo_normalizado: rotulo.toLowerCase(),
    tipo: 'texto',
    ...colunas,
  });
};

const modelo = (org: string, tipoId: string, colunas: Record<string, unknown> = {}) => {
  const nome = unico('Modelo');
  return incluir('modelos', org, {
    tipo_id: tipoId,
    fabricante: 'HP',
    fabricante_normalizado: 'hp',
    nome,
    nome_normalizado: nome.toLowerCase(),
    busca: `hp ${nome.toLowerCase()}`,
    ...colunas,
  });
};

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

describe('tipos de ativo', () => {
  it('cada organização vê só os próprios tipos', async () => {
    const deA = await tipo(orgA);
    const deB = await tipo(orgB);
    const { rows } = await emTransacao(app, orgA, (c) => c.query('select id from tipos_de_ativo'));
    expect(rows.map((r) => r.id)).toContain(deA);
    expect(rows.map((r) => r.id)).not.toContain(deB);
  });

  it('o tipo nasce ativo, sem capacidades', async () => {
    const id = await tipo(orgA);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select situacao, capacidades from tipos_de_ativo where id = $1', [id]),
    );
    expect(rows).toEqual([{ situacao: 'ativo', capacidades: [] }]);
  });

  it('o nome é único na organização pela forma normalizada, e só nela', async () => {
    await incluir('tipos_de_ativo', orgA, {
      nome: 'Câmera',
      nome_normalizado: 'camera',
      icone: 'camera',
    });
    await expect(
      incluir('tipos_de_ativo', orgA, {
        nome: 'camera',
        nome_normalizado: 'camera',
        icone: 'camera',
      }),
    ).rejects.toThrow(/unique/);
    expect(
      await incluir('tipos_de_ativo', orgB, {
        nome: 'Câmera',
        nome_normalizado: 'camera',
        icone: 'camera',
      }),
    ).not.toBe('');
  });

  it('confere o ícone, a situação e o tamanho do nome', async () => {
    await expect(tipo(orgA, { icone: 'foguete' })).rejects.toThrow(/check constraint/);
    await expect(tipo(orgA, { situacao: 'apagado' })).rejects.toThrow(/check constraint/);
    await expect(
      tipo(orgA, { nome: 'a'.repeat(61), nome_normalizado: 'a'.repeat(61) }),
    ).rejects.toThrow(/check constraint/);
    await expect(tipo(orgA, { nome: '  ', nome_normalizado: '' })).rejects.toThrow(
      /check constraint/,
    );
  });
});

describe('campos da organização', () => {
  it('o rótulo é único na organização pela forma normalizada', async () => {
    await campo(orgA, { rotulo: 'Propriedade', rotulo_normalizado: 'propriedade' });
    await expect(
      campo(orgA, { rotulo: 'propriedade', rotulo_normalizado: 'propriedade' }),
    ).rejects.toThrow(/unique/);
  });

  it('o campo nasce ativo, não restrito, com a escrita automática e sem configuração', async () => {
    const id = await campo(orgA);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select situacao, restrito, escrita, configuracao, grupo from campos where id = $1', [
        id,
      ]),
    );
    expect(rows).toEqual([
      { situacao: 'ativo', restrito: false, escrita: 'automatica', configuracao: {}, grupo: null },
    ]);
  });

  it('confere o tipo de campo, a escrita, o grupo e a configuração', async () => {
    await expect(campo(orgA, { tipo: 'planilha' })).rejects.toThrow(/check constraint/);
    await expect(campo(orgA, { escrita: 'qualquer' })).rejects.toThrow(/check constraint/);
    await expect(campo(orgA, { grupo: '' })).rejects.toThrow(/check constraint/);
    await expect(campo(orgA, { grupo: 'a'.repeat(41) })).rejects.toThrow(/check constraint/);
    await expect(campo(orgA, { configuracao: JSON.stringify([1, 2]) })).rejects.toThrow(
      /check constraint/,
    );
    const grande = JSON.stringify({ opcoes: [{ rotulo: 'a'.repeat(33_000) }] });
    await expect(campo(orgA, { tipo: 'lista', configuracao: grande })).rejects.toThrow(
      /check constraint/,
    );
    expect(await campo(orgA, { tipo: 'mac', grupo: 'Rede' })).not.toBe('');
  });

  it('aceita os tipos arquivo e imagem, que chegam com a ficha do ativo', async () => {
    expect(await campo(orgA, { tipo: 'arquivo' })).not.toBe('');
    expect(await campo(orgA, { tipo: 'imagem' })).not.toBe('');
  });

  it('aceita o tipo fornecedor (change p4a-fornecedores)', async () => {
    expect(await campo(orgA, { tipo: 'fornecedor' })).not.toBe('');
  });
});

describe('campos do tipo', () => {
  it('liga um campo a um tipo da mesma organização, uma vez só', async () => {
    const tipoId = await tipo(orgA);
    const campoId = await campo(orgA);
    await incluir('campos_do_tipo', orgA, { tipo_id: tipoId, campo_id: campoId, ordem: 0 });
    await expect(
      incluir('campos_do_tipo', orgA, { tipo_id: tipoId, campo_id: campoId, ordem: 1 }),
    ).rejects.toThrow(/unique/);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query('select obrigatorio from campos_do_tipo where tipo_id = $1', [tipoId]),
    );
    expect(rows).toEqual([{ obrigatorio: false }]);
  });

  it('o banco recusa o campo ou o tipo de outra organização', async () => {
    const tipoDeA = await tipo(orgA);
    const campoDeB = await campo(orgB);
    await expect(
      incluir('campos_do_tipo', orgA, { tipo_id: tipoDeA, campo_id: campoDeB, ordem: 0 }),
    ).rejects.toThrow(/foreign key/);
  });

  it('a ordem não é negativa', async () => {
    await expect(
      incluir('campos_do_tipo', orgA, {
        tipo_id: await tipo(orgA),
        campo_id: await campo(orgA),
        ordem: -1,
      }),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('modelos', () => {
  it('o fabricante e o nome são únicos juntos dentro do tipo', async () => {
    const impressora = await tipo(orgA);
    const outro = await tipo(orgA);
    const colunas = { fabricante: 'HP', fabricante_normalizado: 'hp', nome: 'LaserJet M404' };
    await modelo(orgA, impressora, { ...colunas, nome_normalizado: 'laserjet m404' });
    await expect(
      modelo(orgA, impressora, {
        ...colunas,
        nome: 'laserjet m404',
        nome_normalizado: 'laserjet m404',
      }),
    ).rejects.toThrow(/unique/);
    expect(await modelo(orgA, outro, { ...colunas, nome_normalizado: 'laserjet m404' })).not.toBe(
      '',
    );
  });

  it('o banco recusa o tipo e a imagem de outra organização', async () => {
    const tipoDeB = await tipo(orgB);
    await expect(modelo(orgA, tipoDeB)).rejects.toThrow(/foreign key/);
    const imagemDeB = await incluir('arquivos', orgB, { tipo: 'image/webp', bytes: 10 });
    await expect(modelo(orgA, await tipo(orgA), { imagem_id: imagemDeB })).rejects.toThrow(
      /foreign key/,
    );
  });

  it('confere o tamanho do fabricante e do nome, e a situação', async () => {
    const tipoId = await tipo(orgA);
    await expect(
      modelo(orgA, tipoId, { fabricante: 'a'.repeat(61), fabricante_normalizado: 'a' }),
    ).rejects.toThrow(/check constraint/);
    await expect(
      modelo(orgA, tipoId, { nome: 'a'.repeat(81), nome_normalizado: 'a'.repeat(81) }),
    ).rejects.toThrow(/check constraint/);
    await expect(modelo(orgA, tipoId, { situacao: 'apagado' })).rejects.toThrow(/check constraint/);
  });
});
