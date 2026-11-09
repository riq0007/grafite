// O SQL dos papéis e do banco contra o PostgreSQL 18 de verdade, com o psql do contêiner entrando
// com a senha pelo TCP, como no servidor.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BancoDeTeste, iniciarBancoDeTeste } from '@grafite/db/teste';
import { executarProcesso, ferramentasNoConteiner } from '@grafite/operacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rodarSql, sqlDoBanco } from './banco.ts';
import { migrarBanco } from './versao.ts';

/** O repositório faz o papel da pasta da versão: as migrations rodam pelo script dele. */
const REPOSITORIO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const migrar = (urlDono: string) =>
  migrarBanco({
    executar: executarProcesso,
    node: process.execPath,
    pastaDaVersao: REPOSITORIO,
    urlDono,
  });

let banco: BancoDeTeste;
let senhaDoPostgres = '';

beforeAll(async () => {
  banco = await iniciarBancoDeTeste({ aplicarMigracoes: false });
  senhaDoPostgres = decodeURIComponent(new URL(banco.urlSuperusuario).password);
});

afterAll(async () => {
  await banco?.parar();
});

/** A conexão de um papel ao banco, vista do host. */
const url = (papel: string, senha: string, nome: string) =>
  `postgres://${papel}:${senha}@${banco.enderecoDoHost}/${nome}`;

async function consultar<T extends pg.QueryResultRow>(conexao: string, sql: string) {
  const cliente = new pg.Client({ connectionString: conexao });
  await cliente.connect();
  try {
    return (await cliente.query<T>(sql)).rows;
  } finally {
    await cliente.end();
  }
}

describe('sqlDoBanco no PostgreSQL de verdade', () => {
  // Dentro do contêiner, a instância atende em 127.0.0.1:5432.
  const superusuario = () => ({ porta: 5432, senha: senhaDoPostgres });

  it('cria os papéis e o banco do teste, que as migrations do dono preparam e a aplicação usa', async () => {
    const ferramentas = ferramentasNoConteiner(banco.executarNoConteiner);
    const senhas = { dono: 'dono-do-teste', app: 'app-do-teste' };
    await rodarSql(ferramentas, superusuario(), sqlDoBanco('grafite_teste', senhas));
    // Rodar de novo, como na retomada, acerta o que existe sem erro.
    await rodarSql(ferramentas, superusuario(), sqlDoBanco('grafite_teste', senhas));

    await migrar(url('grafite_owner', senhas.dono, 'grafite_teste'));
    const [{ dono } = { dono: '' }] = await consultar<{ dono: string }>(
      banco.urlSuperusuario,
      "select pg_get_userbyid(datdba) as dono from pg_database where datname = 'grafite_teste'",
    );
    expect(dono).toBe('grafite_owner');
    await expect(
      consultar(
        url('grafite_app', senhas.app, 'grafite_teste'),
        'select count(*) from organizacoes',
      ),
    ).resolves.toEqual([{ count: '0' }]);
    // O papel do backup do teste existe, para os dumps da produção restaurarem, mas não entra.
    await expect(
      consultar(url('grafite_backup', 'qualquer', 'grafite_teste'), 'select 1'),
    ).rejects.toThrow();
    const [papel] = await consultar<{ rolcanlogin: boolean; rolbypassrls: boolean }>(
      banco.urlSuperusuario,
      "select rolcanlogin, rolbypassrls from pg_roles where rolname = 'grafite_backup'",
    );
    expect(papel).toEqual({ rolcanlogin: false, rolbypassrls: true });
  });

  it('com a senha do backup, o papel entra e lê o banco inteiro, por cima do RLS', async () => {
    const ferramentas = ferramentasNoConteiner(banco.executarNoConteiner);
    const senhas = {
      dono: 'dono-da-producao',
      app: 'app-da-producao',
      backup: 'backup-da-producao',
    };
    await rodarSql(ferramentas, superusuario(), sqlDoBanco('grafite_producao', senhas));
    await migrar(url('grafite_owner', senhas.dono, 'grafite_producao'));
    // A retomada depois das migrations dá a leitura de novo, sem erro.
    await rodarSql(ferramentas, superusuario(), sqlDoBanco('grafite_producao', senhas));

    await expect(
      consultar(
        url('grafite_backup', senhas.backup, 'grafite_producao'),
        'select count(*) from organizacoes',
      ),
    ).resolves.toEqual([{ count: '0' }]);
    // A senha do teste não abre o banco da produção, nem o contrário.
    await expect(
      consultar(url('grafite_app', 'app-do-teste', 'grafite_producao'), 'select 1'),
    ).rejects.toThrow(/password authentication failed/);
  });

  it('o SQL que falha para no primeiro erro, com a mensagem do psql', async () => {
    const ferramentas = ferramentasNoConteiner(banco.executarNoConteiner);
    await expect(
      rodarSql(ferramentas, superusuario(), 'select 1;\nselect * from tabela_que_nao_existe;\n'),
    ).rejects.toThrow(/O psql falhou na instância de 127\.0\.0\.1:5432: .*tabela_que_nao_existe/);
  });
});
