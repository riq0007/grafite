// O diretório pela API (spec diretorio-ad; change integracao-ad-ldap): a configuração com a conta de
// serviço do Cofre, sem a senha na resposta nem na auditoria; as recusas; o teste da conexão com a
// configuração da tela, com o AD em memória; e os mapeamentos dos grupos do AD.
import { auditoria, eventos, grupos, naOrganizacao, segredos } from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AC_DE_TESTE } from '../../test/ac-de-teste.ts';
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
  SEM_ENTRADA,
} from '../../test/integracao.ts';
import { cifrarSegredo } from '../cofre/cifra.ts';

const host = 'grafite.diretorio.local';
const ad = criarAdDeTeste();
let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const ids: Record<string, string> = {};

/** Um login do Cofre, cifrado com a chave de teste, direto no banco. */
async function login(nome: string, usuario: string, senha: string, tipo = 'conta-administrativa') {
  return naOrganizacao(api.banco, org, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`select uuidv7() as id`);
    const id = rows[0]?.id ?? '';
    await tx.insert(segredos).values({
      id,
      orgId: org,
      nome,
      nomeNormalizado: normalizarTexto(nome),
      tipo: tipo as 'conta-administrativa',
      classificacao: 'equipamento',
      identificador: usuario || null,
      ...cifrarSegredo({ valor: senha }, CHAVES_DO_COFRE_DE_TESTE, { orgId: org, segredoId: id }),
    });
    return id;
  });
}

async function grupo(nome: string) {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .insert(grupos)
      .values({ orgId: org, nome, nomeNormalizado: normalizarTexto(nome) })
      .returning({ id: grupos.id });
    return linha?.id ?? '';
  });
}

beforeAll(async () => {
  api = await abrirApi({ conectarDiretorio: ad.conectar });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const diretorio = await criarPerfil(api, org, {
    nome: 'Diretório',
    permissoes: ['diretorio.administrar'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: diretorio, contaId: ana.id });
  await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  for (const usuario of ['ana', 'bruno']) entradas[usuario] = await cliente.entrar(usuario);
  ids.servico = await login(
    'Conta do Grafite no AD',
    CONTA_DE_SERVICO_DE_TESTE.usuario,
    CONTA_DE_SERVICO_DE_TESTE.senha,
  );
  ids.errado = await login('Conta com senha velha', CONTA_DE_SERVICO_DE_TESTE.usuario, 'velha');
  ids.semUsuario = await login('Senha solta', '', 'qualquer');
  // A conta do AD cadastrada como Conta de serviço serve; a chave de API, não (change
  // conta-de-servico-no-diretorio).
  ids.contaDeServico = await login(
    'Conta de serviço do AD',
    'svc-grafite@empresa.local',
    'x',
    'conta-de-servico',
  );
  ids.chave = await login('Chave da API do AD', 'svc-grafite@empresa.local', 'x', 'chave-de-api');
  ids.tecnicos = await grupo('Técnicos');
  for (let indice = 0; indice < 3; indice++) {
    ad.usuario({ usuario: `pessoa${indice}`, nome: `Pessoa ${indice}`, senha: 'x' });
  }
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  ad.estado.foraDoAr = false;
  ad.estado.acDaEmpresa = null;
  await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
});

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const configuracao = (mudancas: object = {}) => ({
  servidor: 'ldaps://dc01.empresa.local',
  baseDn: 'DC=empresa,DC=local',
  segredoId: ids.servico,
  ligado: true,
  ...mudancas,
});

describe('a configuração', () => {
  it('Diretório configurado: grava com a conta de serviço do Cofre, sem a senha', async () => {
    const vazio = await cliente.consultar('/diretorio', como('ana'));
    expect(vazio.json()).toEqual({
      diretorio: null,
      mapeamentos: [],
      grupos: [{ id: ids.tecnicos, nome: 'Técnicos' }],
    });
    const logins = await cliente.consultar('/diretorio/logins', como('ana'));
    expect(logins.json()).toEqual({
      logins: [
        { id: ids.errado, nome: 'Conta com senha velha' },
        { id: ids.contaDeServico, nome: 'Conta de serviço do AD' },
        { id: ids.servico, nome: 'Conta do Grafite no AD' },
      ],
      motivo: null,
    });

    const r = await cliente.enviar('PUT', '/diretorio', como('ana'), configuracao());
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().diretorio).toEqual({
      servidor: 'ldaps://dc01.empresa.local',
      baseDn: 'DC=empresa,DC=local',
      conta: { id: ids.servico, nome: 'Conta do Grafite no AD' },
      atributoDoUsuario: 'sAMAccountName',
      filtroDasPessoas: '(&(objectCategory=person)(objectClass=user))',
      conferirCertificado: true,
      acDoServidor: null,
      ligado: true,
    });
    expect(r.body).not.toContain(CONTA_DE_SERVICO_DE_TESTE.senha);
    const [registro] = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(auditoria).where(eq(auditoria.acao, 'diretorio.configurado')),
    );
    expect(registro?.depois).toMatchObject({
      contaDeServico: 'Conta do Grafite no AD',
      acDoServidor: 'sem a AC',
    });
    expect(JSON.stringify(registro)).not.toContain(CONTA_DE_SERVICO_DE_TESTE.senha);
    const gravados = await naOrganizacao(api.banco, org, (tx) =>
      tx.select({ tipo: eventos.tipo }).from(eventos),
    );
    expect(gravados).toEqual([{ tipo: 'diretorio.mudou' }]);
  });

  it('recusa o servidor, a base e a conta de serviço fora do Cofre', async () => {
    const r = await cliente.enviar(
      'PUT',
      '/diretorio',
      como('ana'),
      configuracao({ servidor: 'http://dc01', baseDn: '', segredoId: ids.semUsuario }),
    );
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({
      servidor: 'Informe o servidor como ldap://servidor ou ldaps://servidor.',
      baseDn: 'Informe a base DN, como DC=empresa,DC=local.',
    });
    const semLogin = await cliente.enviar(
      'PUT',
      '/diretorio',
      como('ana'),
      configuracao({ segredoId: ids.semUsuario }),
    );
    expect(semLogin.json().campos).toEqual({
      segredoId: 'Escolha a conta de serviço no Cofre: um login ativo, com o usuário.',
    });
  });

  it('Certificado que não é da AC: recusa o texto fora do PEM e o bloco que não abre, e nada muda', async () => {
    const antes = (await cliente.consultar('/diretorio', como('ana'))).json();
    for (const acDoServidor of [
      'a raiz da AC da empresa',
      ['-----BEGIN CERTIFICATE-----', 'NaoEhUmCertificado==', '-----END CERTIFICATE-----'].join(
        '\n',
      ),
    ]) {
      const r = await cliente.enviar(
        'PUT',
        '/diretorio',
        como('ana'),
        configuracao({ acDoServidor }),
      );
      expect(r.statusCode).toBe(400);
      expect(r.json().campos).toEqual({
        acDoServidor:
          'Cole o certificado da AC em PEM, que começa com -----BEGIN CERTIFICATE-----.',
      });
    }
    expect((await cliente.consultar('/diretorio', como('ana'))).json()).toEqual(antes);
  });

  it('grava a AC do servidor, que a gerência usa, e a auditoria registra só se ela foi informada', async () => {
    const r = await cliente.enviar(
      'PUT',
      '/diretorio',
      como('ana'),
      configuracao({ acDoServidor: AC_DE_TESTE.split('\n').join('\r\n') }),
    );
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().diretorio.acDoServidor).toBe(AC_DE_TESTE);
    ad.estado.acDaEmpresa = AC_DE_TESTE;
    const busca = await cliente.consultar('/diretorio/usuarios?busca=pessoa', como('ana'));
    expect(busca.statusCode, busca.body).toBe(200);
    expect(ad.estado.acessos.at(-1)?.acDoServidor).toBe(AC_DE_TESTE);
    const registros = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(auditoria).where(eq(auditoria.acao, 'diretorio.configurado')),
    );
    const informada = registros.find(
      (registro) =>
        (registro.depois as { acDoServidor?: string } | null)?.acDoServidor === 'informada',
    );
    expect(informada?.antes).toMatchObject({ acDoServidor: 'sem a AC' });
    expect(JSON.stringify(registros)).not.toContain('BEGIN CERTIFICATE');
    const sem = await cliente.enviar(
      'PUT',
      '/diretorio',
      como('ana'),
      configuracao({ acDoServidor: '' }),
    );
    expect(sem.json().diretorio.acDoServidor).toBeNull();
  });

  it('sem diretorio.administrar, recusa com 403', async () => {
    expect((await cliente.consultar('/diretorio', como('bruno'))).statusCode).toBe(403);
  });
});

describe('o teste da conexão', () => {
  it('conta os usuários com a configuração da tela, antes de gravada', async () => {
    const r = await cliente.enviar('POST', '/diretorio/teste', como('ana'), configuracao());
    expect(r.json()).toEqual({ ok: true, mensagem: 'Conectado: 3 usuários na base.' });
    expect(ad.estado.acessos.at(-1)).toMatchObject({
      servidor: 'ldaps://dc01.empresa.local',
      conta: CONTA_DE_SERVICO_DE_TESTE,
    });
  });

  it('Certificado emitido pela AC da empresa: com a AC, conecta; sem ela, o certificado não é confiável', async () => {
    ad.estado.acDaEmpresa = AC_DE_TESTE;
    const com = await cliente.enviar(
      'POST',
      '/diretorio/teste',
      como('ana'),
      configuracao({ acDoServidor: AC_DE_TESTE }),
    );
    expect(com.json()).toEqual({ ok: true, mensagem: 'Conectado: 3 usuários na base.' });
    expect(ad.estado.acessos.at(-1)).toMatchObject({
      conferirCertificado: true,
      acDoServidor: AC_DE_TESTE,
    });
    const sem = await cliente.enviar('POST', '/diretorio/teste', como('ana'), configuracao());
    expect(sem.json()).toEqual({
      ok: false,
      mensagem: 'O certificado do servidor não é confiável.',
    });
  });

  it('Conta de serviço recusada, e o servidor que não responde', async () => {
    const recusada = await cliente.enviar(
      'POST',
      '/diretorio/teste',
      como('ana'),
      configuracao({ segredoId: ids.errado }),
    );
    expect(recusada.json()).toEqual({ ok: false, mensagem: 'A conta de serviço foi recusada.' });
    ad.estado.foraDoAr = true;
    const fora = await cliente.enviar('POST', '/diretorio/teste', como('ana'), configuracao());
    expect(fora.json()).toEqual({ ok: false, mensagem: 'O servidor não respondeu.' });
  });
});

describe('os mapeamentos', () => {
  it('Grupo mapeado: liga o grupo do AD ao do Grafite, e o mesmo DN não se repete', async () => {
    const r = await cliente.enviar('POST', '/diretorio/mapeamentos', como('ana'), {
      grupoDn: 'CN=TI-Suporte,OU=Grupos,DC=empresa,DC=local',
      grupoId: ids.tecnicos,
    });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({
      grupoDn: 'CN=TI-Suporte,OU=Grupos,DC=empresa,DC=local',
      nomeNoAd: 'TI-Suporte',
      grupo: { id: ids.tecnicos, nome: 'Técnicos' },
    });
    const repetido = await cliente.enviar('POST', '/diretorio/mapeamentos', como('ana'), {
      grupoDn: 'cn=ti-suporte, ou=grupos,dc=empresa,dc=local',
      grupoId: ids.tecnicos,
    });
    expect(repetido.statusCode).toBe(409);
    expect(repetido.json().campos).toEqual({ grupoDn: 'Este grupo do AD já tem um mapeamento.' });
    const lido = await cliente.consultar('/diretorio', como('ana'));
    expect(lido.json().mapeamentos).toHaveLength(1);

    const removido = await cliente.enviar(
      'DELETE',
      `/diretorio/mapeamentos/${r.json().id}`,
      como('ana'),
    );
    expect(removido.statusCode).toBe(204);
    expect((await cliente.consultar('/diretorio', como('ana'))).json().mapeamentos).toEqual([]);
    const acoes = await naOrganizacao(api.banco, org, (tx) =>
      tx.select({ acao: auditoria.acao }).from(auditoria),
    );
    expect(acoes.map(({ acao }) => acao)).toEqual(
      expect.arrayContaining(['diretorio.mapeamento-criado', 'diretorio.mapeamento-removido']),
    );
  });

  it('recusa o grupo do Grafite que não existe', async () => {
    const r = await cliente.enviar('POST', '/diretorio/mapeamentos', como('ana'), {
      grupoDn: 'CN=Outro,DC=empresa',
      grupoId: '00000000-0000-4000-8000-000000000000',
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({ grupoId: 'Escolha um grupo ativo do Grafite.' });
  });
});
