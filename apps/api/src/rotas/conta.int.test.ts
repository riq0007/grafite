// A conta e a troca da senha (specs contas-de-acesso e entrada-e-sessoes): os dados sem o hash, a
// regra da senha, a senha atual conferida e contando no bloqueio, as outras sessões encerradas e a
// pendência da senha temporária resolvida.
import { auditoria, naOrganizacao, tentativasDeEntrada } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi, criarConta, criarOrganizacao } from '../../test/integracao.ts';

const host = 'grafite.conta.local';
const senha = 'cavalo bateria grampo correto';
const senhaNova = 'girafa azul no telhado do vizinho';

let api: ApiDeTeste;
let org = '';
let ipDoCaso = 0;
const novoIp = () => `10.4.${Math.floor(++ipDoCaso / 250)}.${ipDoCaso % 250}`;

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  for (const usuario of ['ana', 'davi', 'eva', 'fabio', 'gil']) {
    await criarConta(api, org, { usuario, senha });
  }
  await criarConta(api, org, { usuario: 'bruno', senha, senhaTemporaria: true });
  await criarConta(api, org, {
    usuario: 'carla',
    senha,
    senhaTemporaria: true,
    exigeDoisPassos: true,
  });
});

afterAll(async () => {
  await api?.fechar();
});

interface Entrada {
  cookie: string;
  csrf: string;
}

async function entrar(usuario: string, comSenha = senha) {
  const r = await api.app.inject({
    method: 'POST',
    url: '/sessao',
    remoteAddress: novoIp(),
    headers: { host, 'sec-fetch-site': 'same-origin' },
    payload: { usuario, senha: comSenha },
  });
  return {
    status: r.statusCode,
    entrada: {
      cookie: String(r.headers['set-cookie']).split(';')[0] ?? '',
      csrf: r.json().sessao?.csrf ?? '',
    } satisfies Entrada,
  };
}

function trocarSenha({ cookie, csrf }: Entrada, corpo: { senhaAtual: string; senhaNova: string }) {
  return api.app.inject({
    method: 'PUT',
    url: '/conta/senha',
    remoteAddress: novoIp(),
    headers: { host, cookie, 'x-grafite-csrf': csrf, 'sec-fetch-site': 'same-origin' },
    payload: corpo,
  });
}

const consultar = (url: string, { cookie }: Entrada) =>
  api.app.inject({ method: 'GET', url, remoteAddress: novoIp(), headers: { host, cookie } });

describe('GET /conta', () => {
  it('traz o usuário, o nome, o e-mail e a situação dos dois passos, sem o hash', async () => {
    const { entrada } = await entrar('ana');
    const r = await consultar('/conta', entrada);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      usuario: 'ana',
      nome: 'ana',
      email: null,
      doisPassos: {
        situacao: 'desativada',
        exigida: false,
        exigidaPor: { conta: false, perfis: [] },
        codigosRestantes: 0,
      },
    });
    expect(r.body).not.toContain('argon2id');
  });
});

describe('PUT /conta/senha', () => {
  it('recusa a senha nova fora da regra, com o motivo no campo, sem mudar nada', async () => {
    const { entrada } = await entrar('ana');
    const r = await trocarSenha(entrada, { senhaAtual: senha, senhaNova: 'curta123' });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:senha-recusada',
      campos: { senhaNova: 'Use pelo menos 12 caracteres.' },
    });
    expect((await entrar('ana')).status).toBe(200);
  });

  it('recusa a senha atual errada e conta a recusa no bloqueio', async () => {
    const { entrada } = await entrar('davi');
    const r = await trocarSenha(entrada, { senhaAtual: 'senha errada aqui', senhaNova });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:senha-atual-incorreta',
      campos: { senhaAtual: 'A senha atual está incorreta.' },
    });
    const [tentativa] = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(tentativasDeEntrada).where(eq(tentativasDeEntrada.usuario, 'davi')),
    );
    expect(tentativa?.falhasSeguidas).toBe(1);
  });

  it('com o usuário bloqueado, a troca é recusada mesmo com a senha certa', async () => {
    const { entrada } = await entrar('eva');
    for (let i = 0; i < 5; i++) {
      await trocarSenha(entrada, { senhaAtual: 'senha errada aqui', senhaNova });
    }
    const r = await trocarSenha(entrada, { senhaAtual: senha, senhaNova });
    expect(r.statusCode).toBe(429);
    expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:entrada-bloqueada' });
  });

  it('recusa a senha nova igual à atual', async () => {
    const { entrada } = await entrar('bruno');
    const r = await trocarSenha(entrada, { senhaAtual: senha, senhaNova: senha });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({
      senhaNova: 'A senha nova precisa ser diferente da atual.',
    });
  });

  it('troca a senha, encerra as outras sessões e mantém a atual', async () => {
    const { entrada: atual } = await entrar('fabio');
    const { entrada: outra } = await entrar('fabio');
    const r = await trocarSenha(atual, { senhaAtual: senha, senhaNova });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ sessao: { pendencia: null }, sessoesEncerradas: 1 });
    expect((await consultar('/sessao', outra)).json().sessao).toBeNull();
    expect((await consultar('/sessao', atual)).json().sessao).not.toBeNull();
    expect((await entrar('fabio', senha)).status).toBe(401);
    expect((await entrar('fabio', senhaNova)).status).toBe(200);
    const registros = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(auditoria).where(eq(auditoria.acao, 'senha.trocada')),
    );
    expect(registros).toHaveLength(1);
    expect(JSON.stringify(registros)).not.toContain(senhaNova);
  });

  it('resolve a pendência da senha temporária: a sessão passa a valer, com um token novo', async () => {
    const { entrada } = await entrar('bruno');
    const r = await trocarSenha(entrada, { senhaAtual: senha, senhaNova });
    expect(r.statusCode).toBe(200);
    expect(r.json().sessao.pendencia).toBeNull();
    const cookieNovo = String(r.headers['set-cookie']).split(';')[0] ?? '';
    expect(cookieNovo).not.toBe(entrada.cookie);
    expect((await consultar('/sessao', entrada)).json().sessao).toBeNull();
    expect(
      (await consultar('/sessao', { cookie: cookieNovo, csrf: '' })).json().sessao,
    ).toMatchObject({
      pendencia: null,
    });
  });

  it('com os dois passos exigidos, a próxima pendência é o cadastro deles', async () => {
    const { entrada } = await entrar('carla');
    const r = await trocarSenha(entrada, { senhaAtual: senha, senhaNova });
    expect(r.statusCode).toBe(200);
    expect(r.json().sessao.pendencia).toBe('cadastrar-dois-passos');
    expect(r.headers['set-cookie']).toBeUndefined();
  });

  it('a sessão que espera outro passo não troca a senha', async () => {
    const { entrada } = await entrar('carla', senhaNova);
    const r = await trocarSenha(entrada, { senhaAtual: senhaNova, senhaNova: senha });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ pendencia: 'cadastrar-dois-passos' });
  });
});
