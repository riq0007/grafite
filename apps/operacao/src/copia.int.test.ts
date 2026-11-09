// A cópia da produção no teste contra o PostgreSQL de verdade (design do F2d, decisão 8; foco 5 da
// revisão): o dump restaurado num banco novo que substitui o do teste, as permissões de volta e a
// troca dos endereços pelo mapa, com as ferramentas do contêiner.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type BancoDeTeste, iniciarBancoDeTeste } from '@grafite/db/teste';
import {
  contarLinhas,
  type FerramentasDoPostgres,
  ferramentasNoConteiner,
} from '@grafite/operacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rodarSql, sqlDoBanco } from './banco.ts';
import {
  contarLinhasNoBanco,
  restaurarComoBanco,
  restaurarEmBancoNovo,
  trocarBancos,
  trocarEnderecos,
} from './copia.ts';

let pasta: string;
let banco: BancoDeTeste;
let ferramentas: FerramentasDoPostgres;
let dump: string;
const superusuario = () => ({
  porta: 5432,
  senha: decodeURIComponent(new URL(banco.urlSuperusuario).password),
});

/** A conexão de um banco da instância, como o superusuário, vista do host. */
const comoSuperusuario = (nome: string) => {
  const url = new URL(banco.urlSuperusuario);
  url.pathname = `/${nome}`;
  return url.toString();
};

async function consultar<T extends pg.QueryResultRow>(url: string, sql: string): Promise<T[]> {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    return (await cliente.query<T>(sql)).rows;
  } finally {
    await cliente.end();
  }
}

/** Cria uma organização com os endereços, pelo dono das tabelas, no contexto dela. */
async function organizacao(nome: string, enderecos: string[]) {
  const cliente = new pg.Client({ connectionString: banco.urlDono });
  await cliente.connect();
  try {
    const { rows } = await cliente.query<{ id: string }>('select uuidv7() as id');
    const id = rows[0]?.id ?? '';
    await cliente.query('begin');
    await cliente.query("select set_config('app.org_id', $1, true)", [id]);
    await cliente.query('insert into organizacoes (id, nome) values ($1, $2)', [id, nome]);
    for (const endereco of enderecos) {
      await cliente.query('insert into enderecos_de_acesso (org_id, endereco) values ($1, $2)', [
        id,
        endereco,
      ]);
    }
    await cliente.query('commit');
  } finally {
    await cliente.end();
  }
}

beforeAll(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-copia-'));
  banco = await iniciarBancoDeTeste({ pastaCompartilhada: pasta });
  ferramentas = ferramentasNoConteiner(banco.executarNoConteiner, {
    pasta: { noHost: pasta, noConteiner: '/compartilhada' },
    endereco: { doHost: banco.enderecoDoHost, doConteiner: '127.0.0.1:5432' },
  });
  await organizacao('Empresa', ['grafite.empresa.com.br', 'grafite.matriz.empresa.com.br']);
  await organizacao("Cliente d'Ávila", ['cliente.com.br']);
  // O dump da "produção", como o backup o grava.
  dump = join(pasta, 'banco.dump');
  const { codigo, erro } = await ferramentas.executar(
    'pg_dump',
    ['--format=custom', `--file=${dump}`, `--dbname=${banco.urlSuperusuario}`],
    {},
  );
  if (codigo !== 0) throw new Error(erro);
});

afterAll(async () => {
  await banco?.parar();
  await rm(pasta, { recursive: true, force: true }).catch(() => {});
});

describe('a cópia da produção no teste', () => {
  it('restaura num banco novo, que substitui o do teste só depois, com as permissões de volta', async () => {
    await restaurarComoBanco(ferramentas, superusuario(), 'grafite_teste', dump);
    // Preparar de novo troca o banco que já existe.
    await restaurarComoBanco(ferramentas, superusuario(), 'grafite_teste', dump);
    await rodarSql(
      ferramentas,
      superusuario(),
      sqlDoBanco('grafite_teste', { dono: 'dono-do-teste', app: 'app-do-teste' }),
    );

    const bancos = await consultar<{ datname: string }>(
      banco.urlSuperusuario,
      "select datname from pg_database where datname like 'grafite_teste%' order by 1",
    );
    expect(bancos).toEqual([{ datname: 'grafite_teste' }]);
    const app = new URL(banco.urlApp);
    app.password = 'app-do-teste';
    app.pathname = '/grafite_teste';
    const contas = await consultar<{ n: string }>(
      app.toString(),
      'select count(*) as n from organizacoes',
    );
    // O app não fura o isolamento: sem a organização no contexto, não vê nenhuma.
    expect(contas).toEqual([{ n: '0' }]);
    const todas = await consultar<{ nome: string }>(
      comoSuperusuario('grafite_teste'),
      'select nome from organizacoes order by nome',
    );
    expect(todas).toEqual([{ nome: "Cliente d'Ávila" }, { nome: 'Empresa' }]);
  });

  it('troca os endereços do mapa, tira os outros e avisa a organização sem endereço e o endereço do mapa que não existe', async () => {
    await restaurarComoBanco(ferramentas, superusuario(), 'grafite_teste', dump);
    const resultado = await trocarEnderecos(ferramentas, superusuario(), 'grafite_teste', {
      'grafite.empresa.com.br': 'grafite-teste.empresa.com.br',
      'grafite.antigo.com.br': 'grafite-teste.antigo.com.br',
    });

    expect(resultado).toEqual({
      semEndereco: ["Cliente d'Ávila"],
      ausentes: ['grafite.antigo.com.br'],
    });
    const enderecos = await consultar<{ endereco: string; nome: string }>(
      comoSuperusuario('grafite_teste'),
      `select e.endereco, o.nome from enderecos_de_acesso e
         join organizacoes o on o.id = e.org_id order by 1`,
    );
    expect(enderecos).toEqual([{ endereco: 'grafite-teste.empresa.com.br', nome: 'Empresa' }]);
    // A produção não muda.
    const naProducao = await consultar<{ endereco: string }>(
      banco.urlSuperusuario,
      'select endereco from enderecos_de_acesso order by 1',
    );
    expect(naProducao.map((e) => e.endereco)).toEqual([
      'cliente.com.br',
      'grafite.empresa.com.br',
      'grafite.matriz.empresa.com.br',
    ]);
  });

  it('com o mapa vazio, nenhuma organização fica com endereço', async () => {
    await restaurarComoBanco(ferramentas, superusuario(), 'grafite_teste', dump);
    await expect(
      trocarEnderecos(ferramentas, superusuario(), 'grafite_teste', {}),
    ).resolves.toEqual({ semEndereco: ["Cliente d'Ávila", 'Empresa'], ausentes: [] });
  });

  it('o dump que não restaura deixa o banco do teste como estava', async () => {
    await restaurarComoBanco(ferramentas, superusuario(), 'grafite_teste', dump);
    await expect(
      restaurarComoBanco(ferramentas, superusuario(), 'grafite_teste', join(pasta, 'falta.dump')),
    ).rejects.toThrow('O pg_restore falhou');
    const bancos = await consultar<{ datname: string }>(
      banco.urlSuperusuario,
      "select datname from pg_database where datname like 'grafite_teste%' order by 1",
    );
    expect(bancos).toEqual([{ datname: 'grafite_teste' }]);
  });
});

describe('a restauração da produção, no banco', () => {
  it('conta as linhas do banco restaurado como o manifesto do backup conta', async () => {
    await restaurarEmBancoNovo(ferramentas, superusuario(), 'grafite_restaurando', dump);
    const linhas = await contarLinhasNoBanco(ferramentas, superusuario(), 'grafite_restaurando');
    // O manifesto conta as linhas pelo pg, no instantâneo do dump; o banco de origem não mudou.
    expect(linhas).toEqual(await contarLinhas(banco.urlSuperusuario));
    expect(linhas['public.organizacoes']).toBe(2);
    expect(linhas['public.enderecos_de_acesso']).toBe(3);
  });

  it('troca o banco pelo restaurado e guarda o de antes com outro nome, e a troca se desfaz igual', async () => {
    // A "produção" é um banco próprio, com uma organização a mais que o backup.
    await restaurarComoBanco(ferramentas, superusuario(), 'producao_exemplo', dump);
    await consultar(
      comoSuperusuario('producao_exemplo'),
      "insert into organizacoes (id, nome) values (uuidv7(), 'Depois do backup')",
    );
    await restaurarEmBancoNovo(ferramentas, superusuario(), 'producao_exemplo_restaurando', dump);

    await trocarBancos(ferramentas, superusuario(), {
      atual: 'producao_exemplo',
      novo: 'producao_exemplo_restaurando',
      guardarComo: 'producao_exemplo_antes_202610081500',
    });
    const nomes = async (nome: string) =>
      (
        await consultar<{ nome: string }>(
          comoSuperusuario(nome),
          'select nome from organizacoes order by nome',
        )
      ).map((o) => o.nome);
    expect(await nomes('producao_exemplo')).toEqual(["Cliente d'Ávila", 'Empresa']);
    expect(await nomes('producao_exemplo_antes_202610081500')).toEqual([
      "Cliente d'Ávila",
      'Depois do backup',
      'Empresa',
    ]);

    // Desfazer é trocar de novo: o de antes volta ao nome dele.
    await trocarBancos(ferramentas, superusuario(), {
      atual: 'producao_exemplo',
      novo: 'producao_exemplo_antes_202610081500',
      guardarComo: 'producao_exemplo_restaurado_202610081500',
    });
    expect(await nomes('producao_exemplo')).toContain('Depois do backup');
  });
});
