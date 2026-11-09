// A entrada com usuário e senha (spec entrada-e-sessoes): a mesma recusa para usuário inexistente,
// senha errada e conta inativa, o bloqueio progressivo por usuário digitado, as pendências e a
// auditoria de cada entrada e recusa.
import { auditoria, contas, doisPassos, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi, criarConta, criarOrganizacao } from '../../test/integracao.ts';
import { NOME_DO_COOKIE } from '../acesso/sessoes.ts';

const host = 'grafite.entrada.local';
const senha = 'cavalo bateria grampo correto';
const MINUTO = 60_000;

let api: ApiDeTeste;
let org = '';
let ipDoCaso = 0;
/** Um IP por caso: o limite de 20 entradas por minuto, que corre no relógio real, não vaza. */
const novoIp = () => `10.1.${Math.floor(++ipDoCaso / 250)}.${ipDoCaso % 250}`;

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  await criarConta(api, org, { usuario: 'ana', senha });
  await criarConta(api, org, { usuario: 'lucas', senha });
  await criarConta(api, org, { usuario: 'marta', senha });
  await criarConta(api, org, { usuario: 'bruno', senha, senhaTemporaria: true });
  await criarConta(api, org, { usuario: 'carla', senha, exigeDoisPassos: true });
  const davi = await criarConta(api, org, { usuario: 'davi', senha });
  const eva = await criarConta(api, org, { usuario: 'eva', senha });
  await naOrganizacao(api.banco, org, async (tx) => {
    await tx.insert(doisPassos).values({
      orgId: org,
      contaId: davi.id,
      segredoCifrado: Buffer.alloc(49),
      ativadoEm: api.relogio.agora(),
    });
    await tx.update(contas).set({ situacao: 'inativa' }).where(eq(contas.id, eva.id));
  });
});

afterAll(async () => {
  await api?.fechar();
});

function entrar(usuario: string, comSenha: string, ip = novoIp()) {
  return api.app.inject({
    method: 'POST',
    url: '/sessao',
    remoteAddress: ip,
    headers: {
      host,
      'sec-fetch-site': 'same-origin',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0.0.0 Safari/537.36',
    },
    payload: { usuario, senha: comSenha },
  });
}

function consultar(cookie?: string, endereco = host) {
  return api.app.inject({
    method: 'GET',
    url: '/sessao',
    remoteAddress: novoIp(),
    headers: { host: endereco, ...(cookie ? { cookie } : {}) },
  });
}

const cookieDa = (resposta: Awaited<ReturnType<typeof entrar>>) =>
  String(resposta.headers['set-cookie']).split(';')[0] ?? '';

const semRastreio = (corpo: Record<string, unknown>) => {
  const { codigoDeRastreio: _rastreio, ...resto } = corpo;
  return resto;
};

const registros = (acao: string) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.select().from(auditoria).where(eq(auditoria.acao, acao)).orderBy(auditoria.id),
  );

describe('GET /sessao', () => {
  it('sem cookie, diz o nome da organização e que não há sessão', async () => {
    const r = await consultar();
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      ambiente: 'desenvolvimento',
      organizacao: {
        nome: 'Empresa',
        preferencias: {},
        operaOServidor: false,
        modulosDesligados: [],
      },
      sessao: null,
    });
  });

  it('por um endereço desconhecido, responde endereco-desconhecido', async () => {
    const r = await consultar(undefined, 'grafite.ninguem.local');
    expect(r.statusCode).toBe(404);
    expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:endereco-desconhecido' });
  });
});

describe('POST /sessao', () => {
  it('com usuário e senha certos, grava o cookie e devolve a sessão valendo', async () => {
    const r = await entrar('  Ana ', senha);
    expect(r.statusCode).toBe(200);
    expect(String(r.headers['set-cookie'])).toMatch(new RegExp(`^${NOME_DO_COOKIE}=`));
    const corpo = r.json();
    expect(corpo).toMatchObject({
      organizacao: { nome: 'Empresa' },
      sessao: { conta: { usuario: 'ana', nome: 'ana' }, pendencia: null },
    });
    expect(corpo.sessao.csrf).toEqual(expect.any(String));
    expect(new Date(corpo.sessao.expiraEm).getTime()).toBe(
      api.relogio.agora().getTime() + 12 * 60 * MINUTO,
    );
    expect((await consultar(cookieDa(r))).json().sessao).toEqual(corpo.sessao);
  });

  it('registra a sessão iniciada e a entrada concluída, sem a senha', async () => {
    await entrar('ana', senha);
    const [iniciada] = (await registros('sessao.iniciada')).slice(-1);
    const [concluida] = (await registros('entrada.concluida')).slice(-1);
    expect(iniciada).toMatchObject({
      atorTipo: 'conta',
      alvoTipo: 'sessao',
      dados: { pendencia: null },
    });
    expect(concluida).toMatchObject({ atorTipo: 'conta', alvoId: iniciada?.alvoId });
    expect(JSON.stringify([iniciada, concluida])).not.toContain(senha);
  });

  it('a senha errada, o usuário inexistente e a conta inativa recebem a mesma recusa', async () => {
    const respostas = [
      await entrar('ana', 'senha errada de propósito'),
      await entrar('ninguem.aqui', senha),
      await entrar('eva', senha),
    ];
    for (const r of respostas) {
      expect(r.statusCode).toBe(401);
      expect(r.headers['set-cookie']).toBeUndefined();
    }
    const corpos = respostas.map((r) => semRastreio(r.json()));
    expect(corpos[0]).toEqual({
      type: 'urn:grafite:problema:credenciais-invalidas',
      title: 'Credenciais inválidas',
      status: 401,
      detail: 'Usuário ou senha incorretos.',
    });
    expect(corpos[1]).toEqual(corpos[0]);
    expect(corpos[2]).toEqual(corpos[0]);
  });

  it('a auditoria guarda o motivo real de cada recusa', async () => {
    await entrar('eva', senha);
    const [ultima] = (await registros('entrada.recusada')).slice(-1);
    expect(ultima).toMatchObject({
      atorTipo: 'anonimo',
      dados: { usuario: 'eva', motivo: 'conta-inativa' },
    });
  });

  it('recusa o pedido sem o usuário, com a mensagem do campo', async () => {
    const r = await api.app.inject({
      method: 'POST',
      url: '/sessao',
      remoteAddress: novoIp(),
      headers: { host, 'sec-fetch-site': 'same-origin' },
      payload: { senha },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({ usuario: 'Informe o usuário.' });
  });
});

describe('bloqueio progressivo', () => {
  const bloqueio = async (usuario: string) => {
    const r = await entrar(usuario, senha);
    return { status: r.statusCode, corpo: r.json(), espera: r.headers['retry-after'] };
  };

  it('a quinta recusa seguida bloqueia por 1 min, até para a senha certa, sem contar as tentativas do bloqueio', async () => {
    const usuario = 'lucas';
    for (let i = 0; i < 4; i++) expect((await entrar(usuario, 'errada!')).statusCode).toBe(401);
    expect((await entrar(usuario, 'errada!')).statusCode).toBe(401);
    const [bloqueada] = (await registros('entrada.bloqueada')).slice(-1);
    expect(bloqueada?.dados).toMatchObject({ usuario: 'lucas' });

    const durante = await bloqueio(usuario);
    expect(durante.status).toBe(429);
    expect(durante.corpo).toMatchObject({
      type: 'urn:grafite:problema:entrada-bloqueada',
      detail: 'Muitas tentativas com este usuário. Tente de novo em 1 min.',
    });
    expect(durante.espera).toBe('60');

    api.relogio.avancar(MINUTO - 1000);
    expect((await bloqueio(usuario)).status).toBe(429);
    api.relogio.avancar(1000);
    expect((await entrar(usuario, 'errada!')).statusCode).toBe(401);
    expect((await bloqueio(usuario)).corpo.detail).toBe(
      'Muitas tentativas com este usuário. Tente de novo em 2 min.',
    );
    api.relogio.avancar(2 * MINUTO);
    expect((await entrar(usuario, senha)).statusCode).toBe(200);
  });

  it('a entrada com sucesso zera a contagem', async () => {
    for (let i = 0; i < 4; i++) await entrar('marta', 'errada!');
    expect((await entrar('marta', senha)).statusCode).toBe(200);
    expect((await entrar('marta', 'errada!')).statusCode).toBe(401);
    expect((await entrar('marta', senha)).statusCode).toBe(200);
  });

  it('o usuário que não existe também é bloqueado, com a mesma mensagem', async () => {
    for (let i = 0; i < 5; i++) await entrar('nao.existe', senha);
    const r = await bloqueio('nao.existe');
    expect(r.status).toBe(429);
    expect(r.corpo.detail).toBe('Muitas tentativas com este usuário. Tente de novo em 1 min.');
  });
});

describe('pendências', () => {
  it.each([
    ['bruno', 'trocar-senha'],
    ['carla', 'cadastrar-dois-passos'],
    ['davi', 'segundo-passo'],
  ])('a conta %s entra com a sessão pendente de %s', async (usuario, pendencia) => {
    const r = await entrar(usuario, senha);
    expect(r.statusCode).toBe(200);
    expect(r.json().sessao.pendencia).toBe(pendencia);
    expect(new Date(r.json().sessao.expiraEm).getTime()).toBe(
      api.relogio.agora().getTime() + 10 * MINUTO,
    );
  });

  it('a sessão pendente termina 10 min depois da entrada', async () => {
    const r = await entrar('bruno', senha);
    api.relogio.avancar(10 * MINUTO);
    expect((await consultar(cookieDa(r))).json().sessao).toBeNull();
  });

  it('a entrada pendente registra a sessão iniciada, e ainda não a entrada concluída', async () => {
    const antes = (await registros('entrada.concluida')).length;
    await entrar('davi', senha);
    const [iniciada] = (await registros('sessao.iniciada')).slice(-1);
    expect(iniciada?.dados).toEqual({ pendencia: 'segundo-passo' });
    expect((await registros('entrada.concluida')).length).toBe(antes);
  });
});

describe('limite de requisições da entrada', () => {
  it('a 21ª entrada do mesmo IP no minuto é recusada', async () => {
    const ip = novoIp();
    for (let i = 0; i < 20; i++) await entrar(`limite.${i}`, senha, ip);
    const r = await entrar('limite.21', senha, ip);
    expect(r.statusCode).toBe(429);
    expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:muitas-requisicoes' });
  });
});
