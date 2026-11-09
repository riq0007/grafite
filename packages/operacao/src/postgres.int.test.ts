// As ferramentas do PostgreSQL rodando de verdade, dentro do contêiner do banco de teste.
import { type BancoDeTeste, iniciarBancoDeTeste } from '@grafite/db/teste';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ferramentasNoConteiner, versaoDoPgDump } from './postgres.ts';

let banco: BancoDeTeste;

beforeAll(async () => {
  banco = await iniciarBancoDeTeste({ aplicarMigracoes: false });
});

afterAll(async () => {
  await banco?.parar();
});

describe('ferramentas no contêiner', () => {
  it('o pg_dump do contêiner é o do PostgreSQL 18', async () => {
    const versao = await versaoDoPgDump(ferramentasNoConteiner(banco.executarNoConteiner));
    expect(versao.maior).toBe(18);
  });

  it('o psql recebe a entrada pelo stdin', async () => {
    const resultado = await ferramentasNoConteiner(banco.executarNoConteiner).executar(
      'psql',
      ['--username=postgres', '--dbname=grafite', '--tuples-only', '--no-align'],
      { entrada: 'select 40 + 2;' },
    );
    expect(resultado).toMatchObject({ codigo: 0, saida: '42\n' });
  });
});
