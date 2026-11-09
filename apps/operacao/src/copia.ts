// A cópia de um backup num ambiente (spec operacao-servicos, "Teste com a cópia da produção", e spec
// backup, "Restauração da produção"; design do F2d, decisões 8 e 16), pelo psql e pelo pg_restore
// com o superusuário da instância:
// - o dump é restaurado num banco novo, que só substitui o do ambiente depois de restaurado, então
//   um dump que não restaura deixa o banco como estava;
// - no teste, os endereços de cada organização são trocados pelos do mapa, e os outros saem, então
//   o teste nunca atende um endereço da produção;
// - os arquivos são deszipados numa pasta nova, trocada pela do ambiente no fim.
import { rename, rm } from 'node:fs/promises';
import { deszipar, ESQUEMAS_DO_BACKUP, type FerramentasDoPostgres } from '@grafite/operacao';
import {
  conexaoDoPostgres,
  consultarSql,
  literal,
  NOME_DO_BANCO,
  rodarSql,
  type Superusuario,
} from './banco.ts';

function conferirNome(...nomes: string[]): void {
  for (const nome of nomes) {
    if (!NOME_DO_BANCO.test(nome)) throw new Error(`O nome do banco ${nome} não serve.`);
  }
}

/**
 * Restaura o dump num banco novo da instância, apagando o que sobrou de uma tentativa anterior com
 * o mesmo nome. Um dump que não restaura não deixa o banco novo.
 */
export async function restaurarEmBancoNovo(
  ferramentas: FerramentasDoPostgres,
  superusuario: Superusuario,
  novo: string,
  arquivoDump: string,
): Promise<void> {
  conferirNome(novo);
  await rodarSql(
    ferramentas,
    superusuario,
    [
      `-- O banco novo da cópia, ${novo}.`,
      `DROP DATABASE IF EXISTS ${novo} WITH (FORCE);`,
      `CREATE DATABASE ${novo} OWNER grafite_owner ENCODING 'UTF8' TEMPLATE template0;`,
      '',
    ].join('\n'),
  );
  const { codigo, saida, erro } = await ferramentas.executar(
    'pg_restore',
    [
      '--exit-on-error',
      '--single-transaction',
      `--dbname=${conexaoDoPostgres(superusuario.porta, novo, superusuario.host)}`,
      arquivoDump,
    ],
    { senha: superusuario.senha },
  );
  if (codigo !== 0) {
    await rodarSql(
      ferramentas,
      superusuario,
      `-- A cópia que não restaurou sai.\nDROP DATABASE IF EXISTS ${novo} WITH (FORCE);\n`,
    ).catch(() => {});
    throw new Error(`O pg_restore falhou: ${(erro || saida).trim()}`);
  }
}

/**
 * Põe o banco `novo` no lugar do `atual`, que é guardado com outro nome ou, sem ele, apagado. As
 * conexões com o atual são encerradas antes. Desfazer a troca é trocar de novo.
 */
export async function trocarBancos(
  ferramentas: FerramentasDoPostgres,
  superusuario: Superusuario,
  { atual, novo, guardarComo }: { atual: string; novo: string; guardarComo?: string },
): Promise<void> {
  conferirNome(atual, novo, ...(guardarComo === undefined ? [] : [guardarComo]));
  await rodarSql(
    ferramentas,
    superusuario,
    [
      guardarComo === undefined
        ? `-- A troca do banco ${atual} pela cópia.`
        : `-- A troca do banco ${atual} pelo ${novo}, com o de antes guardado como ${guardarComo}.`,
      guardarComo === undefined
        ? `DROP DATABASE IF EXISTS ${atual} WITH (FORCE);`
        : [
            `DO $$ BEGIN PERFORM pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${atual}' AND pid <> pg_backend_pid(); END $$;`,
            `ALTER DATABASE ${atual} RENAME TO ${guardarComo};`,
          ].join('\n'),
      `ALTER DATABASE ${novo} RENAME TO ${atual};`,
      '',
    ].join('\n'),
  );
}

/**
 * Restaura o dump num banco novo da instância e, só com ele restaurado, apaga o banco `nome` e põe
 * o novo no lugar. Um dump que não restaura deixa o banco `nome` como estava.
 */
export async function restaurarComoBanco(
  ferramentas: FerramentasDoPostgres,
  superusuario: Superusuario,
  nome: string,
  arquivoDump: string,
): Promise<void> {
  const novo = `${nome}_preparando`;
  await restaurarEmBancoNovo(ferramentas, superusuario, novo, arquivoDump);
  await trocarBancos(ferramentas, superusuario, { atual: nome, novo });
}

/** As linhas de cada tabela da aplicação no banco, como o manifesto do backup as conta. */
export async function contarLinhasNoBanco(
  ferramentas: FerramentasDoPostgres,
  superusuario: Superusuario,
  banco: string,
): Promise<Record<string, number>> {
  conferirNome(banco);
  const esquemas = ESQUEMAS_DO_BACKUP.map(literal).join(', ');
  const linhas = await consultarSql(
    ferramentas,
    superusuario,
    [
      `-- As linhas de cada tabela do banco ${banco}.`,
      `\\connect ${banco}`,
      `SELECT n.nspname || '.' || c.relname || ':' || (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'r' AND n.nspname IN (${esquemas}) ORDER BY 1;`,
      '',
    ].join('\n'),
  );
  const contagem: Record<string, number> = {};
  for (const linha of linhas) {
    const separador = linha.lastIndexOf(':');
    contagem[linha.slice(0, separador)] = Number(linha.slice(separador + 1));
  }
  return contagem;
}

/** O SQL que troca os endereços pelos do mapa, tira os outros e diz o que ficou de fora. */
export function sqlDaTrocaDeEnderecos(banco: string, mapa: Record<string, string>): string {
  if (!NOME_DO_BANCO.test(banco)) throw new Error(`O nome do banco ${banco} não serve.`);
  const pares = Object.entries(mapa);
  return [
    '-- A troca dos endereços da cópia da produção pelos do teste (grafite preparar-teste).',
    `\\connect ${banco}`,
    'BEGIN;',
    'CREATE TEMP TABLE mapa (de text PRIMARY KEY, para text NOT NULL UNIQUE) ON COMMIT DROP;',
    ...(pares.length === 0
      ? []
      : [
          `INSERT INTO mapa (de, para) VALUES ${pares
            .map(([de, para]) => `(${literal(de)}, ${literal(para)})`)
            .join(', ')};`,
        ]),
    "SELECT 'ausente:' || de FROM mapa WHERE NOT EXISTS (SELECT FROM enderecos_de_acesso e WHERE e.endereco = mapa.de) ORDER BY de;",
    'DELETE FROM enderecos_de_acesso e WHERE NOT EXISTS (SELECT FROM mapa m WHERE m.de = e.endereco);',
    'UPDATE enderecos_de_acesso e SET endereco = m.para FROM mapa m WHERE m.de = e.endereco;',
    "SELECT 'sem-endereco:' || o.nome FROM organizacoes o WHERE NOT EXISTS (SELECT FROM enderecos_de_acesso e WHERE e.org_id = o.id) ORDER BY o.nome;",
    'COMMIT;',
    '',
  ].join('\n');
}

export interface TrocaDeEnderecos {
  /** As organizações que ficaram sem nenhum endereço, pelo nome. */
  semEndereco: string[];
  /** Os endereços da produção do mapa que nenhuma organização tem. */
  ausentes: string[];
}

/** Troca os endereços da cópia no banco, como o superusuário, que passa por cima do isolamento. */
export async function trocarEnderecos(
  ferramentas: FerramentasDoPostgres,
  superusuario: Superusuario,
  banco: string,
  mapa: Record<string, string>,
): Promise<TrocaDeEnderecos> {
  const linhas = await consultarSql(ferramentas, superusuario, sqlDaTrocaDeEnderecos(banco, mapa));
  const resultado: TrocaDeEnderecos = { semEndereco: [], ausentes: [] };
  for (const linha of linhas) {
    const separador = linha.indexOf(':');
    const tipo = linha.slice(0, separador);
    const valor = linha.slice(separador + 1);
    if (tipo === 'sem-endereco') resultado.semEndereco.push(valor);
    else if (tipo === 'ausente') resultado.ausentes.push(valor);
  }
  return resultado;
}

/** Deszipa os arquivos do backup numa pasta nova, ao lado da do ambiente; devolve a pasta nova. */
export async function prepararArquivos(zip: string, pasta: string): Promise<string> {
  const nova = `${pasta}.restaurando`;
  await rm(nova, { recursive: true, force: true });
  await deszipar(zip, nova);
  return nova;
}

/** Põe a pasta nova no lugar da do ambiente; a de antes sai ou, com um nome, fica guardada. */
export async function trocarArquivos(
  pasta: string,
  nova: string,
  { guardarAntesEm }: { guardarAntesEm?: string } = {},
): Promise<void> {
  if (guardarAntesEm === undefined) await rm(pasta, { recursive: true, force: true });
  else {
    await rename(pasta, guardarAntesEm).catch((erro: NodeJS.ErrnoException) => {
      if (erro.code !== 'ENOENT') throw erro;
    });
  }
  await rename(nova, pasta);
}

/** Deszipa os arquivos do backup e os põe no lugar dos do ambiente, que saem. */
export async function restaurarArquivos(zip: string, pasta: string): Promise<void> {
  await trocarArquivos(pasta, await prepararArquivos(zip, pasta));
}
