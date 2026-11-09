// O PostgreSQL em contêiner do servidor Linux com dois PostgreSQL 18 de verdade, um por ambiente
// (change servidor-linux-com-docker, design, decisão 5; spec operacao-em-linux, "Teste com a cópia
// da produção no Linux"): a espera, os papéis e o banco de cada um pelo psql do próprio contêiner, e
// a credencial do teste recusada na instância da produção.
import { type BancoDeTeste, iniciarBancoDeTeste } from '@grafite/db/teste';
import { ferramentasNoConteiner } from '@grafite/operacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepararBancoNoLinux } from './banco.ts';

let producao: BancoDeTeste;
let teste: BancoDeTeste;

beforeAll(async () => {
  [producao, teste] = await Promise.all([
    iniciarBancoDeTeste({ aplicarMigracoes: false }),
    iniciarBancoDeTeste({ aplicarMigracoes: false }),
  ]);
});

afterAll(async () => {
  await Promise.all([producao?.parar(), teste?.parar()]);
});

/** O superusuário de dentro do contêiner, onde a instância atende em 127.0.0.1:5432. */
const superusuario = (banco: BancoDeTeste) => ({
  host: '127.0.0.1',
  porta: 5432,
  senha: decodeURIComponent(new URL(banco.urlSuperusuario).password),
});

async function entrar(banco: BancoDeTeste, papel: string, senha: string, nome: string) {
  const cliente = new pg.Client({
    connectionString: `postgres://${papel}:${senha}@${banco.enderecoDoHost}/${nome}`,
  });
  await cliente.connect();
  try {
    return (await cliente.query<{ banco: string }>('select current_database() as banco')).rows;
  } finally {
    await cliente.end();
  }
}

describe('o banco de cada ambiente no PostgreSQL 18 de verdade', () => {
  it('cria os papéis e o banco de cada um, e a credencial do teste não abre a produção', async () => {
    await prepararBancoNoLinux({
      ferramentas: ferramentasNoConteiner(producao.executarNoConteiner),
      superusuario: superusuario(producao),
      banco: 'grafite',
      senhas: { dono: 'dono-da-producao', app: 'app-da-producao', backup: 'backup-da-producao' },
    });
    await prepararBancoNoLinux({
      ferramentas: ferramentasNoConteiner(teste.executarNoConteiner),
      superusuario: superusuario(teste),
      banco: 'grafite_teste',
      senhas: { dono: 'dono-do-teste', app: 'app-do-teste' },
    });

    expect(await entrar(producao, 'grafite_app', 'app-da-producao', 'grafite')).toEqual([
      { banco: 'grafite' },
    ]);
    expect(await entrar(teste, 'grafite_app', 'app-do-teste', 'grafite_teste')).toEqual([
      { banco: 'grafite_teste' },
    ]);
    // Credencial do teste contra a produção: a mesma conexão, com o endereço do banco da produção.
    await expect(entrar(producao, 'grafite_app', 'app-do-teste', 'grafite')).rejects.toThrow(
      /password authentication failed/,
    );
  });
});
