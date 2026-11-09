// Perfis, grupos, membros e atribuições (spec perfis-e-grupos): isolados por organização, com as
// referências na mesma organização, os nomes únicos, só o perfil protegido com todas as permissões e
// cada participação e atribuição em vigor uma vez só.
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

function inserir(org: string, tabela: string, dados: Record<string, unknown>): Promise<string> {
  const colunas = Object.keys(dados);
  return emTransacao(app, org, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `insert into ${tabela} (org_id, ${colunas.join(', ')})
       values ($1, ${colunas.map((_, i) => `$${i + 2}`).join(', ')}) returning id`,
      [org, ...Object.values(dados)],
    );
    return rows[0]?.id ?? '';
  });
}

let sequencia = 0;
const proximo = () => `${++sequencia}`;

const criarPerfil = (org: string, dados: Record<string, unknown> = {}) => {
  const nome = `Perfil ${proximo()}`;
  return inserir(org, 'perfis', { nome, nome_normalizado: nome.toLowerCase(), ...dados });
};

const criarGrupo = (org: string, dados: Record<string, unknown> = {}) => {
  const nome = `Grupo ${proximo()}`;
  return inserir(org, 'grupos', { nome, nome_normalizado: nome.toLowerCase(), ...dados });
};

async function criarConta(org: string): Promise<string> {
  const pessoa = await inserir(org, 'pessoas', { nome: 'Pessoa' });
  return inserir(org, 'contas', {
    pessoa_id: pessoa,
    usuario: `conta${proximo()}`,
    hash_senha: 'hash',
  });
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

describe('perfis', () => {
  it('guardam as permissões e cada organização vê só os próprios', async () => {
    await criarPerfil(orgA, { permissoes: ['pessoas.ver', 'locais.editar'] });
    await criarPerfil(orgB);
    const { rows } = await emTransacao(app, orgA, (c) =>
      c.query<{ permissoes: string[] }>('select permissoes from perfis'),
    );
    expect(rows).toEqual([{ permissoes: ['pessoas.ver', 'locais.editar'] }]);
  });

  it('recusam o nome normalizado repetido na organização', async () => {
    await inserir(orgA, 'perfis', { nome: 'Técnico', nome_normalizado: 'tecnico' });
    await expect(
      inserir(orgA, 'perfis', { nome: 'TECNICO', nome_normalizado: 'tecnico' }),
    ).rejects.toThrow(/perfis_nome_unico/);
    await inserir(orgB, 'perfis', { nome: 'Técnico', nome_normalizado: 'tecnico' });
  });

  it('só o protegido tem todas as permissões', async () => {
    await criarPerfil(orgA, { todas_as_permissoes: true, protegido: true });
    await expect(criarPerfil(orgA, { todas_as_permissoes: true })).rejects.toThrow(
      /perfis_todas_so_no_protegido/,
    );
  });

  it('recusam a situação fora da lista', async () => {
    await expect(criarPerfil(orgA, { situacao: 'apagado' })).rejects.toThrow(
      /perfis_situacao_valida/,
    );
  });
});

describe('grupos e membros', () => {
  it('recusam o nome normalizado repetido na organização', async () => {
    await inserir(orgA, 'grupos', { nome: 'Suporte', nome_normalizado: 'suporte' });
    await expect(
      inserir(orgA, 'grupos', { nome: 'suporte', nome_normalizado: 'suporte' }),
    ).rejects.toThrow(/grupos_nome_unico/);
  });

  it('aceitam uma participação em vigor por conta, e a encerrada se repete', async () => {
    const grupo = await criarGrupo(orgA);
    const conta = await criarConta(orgA);
    const agora = new Date().toISOString();
    await inserir(orgA, 'membros_do_grupo', {
      grupo_id: grupo,
      conta_id: conta,
      encerrada_em: agora,
    });
    await inserir(orgA, 'membros_do_grupo', {
      grupo_id: grupo,
      conta_id: conta,
      encerrada_em: agora,
    });
    await inserir(orgA, 'membros_do_grupo', { grupo_id: grupo, conta_id: conta });
    await expect(
      inserir(orgA, 'membros_do_grupo', { grupo_id: grupo, conta_id: conta }),
    ).rejects.toThrow(/membros_do_grupo_em_vigor/);
  });

  it('recusam a conta de outra organização', async () => {
    const grupo = await criarGrupo(orgA);
    const deB = await criarConta(orgB);
    await expect(
      inserir(orgA, 'membros_do_grupo', { grupo_id: grupo, conta_id: deB }),
    ).rejects.toThrow(/membros_do_grupo_conta_fk/);
  });
});

describe('atribuições', () => {
  it('ligam o perfil a uma conta ou a um grupo, nunca aos dois nem a nenhum', async () => {
    const perfil = await criarPerfil(orgA);
    const conta = await criarConta(orgA);
    const grupo = await criarGrupo(orgA);
    await inserir(orgA, 'atribuicoes', { perfil_id: perfil, conta_id: conta });
    await inserir(orgA, 'atribuicoes', { perfil_id: perfil, grupo_id: grupo });
    await expect(
      inserir(orgA, 'atribuicoes', { perfil_id: perfil, conta_id: conta, grupo_id: grupo }),
    ).rejects.toThrow(/atribuicoes_conta_ou_grupo/);
    await expect(inserir(orgA, 'atribuicoes', { perfil_id: perfil })).rejects.toThrow(
      /atribuicoes_conta_ou_grupo/,
    );
  });

  it('não repetem a atribuição em vigor, com ou sem local', async () => {
    const perfil = await criarPerfil(orgA);
    const conta = await criarConta(orgA);
    const local = await inserir(orgA, 'locais', {
      nome: 'Jundiaí',
      nome_normalizado: `jundiai ${proximo()}`,
      tipo: 'unidade',
    });
    await inserir(orgA, 'atribuicoes', { perfil_id: perfil, conta_id: conta });
    await expect(
      inserir(orgA, 'atribuicoes', { perfil_id: perfil, conta_id: conta }),
    ).rejects.toThrow(/atribuicoes_em_vigor/);
    await inserir(orgA, 'atribuicoes', { perfil_id: perfil, conta_id: conta, local_id: local });
    await expect(
      inserir(orgA, 'atribuicoes', { perfil_id: perfil, conta_id: conta, local_id: local }),
    ).rejects.toThrow(/atribuicoes_em_vigor/);
  });

  it('aceitam repetir a atribuição encerrada', async () => {
    const perfil = await criarPerfil(orgA);
    const conta = await criarConta(orgA);
    const agora = new Date().toISOString();
    await inserir(orgA, 'atribuicoes', { perfil_id: perfil, conta_id: conta, encerrada_em: agora });
    await inserir(orgA, 'atribuicoes', { perfil_id: perfil, conta_id: conta, encerrada_em: agora });
    await inserir(orgA, 'atribuicoes', { perfil_id: perfil, conta_id: conta });
  });

  it('recusam o perfil, o grupo e o local de outra organização', async () => {
    const conta = await criarConta(orgA);
    await expect(
      inserir(orgA, 'atribuicoes', { perfil_id: await criarPerfil(orgB), conta_id: conta }),
    ).rejects.toThrow(/atribuicoes_perfil_fk/);
    await expect(
      inserir(orgA, 'atribuicoes', {
        perfil_id: await criarPerfil(orgA),
        grupo_id: await criarGrupo(orgB),
      }),
    ).rejects.toThrow(/atribuicoes_grupo_fk/);
    const localDeB = await inserir(orgB, 'locais', {
      nome: 'Doca',
      nome_normalizado: `doca ${proximo()}`,
      tipo: 'outro',
    });
    await expect(
      inserir(orgA, 'atribuicoes', {
        perfil_id: await criarPerfil(orgA),
        conta_id: conta,
        local_id: localDeB,
      }),
    ).rejects.toThrow(/atribuicoes_local_fk/);
  });

  it('cada organização vê só as próprias', async () => {
    const { rows } = await emTransacao(app, orgB, (c) =>
      c.query<{ org_id: string }>('select distinct org_id from atribuicoes'),
    );
    expect(rows.every((r) => r.org_id === orgB)).toBe(true);
  });
});
