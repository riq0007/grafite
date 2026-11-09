// A gerência do AD pela API (spec diretorio-ad, "Gerência dos usuários do AD" e "Gerência dos grupos
// do AD"; change integracao-ad-ldap, design, decisão 4), com o AD em memória: a busca, o acesso
// liberado pelo grupo mapeado, a conta desativada, a senha pelo LDAPS, os membros de um grupo, a
// auditoria sem senha, o diretório não configurado e o AD fora do ar.
import {
  auditoria,
  diretorios,
  mapeamentosDoDiretorio,
  naOrganizacao,
  segredos,
} from '@grafite/db';
import { normalizarDn, normalizarTexto } from '@grafite/domain';
import { eq, like, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CHAVES_DO_COFRE_DE_TESTE } from '../../test/dependencias.ts';
import { CONTA_DE_SERVICO_DE_TESTE, criarAdDeTeste } from '../../test/diretorio.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
  novoIp,
  SEM_ENTRADA,
} from '../../test/integracao.ts';
import { cifrarSegredo } from '../cofre/cifra.ts';

const host = 'grafite.gerencia-ad.local';
const ad = criarAdDeTeste();
let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const dns: Record<string, string> = {};
let segredoId = '';

const naOrg = <T>(fazer: Parameters<typeof naOrganizacao<T>>[2]) =>
  naOrganizacao(api.banco, org, fazer);

const gravarDiretorio = (servidor = 'ldaps://dc01.empresa.local') =>
  naOrg(async (tx) => {
    await tx.delete(diretorios);
    await tx.insert(diretorios).values({
      orgId: org,
      servidor,
      baseDn: 'DC=empresa,DC=local',
      segredoId,
      atributoDoUsuario: 'sAMAccountName',
      filtroDasPessoas: '(&(objectCategory=person)(objectClass=user))',
      ligado: true,
    });
  });

beforeAll(async () => {
  api = await abrirApi({ conectarDiretorio: ad.conectar });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const perfil = await criarPerfil(api, org, {
    nome: 'Diretório',
    permissoes: ['diretorio.administrar'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: perfil, contaId: ana.id });
  entradas.ana = await cliente.entrar('ana');

  dns.joao = ad.usuario({ usuario: 'joao.lima', nome: 'João Lima', senha: 'senha-do-joao' });
  dns.mariana = ad.usuario({ usuario: 'mariana.alves', nome: 'Mariana Alves', senha: 'x' });
  dns.suporte = ad.grupo('TI-Suporte', [dns.mariana]);
  dns.gestao = ad.grupo('TI-Gestao');

  await naOrg(async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`select uuidv7() as id`);
    segredoId = rows[0]?.id ?? '';
    await tx.insert(segredos).values({
      id: segredoId,
      orgId: org,
      nome: 'Conta do Grafite no AD',
      nomeNormalizado: normalizarTexto('Conta do Grafite no AD'),
      tipo: 'conta-administrativa',
      classificacao: 'equipamento',
      identificador: CONTA_DE_SERVICO_DE_TESTE.usuario,
      ...cifrarSegredo({ valor: CONTA_DE_SERVICO_DE_TESTE.senha }, CHAVES_DO_COFRE_DE_TESTE, {
        orgId: org,
        segredoId,
      }),
    });
    const { rows: grupo } = await tx.execute<{ id: string }>(
      sql`insert into grupos (org_id, nome, nome_normalizado) values (${org}, 'Técnicos', 'tecnicos') returning id`,
    );
    await tx.execute(
      sql`insert into atribuicoes (org_id, perfil_id, grupo_id) select ${org}, id, ${grupo[0]?.id} from perfis where nome = 'Diretório'`,
    );
    await tx.insert(mapeamentosDoDiretorio).values({
      orgId: org,
      grupoDn: dns.suporte ?? '',
      grupoDnNormalizado: normalizarDn(dns.suporte ?? ''),
      grupoId: grupo[0]?.id ?? '',
    });
  });
  await gravarDiretorio();
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(() => {
  ad.estado.foraDoAr = false;
});

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const entrarPeloAd = (usuario: string, senha: string) =>
  api.app.inject({
    method: 'POST',
    url: '/sessao',
    remoteAddress: novoIp(),
    headers: { host, 'sec-fetch-site': 'same-origin' },
    payload: { usuario, senha },
  });
const registros = (acao: string) =>
  naOrg((tx) =>
    tx.select({ dados: auditoria.dados }).from(auditoria).where(like(auditoria.acao, acao)),
  );

describe('os usuários do AD', () => {
  it('Acesso liberado pelo Grafite: o João entra no grupo mapeado e passa a entrar', async () => {
    const busca = await cliente.consultar('/diretorio/usuarios?busca=joao', como('ana'));
    expect(busca.statusCode, busca.body).toBe(200);
    expect(busca.json().usuarios).toEqual([
      {
        dn: dns.joao,
        usuario: 'joao.lima',
        nome: 'João Lima',
        email: null,
        ativa: true,
        grupos: [],
      },
    ]);
    expect((await entrarPeloAd('joao.lima', 'senha-do-joao')).statusCode).toBe(403);

    const r = await cliente.enviar('POST', '/diretorio/membros', como('ana'), {
      usuarioDn: dns.joao,
      grupoDn: dns.suporte,
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().grupos).toEqual([
      {
        dn: dns.suporte,
        nome: 'TI-Suporte',
        mapeadoPara: { id: expect.any(String), nome: 'Técnicos' },
      },
    ]);
    expect(ad.gruposDe(dns.joao ?? '')).toEqual(['TI-Suporte']);
    expect(await registros('diretorio.membro-incluido')).toEqual([
      { dados: { usuarioDn: dns.joao, grupoDn: dns.suporte } },
    ]);
    expect((await entrarPeloAd('joao.lima', 'senha-do-joao')).statusCode).toBe(200);
  });

  it('Conta desativada no AD: a situação muda, e a entrada é recusada', async () => {
    const r = await cliente.enviar('POST', '/diretorio/usuarios/situacao', como('ana'), {
      dn: dns.joao,
      ativa: false,
    });
    expect(r.json().ativa).toBe(false);
    expect(ad.ativa(dns.joao ?? '')).toBe(false);
    expect((await entrarPeloAd('joao.lima', 'senha-do-joao')).statusCode).toBe(401);
    await cliente.enviar('POST', '/diretorio/usuarios/situacao', como('ana'), {
      dn: dns.joao,
      ativa: true,
    });
    expect((await registros('diretorio.conta-%ativada')).length).toBe(2);
  });

  it('redefine a senha pelo LDAPS, sem a senha na auditoria; pelo ldap://, recusa antes do AD', async () => {
    const r = await cliente.enviar('POST', '/diretorio/usuarios/senha', como('ana'), {
      dn: dns.joao,
      senha: 'Nova@2026',
    });
    expect(r.statusCode, r.body).toBe(204);
    expect(ad.senhaDe(dns.joao ?? '')).toBe('Nova@2026');
    expect(JSON.stringify(await registros('diretorio.senha-redefinida'))).not.toContain(
      'Nova@2026',
    );
    const curta = await cliente.enviar('POST', '/diretorio/usuarios/senha', como('ana'), {
      dn: dns.joao,
      senha: 'curta',
    });
    expect(curta.statusCode).toBe(502);
    expect(curta.json().detail).toBe('A senha nova não atende à política de senhas do AD.');

    await gravarDiretorio('ldap://dc01.empresa.local');
    try {
      const semTls = await cliente.enviar('POST', '/diretorio/usuarios/senha', como('ana'), {
        dn: dns.joao,
        senha: 'Outra@2026',
      });
      expect(semTls.statusCode).toBe(409);
      expect(semTls.json().detail).toBe('A redefinição da senha exige o ldaps://.');
      expect(ad.senhaDe(dns.joao ?? '')).toBe('Nova@2026');
    } finally {
      await gravarDiretorio();
    }
  });
});

describe('os grupos do AD', () => {
  it('Membro incluído pelo grupo: a lista mostra o membro, e tirar o retira', async () => {
    const busca = await cliente.consultar('/diretorio/grupos?busca=TI', como('ana'));
    expect(busca.json().grupos).toEqual([
      {
        dn: dns.suporte,
        nome: 'TI-Suporte',
        membros: 2,
        mapeadoPara: { id: expect.any(String), nome: 'Técnicos' },
      },
      { dn: dns.gestao, nome: 'TI-Gestao', membros: 0, mapeadoPara: null },
    ]);
    await cliente.enviar('POST', '/diretorio/membros', como('ana'), {
      usuarioDn: dns.mariana,
      grupoDn: dns.gestao,
    });
    const membros = await cliente.consultar(
      `/diretorio/membros?grupo=${encodeURIComponent(dns.gestao ?? '')}`,
      como('ana'),
    );
    expect(membros.json().grupo).toMatchObject({ nome: 'TI-Gestao', membros: 1 });
    expect(membros.json().membros.map((membro: { usuario: string }) => membro.usuario)).toEqual([
      'mariana.alves',
    ]);
    const tirado = await cliente.enviar('POST', '/diretorio/membros/retirada', como('ana'), {
      usuarioDn: dns.mariana,
      grupoDn: dns.gestao,
    });
    expect(tirado.json().grupos.map((grupo: { nome: string }) => grupo.nome)).toEqual([
      'TI-Suporte',
    ]);
    expect((await registros('diretorio.membro-retirado')).length).toBe(1);
  });
});

describe('as falhas', () => {
  it('o AD fora do ar responde 502 com o motivo, e o grupo que não existe, 404', async () => {
    ad.estado.foraDoAr = true;
    const fora = await cliente.consultar('/diretorio/usuarios', como('ana'));
    expect(fora.statusCode).toBe(502);
    expect(fora.json().detail).toBe('O servidor não respondeu.');
    ad.estado.foraDoAr = false;
    const sumiu = await cliente.consultar(
      `/diretorio/membros?grupo=${encodeURIComponent('CN=Sumiu,DC=empresa')}`,
      como('ana'),
    );
    expect(sumiu.statusCode).toBe(404);
  });

  it('Diretório não configurado: as buscas respondem 409 com o motivo', async () => {
    await naOrg((tx) => tx.delete(diretorios).where(eq(diretorios.orgId, org)));
    try {
      const r = await cliente.consultar('/diretorio/grupos', como('ana'));
      expect(r.statusCode).toBe(409);
      expect(r.json().detail).toBe('O diretório ainda não foi configurado.');
    } finally {
      await gravarDiretorio();
    }
  });
});
