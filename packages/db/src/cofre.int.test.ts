// O cofre (spec cofre-de-segredos; design do P6, decisões 3, 4 e 6): os segredos, com o conteúdo e a
// chave cifrados, os acessos de cada segredo, com um titular só por linha, os ativos ligados e a
// liberação na sessão, isolados pela organização e com as referências da mesma organização.
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

const pessoa = (org: string) => incluir('pessoas', org, { nome: unico('Pessoa') });

const conta = async (org: string) =>
  incluir('contas', org, {
    pessoa_id: await pessoa(org),
    usuario: unico('conta').replace(' ', '.'),
    hash_senha: 'hash',
  });

const grupo = (org: string) => {
  const nome = unico('Grupo');
  return incluir('grupos', org, { nome, nome_normalizado: nome.toLowerCase() });
};

const perfil = (org: string) => {
  const nome = unico('Perfil');
  return incluir('perfis', org, { nome, nome_normalizado: nome.toLowerCase() });
};

const ativo = async (org: string) => {
  const nome = unico('Tipo');
  const tipo = await incluir('tipos_de_ativo', org, {
    nome,
    nome_normalizado: nome.toLowerCase(),
    icone: 'switch',
  });
  return incluir('ativos', org, { tipo_id: tipo, busca: unico('ativo') });
};

const segredo = (org: string, colunas: Record<string, unknown> = {}) => {
  const nome = unico('Segredo');
  return incluir('segredos', org, {
    nome,
    nome_normalizado: nome.toLowerCase(),
    tipo: 'conta-administrativa',
    classificacao: 'equipamento',
    conteudo_cifrado: Buffer.from('conteúdo cifrado'),
    chave_cifrada: Buffer.from('chave cifrada'),
    impressao_da_chave_mestra: '0123456789abcdef',
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

describe('segredos', () => {
  it('cada organização vê só os próprios segredos', async () => {
    const deA = await segredo(orgA);
    const deB = await segredo(orgB);
    const { rows } = await emTransacao(app, orgA, (c) => c.query('select id from segredos'));
    expect(rows.map((r) => r.id)).toContain(deA);
    expect(rows.map((r) => r.id)).not.toContain(deB);
  });

  it('nasce ativo, sem os campos opcionais, com o momento do valor', async () => {
    const id = await segredo(orgA);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query(
        `select situacao, identificador, endereco, notas, validade, proxima_rotacao, pessoa_id,
                valor_trocado_em is not null as com_valor
           from segredos where id = $1`,
        [id],
      ),
    );
    expect(rows).toEqual([
      {
        situacao: 'ativo',
        identificador: null,
        endereco: null,
        notas: null,
        validade: null,
        proxima_rotacao: null,
        pessoa_id: null,
        com_valor: true,
      },
    ]);
  });

  it('guarda as datas sem hora e confere o tipo, a classificação, a situação e os tamanhos', async () => {
    const id = await segredo(orgA, { validade: '2026-12-31', proxima_rotacao: '2027-01-15' });
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query("select to_char(validade, 'YYYY-MM-DD') as validade from segredos where id = $1", [
        id,
      ]),
    );
    expect(rows).toEqual([{ validade: '2026-12-31' }]);
    for (const errado of [
      { tipo: 'senha' },
      { classificacao: 'secreto' },
      { situacao: 'pausado' },
      { nome: ' ', nome_normalizado: ' ' },
      { nome: 'x'.repeat(121), nome_normalizado: 'x'.repeat(121) },
      { identificador: 'x'.repeat(201) },
      { endereco: 'x'.repeat(501) },
      { notas: 'x'.repeat(2001) },
      { impressao_da_chave_mestra: 'curta' },
    ]) {
      await expect(segredo(orgA, errado), JSON.stringify(errado)).rejects.toThrow(
        /check constraint/,
      );
    }
  });

  it('a pessoa e quem cadastrou são da mesma organização', async () => {
    await expect(segredo(orgA, { pessoa_id: await pessoa(orgB) })).rejects.toThrow(/foreign key/);
    await expect(segredo(orgA, { criado_por: await conta(orgB) })).rejects.toThrow(/foreign key/);
    expect(await segredo(orgA, { pessoa_id: await pessoa(orgA) })).not.toBe('');
  });
});

describe('acessos aos segredos', () => {
  const acesso = async (org: string, colunas: Record<string, unknown>) =>
    incluir('acessos_aos_segredos', org, { segredo_id: await segredo(org), ...colunas });

  it('cada linha tem um titular só: a conta, o grupo ou o perfil', async () => {
    expect(await acesso(orgA, { conta_id: await conta(orgA) })).not.toBe('');
    expect(await acesso(orgA, { grupo_id: await grupo(orgA) })).not.toBe('');
    expect(await acesso(orgA, { perfil_id: await perfil(orgA) })).not.toBe('');
    await expect(acesso(orgA, {})).rejects.toThrow(/check constraint/);
    await expect(
      acesso(orgA, { conta_id: await conta(orgA), grupo_id: await grupo(orgA) }),
    ).rejects.toThrow(/check constraint/);
  });

  it('o mesmo titular entra uma vez só no segredo', async () => {
    const id = await segredo(orgA);
    const titular = await grupo(orgA);
    await incluir('acessos_aos_segredos', orgA, { segredo_id: id, grupo_id: titular });
    await expect(
      incluir('acessos_aos_segredos', orgA, { segredo_id: id, grupo_id: titular }),
    ).rejects.toThrow(/unique/);
  });

  it('o segredo e o titular são da mesma organização', async () => {
    await expect(acesso(orgA, { conta_id: await conta(orgB) })).rejects.toThrow(/foreign key/);
    await expect(acesso(orgA, { grupo_id: await grupo(orgB) })).rejects.toThrow(/foreign key/);
    await expect(acesso(orgA, { perfil_id: await perfil(orgB) })).rejects.toThrow(/foreign key/);
    await expect(
      incluir('acessos_aos_segredos', orgA, {
        segredo_id: await segredo(orgB),
        conta_id: await conta(orgA),
      }),
    ).rejects.toThrow(/foreign key/);
  });
});

describe('ativos ligados aos segredos', () => {
  it('liga o segredo ao ativo uma vez só, na mesma organização', async () => {
    const id = await segredo(orgA);
    const switchDoCpd = await ativo(orgA);
    await incluir('segredos_dos_ativos', orgA, { segredo_id: id, ativo_id: switchDoCpd });
    await expect(
      incluir('segredos_dos_ativos', orgA, { segredo_id: id, ativo_id: switchDoCpd }),
    ).rejects.toThrow(/unique/);
    await expect(
      incluir('segredos_dos_ativos', orgA, { segredo_id: id, ativo_id: await ativo(orgB) }),
    ).rejects.toThrow(/foreign key/);
  });
});

describe('a liberação do cofre na sessão', () => {
  it('a sessão nasce com o cofre fechado e guarda até quando ele fica liberado', async () => {
    const sessao = await incluir('sessoes', orgA, {
      conta_id: await conta(orgA),
      token_hash: Buffer.from(unico('token')),
      token_csrf: 'csrf',
      expira_em: new Date('2026-10-13T00:00:00.000Z'),
    });
    const liberado = new Date('2026-10-12T14:32:00.000Z');
    const { rows } = await emTransacao(app, orgA, async (c) => {
      const antes = await c.query('select cofre_liberado_ate from sessoes where id = $1', [sessao]);
      await c.query('update sessoes set cofre_liberado_ate = $2 where id = $1', [sessao, liberado]);
      const depois = await c.query('select cofre_liberado_ate from sessoes where id = $1', [
        sessao,
      ]);
      return { rows: [antes.rows[0], depois.rows[0]] };
    });
    expect(rows).toEqual([{ cofre_liberado_ate: null }, { cofre_liberado_ate: liberado }]);
  });
});
