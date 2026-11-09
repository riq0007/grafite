// Erros em formato único (spec plataforma-base): problem+json com o código de rastreio, que também
// vai num cabeçalho de toda resposta e no log da requisição.
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { dependenciasDeTeste } from '../test/dependencias.ts';
import { criarApp } from './app.ts';
import { ProblemaDaApi } from './problemas.ts';

const RASTREIO = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

async function app(opcoes: { linhasDoLog?: string[] } = {}) {
  const { linhasDoLog } = opcoes;
  const logger = linhasDoLog
    ? {
        level: 'error',
        stream: new Writable({
          write(pedaco, _codificacao, pronto) {
            linhasDoLog.push(String(pedaco));
            pronto();
          },
        }),
      }
    : false;
  const instancia = await criarApp(dependenciasDeTeste({ logger }));
  // Rotas de teste, só para provocar cada tipo de erro.
  instancia.post(
    '/teste/validacao',
    { schema: { body: z.object({ usuario: z.string({ error: 'Informe o usuário.' }) }) } },
    async () => ({ ok: true }),
  );
  instancia.get('/teste/inesperado', async () => {
    throw new Error('falha com senha=segredo');
  });
  instancia.get('/teste/recusa', async () => {
    throw new ProblemaDaApi({
      codigo: 'pendencia',
      status: 403,
      titulo: 'Entrada não concluída',
      detalhe: 'Conclua a entrada antes de continuar.',
      extras: { pendencia: 'segundo-passo' },
    });
  });
  return instancia;
}

describe('código de rastreio', () => {
  it('vai num cabeçalho de toda resposta, com 8 caracteres em dois grupos', async () => {
    const r = await (await app()).inject({ method: 'GET', url: '/health' });
    expect(r.headers['x-codigo-de-rastreio']).toMatch(RASTREIO);
  });

  it('muda a cada requisição e ignora o que o cliente manda', async () => {
    const instancia = await app();
    const a = await instancia.inject({ method: 'GET', url: '/health' });
    const b = await instancia.inject({
      method: 'GET',
      url: '/health',
      headers: { 'request-id': 'escolhido-pelo-cliente' },
    });
    expect(a.headers['x-codigo-de-rastreio']).not.toBe(b.headers['x-codigo-de-rastreio']);
    expect(b.headers['x-codigo-de-rastreio']).toMatch(RASTREIO);
  });
});

describe('problem+json', () => {
  it('a validação traz a mensagem de cada campo, em pt-BR', async () => {
    const r = await (await app()).inject({ method: 'POST', url: '/teste/validacao', payload: {} });
    expect(r.statusCode).toBe(400);
    expect(r.headers['content-type']).toBe('application/problem+json; charset=utf-8');
    expect(r.json()).toEqual({
      type: 'urn:grafite:problema:dados-invalidos',
      title: 'Dados inválidos',
      status: 400,
      detail: 'Confira os campos indicados.',
      codigoDeRastreio: r.headers['x-codigo-de-rastreio'],
      campos: { usuario: 'Informe o usuário.' },
    });
  });

  it('um corpo que não é JSON é recusado no mesmo formato', async () => {
    const r = await (await app()).inject({
      method: 'POST',
      url: '/teste/validacao',
      headers: { 'content-type': 'application/json' },
      payload: '{"usuario":',
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:dados-invalidos',
      detail: 'O corpo da requisição não é um JSON válido.',
    });
  });

  it('a rota inexistente dá 404 no mesmo formato', async () => {
    const r = await (await app()).inject({ method: 'GET', url: '/nao-existe' });
    expect(r.statusCode).toBe(404);
    expect(r.headers['content-type']).toBe('application/problem+json; charset=utf-8');
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:nao-encontrado',
      status: 404,
      codigoDeRastreio: r.headers['x-codigo-de-rastreio'],
    });
  });

  it('o erro inesperado responde só a mensagem genérica, e o log guarda o erro com o mesmo código', async () => {
    const linhasDoLog: string[] = [];
    const r = await (await app({ linhasDoLog })).inject({
      method: 'GET',
      url: '/teste/inesperado',
    });
    const codigo = r.headers['x-codigo-de-rastreio'];
    expect(r.statusCode).toBe(500);
    expect(r.json()).toEqual({
      type: 'urn:grafite:problema:erro-interno',
      title: 'Erro interno do servidor',
      status: 500,
      detail: `Informe à TI o código ${codigo}.`,
      codigoDeRastreio: codigo,
    });
    expect(r.body).not.toContain('segredo');
    const registro = linhasDoLog.map((l) => JSON.parse(l)).find((l) => l.reqId === codigo);
    expect(registro?.err?.message).toBe('falha com senha=segredo');
  });

  it('a recusa de uma rota sai com o próprio código, o status e os dados extras', async () => {
    const r = await (await app()).inject({ method: 'GET', url: '/teste/recusa' });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toEqual({
      type: 'urn:grafite:problema:pendencia',
      title: 'Entrada não concluída',
      status: 403,
      detail: 'Conclua a entrada antes de continuar.',
      codigoDeRastreio: r.headers['x-codigo-de-rastreio'],
      pendencia: 'segundo-passo',
    });
  });
});
