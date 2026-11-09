// Teste-guarda: nenhuma tabela de negócio pode existir sem RLS ativo e forçado.
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { tabelasSemIsolamento } from './guarda.ts';

let dono: pg.Pool;

beforeAll(() => {
  dono = new pg.Pool({ connectionString: inject('urlDono') });
});

afterAll(async () => {
  await dono.query('drop table if exists guarda_sem_rls, guarda_nao_forcada, guarda_isolada');
  await dono.query('drop schema if exists guarda_esquema cascade');
  await dono.end();
});

describe('tabelasSemIsolamento', () => {
  it('aponta tabela sem RLS e tabela com RLS ativo mas não forçado', async () => {
    await dono.query('create table guarda_sem_rls (id int)');
    await dono.query('create table guarda_nao_forcada (id int)');
    await dono.query('alter table guarda_nao_forcada enable row level security');
    expect(await tabelasSemIsolamento(dono)).toEqual([
      'public.guarda_nao_forcada',
      'public.guarda_sem_rls',
    ]);
    await dono.query('drop table guarda_sem_rls, guarda_nao_forcada');
  });

  it('não aponta tabela isolada com app.isolar_por_organizacao', async () => {
    await dono.query(
      'create table guarda_isolada (id int, org_id uuid not null references organizacoes (id))',
    );
    await dono.query("select app.isolar_por_organizacao('guarda_isolada')");
    expect(await tabelasSemIsolamento(dono)).toEqual([]);
    await dono.query('drop table guarda_isolada');
  });

  it('aponta a tabela sem RLS fora do public, num esquema que não é de infraestrutura', async () => {
    await dono.query('create schema guarda_esquema');
    await dono.query('create table guarda_esquema.solta (id int)');
    expect(await tabelasSemIsolamento(dono)).toEqual(['guarda_esquema.solta']);
    await dono.query('drop schema guarda_esquema cascade');
  });

  it('aceita sem RLS só os esquemas de infraestrutura: a fila, a operação e o diário das migrations', async () => {
    const { rows } = await dono.query<{ esquema: string }>(
      `select distinct schemaname as esquema from pg_tables
        where schemaname in ('fila', 'operacao', 'drizzle') order by 1`,
    );
    expect(rows.map((r) => r.esquema)).toEqual(['drizzle', 'fila', 'operacao']);
    expect(await tabelasSemIsolamento(dono)).toEqual([]);
  });

  it('o schema real não tem nenhuma tabela de negócio sem isolamento', async () => {
    expect(await tabelasSemIsolamento(dono)).toEqual([]);
  });
});
