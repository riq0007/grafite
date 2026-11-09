import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { dependenciasDeTeste } from '../test/dependencias.ts';
import { criarApp } from './app.ts';

let pasta = '';

beforeAll(() => {
  pasta = mkdtempSync(join(tmpdir(), 'grafite-web-'));
  writeFileSync(join(pasta, 'index.html'), '<!doctype html><title>Grafite</title>');
  mkdirSync(join(pasta, 'assets'));
  writeFileSync(join(pasta, 'assets', 'app-abc123.js'), 'console.log(1)');
  // Os arquivos sem versão no nome, que o navegador precisa conferir para achar a versão nova.
  writeFileSync(join(pasta, 'sw.js'), 'self.skipWaiting()');
  writeFileSync(join(pasta, 'manifest.webmanifest'), '{"name":"Grafite"}');
  writeFileSync(join(pasta, 'favicon.svg'), '<svg/>');
  mkdirSync(join(pasta, 'icones'));
  writeFileSync(join(pasta, 'icones', 'pwa-192.png'), 'png');
});

const html = { accept: 'text/html,application/xhtml+xml' };
const comWeb = () => criarApp(dependenciasDeTeste({ versao: '1.0.0', pastaDaWeb: pasta }));

describe('web compilada servida pela API', () => {
  it('serve o index.html na raiz, sem cache (ele aponta para os arquivos da versão)', async () => {
    const r = await (await comWeb()).inject({ method: 'GET', url: '/', headers: html });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/html');
    expect(r.body).toContain('<title>Grafite</title>');
    expect(r.headers['cache-control']).toContain('no-cache');
  });

  it('as rotas da web caem no index.html: quem cuida delas é a web', async () => {
    const r = await (await comWeb()).inject({ method: 'GET', url: '/ativos/123', headers: html });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('<title>Grafite</title>');
  });

  it('o endereço da web igual ao de uma rota da API, pedido como página, recebe o index.html', async () => {
    const app = await comWeb();
    for (const url of ['/ativos', '/ativos/novo', '/pessoas?busca=ana']) {
      const r = await app.inject({ method: 'GET', url, headers: html });
      expect(r.statusCode, url).toBe(200);
      expect(r.body, url).toContain('<title>Grafite</title>');
      expect(r.headers['cache-control'], url).toContain('no-cache');
    }
  });

  it('o mesmo endereço, pedido sem ser página, continua na API', async () => {
    const r = await (await comWeb()).inject({
      method: 'GET',
      url: '/ativos',
      headers: { accept: 'application/json' },
    });
    expect(r.headers['content-type']).toContain('application/problem+json');
    expect(r.body).not.toContain('<title>Grafite</title>');
  });

  it('a saúde continua na API, mesmo pedida como página', async () => {
    const r = await (await comWeb()).inject({ method: 'GET', url: '/health', headers: html });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ versao: '1.0.0' });
  });

  it('o service worker, o manifesto e os ícones vêm sem cache longo', async () => {
    const app = await comWeb();
    for (const url of ['/sw.js', '/manifest.webmanifest', '/favicon.svg', '/icones/pwa-192.png']) {
      const r = await app.inject({ method: 'GET', url });
      expect(r.statusCode, url).toBe(200);
      expect(r.headers['cache-control'], url).toBe('no-cache');
    }
  });

  it('o cache longo e imutável fica só em /assets/, onde o nome tem a versão', async () => {
    const r = await (await comWeb()).inject({ method: 'GET', url: '/assets/app-abc123.js' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('arquivo inexistente dá 404, sem cair no index.html', async () => {
    const r = await (await comWeb()).inject({ method: 'GET', url: '/assets/nao-existe.js' });
    expect(r.statusCode).toBe(404);
    expect(r.body).not.toContain('<title>Grafite</title>');
  });

  it('/api/... chega às rotas da API, como no proxy do desenvolvimento', async () => {
    const r = await (await comWeb()).inject({ method: 'GET', url: '/api/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ versao: '1.0.0', banco: 'ok' });
  });

  it('sem a pasta configurada, a API não serve arquivos', async () => {
    const app = await criarApp(dependenciasDeTeste({ versao: '1.0.0' }));
    const r = await app.inject({ method: 'GET', url: '/', headers: html });
    expect(r.statusCode).toBe(404);
  });
});
