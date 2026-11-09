// A saúde da API (spec plataforma-base; design do F2c, decisão 17): o banco fora dá 503, e a fila ou
// o aviso de eventos fora dão 200 com `degradado`, porque a API continua atendendo.
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { describe, expect, it } from 'vitest';
import { dependenciasDeTeste } from '../../test/dependencias.ts';
import { criarApp } from '../app.ts';
import { type OpcoesDeSaude, rotasDeSaude } from './saude.ts';

async function saude(opcoes: Partial<OpcoesDeSaude> = {}) {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(rotasDeSaude, {
    ambiente: 'producao',
    versao: '1.2.3',
    verificarBanco: async () => {},
    filaRodando: () => true,
    eventosLigados: () => true,
    ...opcoes,
  });
  const r = await app.inject({ method: 'GET', url: '/health' });
  await app.close();
  return r;
}

describe('GET /health', () => {
  it('com tudo no ar, responde 200 e ok', async () => {
    const r = await saude();
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      status: 'ok',
      versao: '1.2.3',
      ambiente: 'producao',
      banco: 'ok',
      fila: 'ok',
      eventos: 'ok',
    });
  });

  it('com o banco fora, responde 503, sem expor detalhes internos', async () => {
    const r = await saude({
      verificarBanco: async () => {
        throw new Error('senha=segredo host=db.interno');
      },
    });
    expect(r.statusCode).toBe(503);
    expect(r.json()).toMatchObject({
      status: 'indisponivel',
      versao: '1.2.3',
      banco: 'indisponivel',
    });
    expect(r.body).not.toContain('segredo');
    expect(r.body).not.toContain('db.interno');
  });

  it('com o aviso de eventos fora, responde 200 e degradado', async () => {
    const r = await saude({ eventosLigados: () => false });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      status: 'degradado',
      versao: '1.2.3',
      ambiente: 'producao',
      banco: 'ok',
      fila: 'ok',
      eventos: 'indisponivel',
    });
  });

  it('com a fila fora, responde 200 e degradado', async () => {
    const r = await saude({ filaRodando: () => false });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ status: 'degradado', fila: 'indisponivel', eventos: 'ok' });
  });

  it('a API montada sem o ouvinte do banco diz que os eventos não estão funcionando', async () => {
    const app = await criarApp(dependenciasDeTeste({ versao: '1.2.3' }));
    const r = await app.inject({ method: 'GET', url: '/health' });
    await app.close();
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ status: 'degradado', banco: 'ok', eventos: 'indisponivel' });
  });
});
