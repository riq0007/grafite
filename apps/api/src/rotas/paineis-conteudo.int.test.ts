import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { naOrganizacao, organizacoes } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

const host = 'grafite.ponte.local';
let api: ApiDeTeste;
let org: string;
let cliente: ReturnType<typeof clienteDaApi>;
let ana: Entrada;
let semPermissao: Entrada;
let servidor: Server;
let base: string;
let id: string;
const recebidos: { url: string; cookie?: string; authorization?: string }[] = [];

beforeAll(async () => {
  servidor = createServer((pedido, resposta) => {
    recebidos.push({
      url: pedido.url ?? '',
      cookie: pedido.headers.cookie,
      authorization: pedido.headers.authorization,
    });
    if (pedido.url === '/fora') {
      resposta.writeHead(302, { location: 'http://127.0.0.1:9/segredo' });
      resposta.end();
      return;
    }
    if (pedido.url === '/dentro') {
      resposta.writeHead(302, { location: '/pagina?filtro=1' });
      resposta.end();
      return;
    }
    if (pedido.url === '/grande') {
      resposta.end('x'.repeat(11 * 1024 * 1024));
      return;
    }
    if (pedido.url === '/estilo.css') {
      resposta.setHeader('content-type', 'text/css');
      resposta.end('body { background: url(/imagem.png) }');
      return;
    }
    if (pedido.url?.startsWith('/dados')) {
      resposta.setHeader('content-type', 'application/json');
      resposta.end('{"total":42}');
      return;
    }
    resposta.setHeader('content-type', 'text/html');
    resposta.setHeader('set-cookie', 'sessao-interna=segredo');
    resposta.end(
      `<html><head><link rel="stylesheet" href="/estilo.css"></head><body><img src="${base}/imagem.png"><a href="/proxima">Próxima</a><script>fetch('/dados').then(r=>r.json())</script></body></html>`,
    );
  });
  await new Promise<void>((pronto) => servidor.listen(0, '127.0.0.1', pronto));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const perfil = await criarPerfil(api, org, {
    nome: 'Painéis',
    permissoes: ['paineis.administrar'],
  });
  const conta = await criarConta(api, org, { usuario: 'ana', nome: 'Ana' });
  await criarConta(api, org, { usuario: 'bia', nome: 'Bia' });
  await atribuir(api, org, { perfilId: perfil, contaId: conta.id });
  ana = await cliente.entrar('ana');
  semPermissao = await cliente.entrar('bia');
  const r = await cliente.enviar('POST', '/paineis', ana, {
    nome: 'Interno',
    endereco: `${base}/pagina`,
  });
  id = r.json().id;
});
afterAll(async () => {
  await api?.fechar();
  await new Promise<void>((fim) => servidor?.close(() => fim()));
});

async function abrir() {
  const entrada = await cliente.consultar(`/paineis/${id}/exibicao`, ana);
  expect(entrada.statusCode, entrada.body).toBe(302);
  return String(entrada.headers.location);
}
const recurso = (url: string) => api.app.inject({ url, headers: { host, origin: 'null' } });

describe('a ponte dos painéis HTTP', () => {
  it('exige sessão e permissão antes de abrir o conteúdo', async () => {
    expect((await cliente.consultar(`/paineis/${id}/exibicao`, SEM_ENTRADA)).statusCode).toBe(401);
    expect((await cliente.consultar(`/paineis/${id}/exibicao`, semPermissao)).statusCode).toBe(403);
  });
  it('isola o HTML e reescreve recursos sem encaminhar cookies', async () => {
    const url = await abrir();
    const prefixo = url.slice(0, url.indexOf('/pagina'));
    const r = await recurso(url);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.headers['content-security-policy']).toContain('sandbox allow-scripts');
    expect(r.headers['content-security-policy']).not.toContain('allow-same-origin');
    expect(r.headers['set-cookie']).toBeUndefined();
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body).toContain(`${prefixo}/estilo.css`);
    expect(r.body).toContain(`${prefixo}/imagem.png`);
    const css = await recurso(`${prefixo}/estilo.css`);
    expect(css.body).toContain(`${prefixo}/imagem.png`);
    const dados = await recurso(`${prefixo}/dados?filtro=1`);
    expect(dados.json()).toEqual({ total: 42 });
    expect(dados.headers['access-control-allow-origin']).toBe('*');
    expect(recebidos.every((r) => !r.cookie && !r.authorization)).toBe(true);
    expect(recebidos.some((r) => r.url === '/dados?filtro=1')).toBe(true);
  });
  it('segue redirecionamento interno e recusa outra origem e corpo excessivo', async () => {
    const url = await abrir();
    const prefixo = url.slice(0, url.indexOf('/pagina'));
    expect((await recurso(`${prefixo}/dentro`)).statusCode).toBe(200);
    expect((await recurso(`${prefixo}/fora`)).statusCode).toBe(502);
    expect((await recurso(`${prefixo}/grande`)).statusCode).toBe(502);
    expect(
      (await api.app.inject({ url, headers: { host: 'outra-organizacao.local' } })).statusCode,
    ).toBe(404);
  });
  it('revoga o acesso quando o painel fica inativo ou o módulo é desligado', async () => {
    const url = await abrir();
    await cliente.enviar('POST', `/paineis/${id}/inativacao`, ana);
    expect((await recurso(url)).statusCode).toBe(404);
    await cliente.enviar('POST', `/paineis/${id}/reativacao`, ana);
    await naOrganizacao(api.banco, org, (tx) =>
      tx
        .update(organizacoes)
        .set({ modulosDesligados: ['paineis'] })
        .where(eq(organizacoes.id, org)),
    );
    expect((await recurso(url)).statusCode).toBe(403);
    await naOrganizacao(api.banco, org, (tx) =>
      tx.update(organizacoes).set({ modulosDesligados: [] }).where(eq(organizacoes.id, org)),
    );
  });
  it('expira junto com a sessão e não aceita tokens inventados', async () => {
    const url = await abrir();
    api.relogio.avancar(13 * 60 * 60 * 1000);
    expect((await recurso(url)).statusCode).toBe(401);
    expect((await recurso('/api/paineis-conteudo/inventado/pagina')).statusCode).toBe(401);
  });
});
