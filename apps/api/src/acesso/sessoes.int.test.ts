// A sessão guardada no servidor (spec entrada-e-sessoes): o token só em hash, o cookie seguro, a
// busca dentro da organização do endereço, as expirações e as guardas das rotas.
import { createHash } from 'node:crypto';
import { naOrganizacao, sessoes } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi, criarConta, criarOrganizacao } from '../../test/integracao.ts';
import { exigirAtiva, exigirSessao, instalarAcesso } from './escopo.ts';
import { criarResolvedorDeOrganizacao } from './organizacao.ts';
import { criarSessao, gravarCookieDaSessao, NOME_DO_COOKIE } from './sessoes.ts';

const HORA = 3_600_000;
const host = 'grafite.sessoes.local';
const hostDeB = 'grafite.sessoes-b.local';

let api: ApiDeTeste;
let orgA = '';
let contaId = '';
let contaTemporariaId = '';

beforeAll(async () => {
  api = await abrirApi();
  orgA = await criarOrganizacao(api, { nome: 'Organização A', enderecos: [host] });
  await criarOrganizacao(api, { nome: 'Organização B', enderecos: [hostDeB] });
  contaId = (await criarConta(api, orgA, { usuario: 'ana.souza' })).id;
  contaTemporariaId = (await criarConta(api, orgA, { usuario: 'bruno', senhaTemporaria: true })).id;
  const resolver = criarResolvedorDeOrganizacao({ banco: api.banco, agora: api.relogio.agora });
  await api.app.register(async (escopo) => {
    instalarAcesso(escopo, { banco: api.banco, agora: api.relogio.agora, resolver });
    escopo.get('/teste/sessao', { config: { semPermissao: 'entrada' } }, async (requisicao) => ({
      sessao: requisicao.sessao && {
        usuario: requisicao.sessao.usuario,
        pendencia: requisicao.sessao.pendencia,
      },
    }));
    escopo.get(
      '/teste/com-sessao',
      { config: { semPermissao: 'entrada' }, preHandler: exigirSessao },
      async () => ({ ok: true }),
    );
    escopo.get(
      '/teste/ativa',
      { config: { semPermissao: 'entrada' }, preHandler: exigirAtiva },
      async () => ({ ok: true }),
    );
    escopo.post('/teste/cookie', { config: { semPermissao: 'entrada' } }, async (_r, resposta) => {
      const agora = api.relogio.agora();
      gravarCookieDaSessao(
        resposta,
        'token-de-teste',
        new Date(agora.getTime() + 12 * HORA),
        agora,
      );
      return { ok: true };
    });
  });
});

afterAll(async () => {
  await api?.fechar();
});

function novaSessao(conta = contaId, pendente = false) {
  return naOrganizacao(api.banco, orgA, (tx) =>
    criarSessao(tx, {
      contaId: conta,
      momento: api.relogio.agora(),
      ip: '10.0.0.7',
      agente: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0.0.0 Safari/537.36',
      pendente,
    }),
  );
}

const pedir = (url: string, token?: string, endereco = host) =>
  api.app.inject({
    method: 'GET',
    url,
    headers: { host: endereco, ...(token ? { cookie: `${NOME_DO_COOKIE}=${token}` } : {}) },
  });

const sessaoVista = async (token: string, endereco = host) =>
  (await pedir('/teste/sessao', token, endereco)).json().sessao;

describe('o token e o cookie', () => {
  it('o banco guarda só o hash do token', async () => {
    const { id, token } = await novaSessao();
    const [linha] = await naOrganizacao(api.banco, orgA, (tx) =>
      tx.select().from(sessoes).where(eq(sessoes.id, id)),
    );
    expect(linha?.tokenHash).toEqual(createHash('sha256').update(token).digest());
    expect(JSON.stringify(linha)).not.toContain(token);
  });

  it('o cookie é __Host-, só por conexão segura, fora do alcance de scripts e SameSite=Lax', async () => {
    const r = await api.app.inject({
      method: 'POST',
      url: '/teste/cookie',
      headers: { host, 'sec-fetch-site': 'same-origin' },
      payload: {},
    });
    const cookie = String(r.headers['set-cookie']);
    expect(cookie).toMatch(/^__Host-grafite-sessao=token-de-teste;/);
    const atributos = cookie.split(/;\s*/).slice(1);
    expect(atributos).toEqual(
      expect.arrayContaining(['Max-Age=43200', 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax']),
    );
    expect(atributos.some((a) => a.startsWith('Domain='))).toBe(false);
  });
});

describe('a busca da sessão', () => {
  it('o cookie de uma sessão leva à conta dela', async () => {
    const { token } = await novaSessao();
    expect(await sessaoVista(token)).toEqual({ usuario: 'ana.souza', pendencia: null });
  });

  it('um token desconhecido é tratado como sem sessão', async () => {
    expect(await sessaoVista('token-que-ninguem-criou')).toBeNull();
  });

  it('o cookie de uma sessão de A, mandado ao endereço de B, é tratado como sem sessão', async () => {
    const { token } = await novaSessao();
    expect(await sessaoVista(token, hostDeB)).toBeNull();
  });

  it('a sessão pendente diz qual é o passo da vez', async () => {
    const { token } = await novaSessao(contaTemporariaId, true);
    expect(await sessaoVista(token)).toEqual({ usuario: 'bruno', pendencia: 'trocar-senha' });
  });
});

describe('a expiração', () => {
  it('termina depois de 2 h sem nenhuma requisição', async () => {
    const { token } = await novaSessao();
    api.relogio.avancar(2 * HORA - 1000);
    expect(await sessaoVista(token)).not.toBeNull();
    api.relogio.avancar(2 * HORA);
    expect(await sessaoVista(token)).toBeNull();
  });

  it('termina 12 h depois de passar a valer, mesmo com uso constante', async () => {
    const { token } = await novaSessao();
    for (let hora = 1; hora < 12; hora++) {
      api.relogio.avancar(HORA);
      expect(await sessaoVista(token)).not.toBeNull();
    }
    api.relogio.avancar(HORA);
    expect(await sessaoVista(token)).toBeNull();
  });

  it('a sessão pendente termina 10 min depois da entrada', async () => {
    const { token } = await novaSessao(contaTemporariaId, true);
    api.relogio.avancar(10 * 60_000);
    expect(await sessaoVista(token)).toBeNull();
  });

  it('o último uso só é regravado depois de 60 s', async () => {
    const { id, token } = await novaSessao();
    const ultimoUso = async () =>
      (
        await naOrganizacao(api.banco, orgA, (tx) =>
          tx.select({ ultimoUsoEm: sessoes.ultimoUsoEm }).from(sessoes).where(eq(sessoes.id, id)),
        )
      )[0]?.ultimoUsoEm;
    const criada = await ultimoUso();
    api.relogio.avancar(30_000);
    await sessaoVista(token);
    expect(await ultimoUso()).toEqual(criada);
    api.relogio.avancar(31_000);
    await sessaoVista(token);
    expect(await ultimoUso()).toEqual(api.relogio.agora());
  });
});

describe('as guardas', () => {
  it('sem sessão, a rota que exige sessão responde 401', async () => {
    const r = await pedir('/teste/com-sessao');
    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:sem-sessao' });
  });

  it('com a sessão pendente, a rota que exige a sessão valendo responde 403 com o passo da vez', async () => {
    const { token } = await novaSessao(contaTemporariaId, true);
    const r = await pedir('/teste/ativa', token);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:pendencia',
      detail: 'Conclua a entrada antes de continuar.',
      pendencia: 'trocar-senha',
    });
    expect((await pedir('/teste/com-sessao', token)).statusCode).toBe(200);
  });

  it('com a sessão valendo, as duas guardas deixam passar', async () => {
    const { token } = await novaSessao();
    expect((await pedir('/teste/ativa', token)).statusCode).toBe(200);
  });
});
