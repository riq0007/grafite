// O /health contra o PostgreSQL de verdade (spec plataforma-base), pela mesma montagem da API que os
// testes de integração das rotas de acesso usam, com o ouvinte dos eventos ligado.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ApiDeTeste, abrirApi } from '../../test/integracao.ts';

let api: ApiDeTeste;

beforeAll(async () => {
  api = await abrirApi();
});

afterAll(async () => {
  await api?.fechar();
});

const consultar = () => api.app.inject({ method: 'GET', url: '/health' });

describe('GET /health com o banco real', () => {
  it('consulta o banco e o aviso de eventos, e diz que os dois estão no ar', async () => {
    const r = await consultar();
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ banco: 'ok', eventos: 'ok' });
  });

  it('com o aviso de eventos fora, diz que a API está degradada, e as outras rotas respondem', async () => {
    await api.banco.execute(
      sql`select pg_terminate_backend(pid) from pg_stat_activity
        where usename = current_user and pid <> pg_backend_pid() and query = 'LISTEN grafite_eventos'`,
    );
    await vi.waitFor(async () => {
      expect((await consultar()).json()).toMatchObject({
        status: 'degradado',
        banco: 'ok',
        eventos: 'indisponivel',
      });
    });
    expect((await consultar()).statusCode).toBe(200);
    const sessao = await api.app.inject({ method: 'GET', url: '/sessao', headers: { host: 'x' } });
    expect(sessao.statusCode).toBe(404);
    // A ligação é refeita sozinha.
    await vi.waitFor(async () => expect((await consultar()).json().eventos).toBe('ok'), {
      timeout: 5000,
    });
  });
});

describe('GET /health com a fila ligada', () => {
  it('com o banco, a fila e os eventos no ar, diz que está tudo ok', async () => {
    const comFila = await abrirApi({ tarefas: () => [] });
    try {
      const r = await comFila.app.inject({ method: 'GET', url: '/health' });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toMatchObject({ status: 'ok', banco: 'ok', fila: 'ok', eventos: 'ok' });
    } finally {
      await comFila.fechar();
    }
  });
});
