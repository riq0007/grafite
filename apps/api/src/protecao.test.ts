// Proteção das escritas contra outros sites e limite de requisições (spec plataforma-base).
import { describe, expect, it } from 'vitest';
import { dependenciasDeTeste } from '../test/dependencias.ts';
import { criarApp } from './app.ts';
import { LIMITE_DA_ENTRADA, protegerEscritas } from './protecao.ts';

const host = 'grafite.a.local';

async function app({ tokenDaSessao = null }: { tokenDaSessao?: string | null } = {}) {
  const instancia = await criarApp(dependenciasDeTeste());
  const escritas: string[] = [];
  await instancia.register(async (escopo) => {
    protegerEscritas(escopo, { tokenEsperado: () => tokenDaSessao });
    escopo.post('/teste/escrita', async () => {
      escritas.push('gravou');
      return { ok: true };
    });
    escopo.get('/teste/leitura', async () => ({ ok: true }));
    escopo.post('/teste/entrada', { config: { rateLimit: LIMITE_DA_ENTRADA } }, async () => ({
      ok: true,
    }));
  });
  return { instancia, escritas };
}

describe('escritas vindas de outro site', () => {
  it.each([
    ['o Sec-Fetch-Site de outro site', { 'sec-fetch-site': 'cross-site' }],
    ['o Sec-Fetch-Site do mesmo domínio, mas de outra origem', { 'sec-fetch-site': 'same-site' }],
    ['a Origin de outro site', { origin: 'https://outro.site' }],
  ])('são recusadas com %s, sem gravar nada', async (_caso, cabecalhos) => {
    const { instancia, escritas } = await app();
    const r = await instancia.inject({
      method: 'POST',
      url: '/teste/escrita',
      headers: { host, ...cabecalhos },
      payload: {},
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:origem-recusada',
      detail: 'A requisição veio de outro site.',
    });
    expect(escritas).toEqual([]);
  });

  it('a escrita da mesma origem, sem sessão (como a entrada), passa', async () => {
    const { instancia, escritas } = await app();
    const r = await instancia.inject({
      method: 'POST',
      url: '/teste/escrita',
      headers: { host, 'sec-fetch-site': 'same-origin', origin: `https://${host}` },
      payload: {},
    });
    expect(r.statusCode).toBe(200);
    expect(escritas).toEqual(['gravou']);
  });

  it('a leitura de outro site não é barrada aqui', async () => {
    const { instancia } = await app();
    const r = await instancia.inject({
      method: 'GET',
      url: '/teste/leitura',
      headers: { host, 'sec-fetch-site': 'cross-site' },
    });
    expect(r.statusCode).toBe(200);
  });
});

describe('o token da sessão nas escritas', () => {
  it.each([
    ['sem o token', {}],
    ['com outro token', { 'x-grafite-csrf': 'outro-token' }],
  ])('a escrita com sessão é recusada %s', async (_caso, cabecalhos) => {
    const { instancia, escritas } = await app({ tokenDaSessao: 'token-da-sessao' });
    const r = await instancia.inject({
      method: 'POST',
      url: '/teste/escrita',
      headers: { host, 'sec-fetch-site': 'same-origin', ...cabecalhos },
      payload: {},
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:origem-recusada',
      detail: 'Falta o token da sessão nesta requisição.',
    });
    expect(escritas).toEqual([]);
  });

  it('a escrita com o token certo passa', async () => {
    const { instancia, escritas } = await app({ tokenDaSessao: 'token-da-sessao' });
    const r = await instancia.inject({
      method: 'POST',
      url: '/teste/escrita',
      headers: { host, 'sec-fetch-site': 'same-origin', 'x-grafite-csrf': 'token-da-sessao' },
      payload: {},
    });
    expect(r.statusCode).toBe(200);
    expect(escritas).toEqual(['gravou']);
  });
});

describe('limite de requisições', () => {
  it('a 601ª requisição do mesmo IP no minuto é recusada com o tempo de espera', async () => {
    const { instancia } = await app();
    for (let i = 0; i < 600; i++) {
      expect((await instancia.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    }
    const r = await instancia.inject({ method: 'GET', url: '/health' });
    expect(r.statusCode).toBe(429);
    expect(r.headers['retry-after']).toMatch(/^\d+$/);
    expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:muitas-requisicoes' });
    expect(r.json().detail).toMatch(/^Muitas requisições\. Tente de novo em \d+ s\.$/);
  });

  it('a 21ª entrada do mesmo IP no minuto é recusada, e o resto continua', async () => {
    const { instancia } = await app();
    const entrar = () =>
      instancia.inject({
        method: 'POST',
        url: '/teste/entrada',
        headers: { host, 'sec-fetch-site': 'same-origin' },
        payload: {},
      });
    for (let i = 0; i < 20; i++) expect((await entrar()).statusCode).toBe(200);
    expect((await entrar()).statusCode).toBe(429);
    expect((await instancia.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });
});
