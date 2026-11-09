// O ambiente, a organização que opera o servidor e o endereço do cliente atrás do proxy (specs
// plataforma-base, https-interno e modulo-administracao; design do F2d, decisões 1, 10 e 15).
import { naOrganizacao, sessoes } from '@grafite/db';
import { desc } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi, criarConta, criarOrganizacao } from '../../test/integracao.ts';

const OPERADORA = 'grafite.operadora.local';
const OUTRO_DA_OPERADORA = 'grafite-op.operadora.local';
const CLIENTE = 'grafite.cliente.local';

let api: ApiDeTeste;
let semOperadora: ApiDeTeste;
let operadora = '';

beforeAll(async () => {
  api = await abrirApi({ ambiente: 'teste', organizacaoOperadora: OPERADORA });
  semOperadora = await abrirApi();
  operadora = await criarOrganizacao(api, {
    nome: 'Operadora',
    enderecos: [OPERADORA, OUTRO_DA_OPERADORA],
  });
  await criarOrganizacao(api, { nome: 'Cliente', enderecos: [CLIENTE] });
  await criarConta(api, operadora, { usuario: 'ana' });
});

afterAll(async () => {
  await api?.fechar();
  await semOperadora?.fechar();
});

const estado = (app: ApiDeTeste, host: string) =>
  app.app.inject({ method: 'GET', url: '/sessao', headers: { host } });

describe('o ambiente', () => {
  it('vem na saúde', async () => {
    const r = await api.app.inject({ method: 'GET', url: '/health' });
    expect(r.json()).toMatchObject({ ambiente: 'teste' });
    const padrao = await semOperadora.app.inject({ method: 'GET', url: '/health' });
    expect(padrao.json()).toMatchObject({ ambiente: 'desenvolvimento' });
  });

  it('vem no estado da sessão, antes de haver sessão', async () => {
    const r = await estado(api, OPERADORA);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ambiente: 'teste', sessao: null });
  });
});

describe('a organização que opera o servidor', () => {
  it.each([
    ['o endereço configurado', OPERADORA, true],
    ['outro endereço da mesma organização', OUTRO_DA_OPERADORA, true],
    ['uma organização cliente', CLIENTE, false],
  ])('em %s (%s), operaOServidor é %s', async (_caso, host, opera) => {
    const r = await estado(api, host);
    expect(r.json().organizacao).toMatchObject({ operaOServidor: opera });
  });

  it('sem a organização configurada, nenhuma opera o servidor', async () => {
    const r = await estado(semOperadora, OPERADORA);
    expect(r.json().organizacao).toMatchObject({ operaOServidor: false });
  });
});

describe('o endereço do cliente atrás do proxy', () => {
  async function entrarDe(remoteAddress: string) {
    const r = await api.app.inject({
      method: 'POST',
      url: '/sessao',
      remoteAddress,
      headers: {
        host: OPERADORA,
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0.0.0 Safari/537.36',
        'x-forwarded-for': '203.0.113.7',
      },
      payload: { usuario: 'ana', senha: 'cavalo bateria grampo correto' },
    });
    expect(r.statusCode).toBe(200);
    const [maisNova] = await naOrganizacao(api.banco, operadora, (tx) =>
      tx.select({ ip: sessoes.ip }).from(sessoes).orderBy(desc(sessoes.id)).limit(1),
    );
    return maisNova?.ip;
  }

  it('vale o X-Forwarded-For que chega do próprio servidor, onde fica o proxy', async () => {
    expect(await entrarDe('127.0.0.1')).toBe('203.0.113.7');
  });

  it('o X-Forwarded-For de outro endereço é ignorado, e vale o endereço da conexão', async () => {
    expect(await entrarDe('10.9.8.7')).toBe('10.9.8.7');
  });
});
