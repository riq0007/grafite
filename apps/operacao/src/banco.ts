// Os bancos da instalação (spec operacao-servicos; design do F2d, decisões 3 e 6): a conferência do
// PostgreSQL 18 da produção, a instância do teste, criada pelo initdb e registrada como serviço, e
// os papéis e o banco do Grafite em cada instância, pelo psql com o superusuário dela. Cada passo
// confere o que já existe, então a instalação interrompida é retomada do ponto em que parou.
import { access, appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  type ExecutarProcesso,
  type FerramentasDoPostgres,
  versaoDoPgDump,
} from '@grafite/operacao';
import { BANCOS, type PastasDaInstalacao, SERVICOS } from './layout.ts';
import { configurarServicoDoWindows, type Servicos } from './windows/servicos.ts';

export interface SenhasDoBanco {
  dono: string;
  app: string;
  /**
   * A senha do papel do backup. Sem ela, o papel existe sem entrar: só recebe as permissões que os
   * dumps da produção trazem, para eles restaurarem na instância do teste.
   */
  backup?: string;
}

/**
 * A conexão do superusuário `postgres` com a instância: no Windows, a local da porta; no Linux
 * (change servidor-linux-com-docker, design, decisão 5), a do contêiner, pelo nome do serviço.
 */
export interface Superusuario {
  /** O endereço da instância; sem ele, 127.0.0.1. */
  host?: string;
  porta: number;
  senha: string;
}

export const NOME_DO_BANCO = /^[a-z_][a-z0-9_]*$/;
/** Um texto como literal do SQL, com as aspas simples dobradas. */
export const literal = (texto: string) => `'${texto.replaceAll("'", "''")}'`;
const PAPEL = 'NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION';

/**
 * O SQL, para o psql, que cria ou acerta os papéis e o banco do Grafite numa instância, como o
 * docker/init/01-papeis.sh do desenvolvimento. Pode rodar de novo: as senhas são acertadas, e a
 * leitura do backup é dada outra vez se as migrations já rodaram.
 */
export function sqlDoBanco(banco: string, senhas: SenhasDoBanco): string {
  if (!NOME_DO_BANCO.test(banco)) throw new Error(`O nome do banco ${banco} não serve.`);
  const criarPapel = (papel: string) =>
    `SELECT 'CREATE ROLE ${papel}' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${papel}') \\gexec`;
  const backup =
    senhas.backup === undefined
      ? `ALTER ROLE grafite_backup WITH NOLOGIN PASSWORD NULL ${PAPEL} BYPASSRLS;`
      : `ALTER ROLE grafite_backup WITH LOGIN PASSWORD ${literal(senhas.backup)} ${PAPEL} BYPASSRLS;`;
  return [
    '-- Os papéis e o banco do Grafite (grafite instalar). Pode rodar de novo: acerta o que existe.',
    criarPapel('grafite_owner'),
    criarPapel('grafite_app'),
    criarPapel('grafite_backup'),
    `ALTER ROLE grafite_owner WITH LOGIN PASSWORD ${literal(senhas.dono)} ${PAPEL} NOBYPASSRLS;`,
    `ALTER ROLE grafite_app WITH LOGIN PASSWORD ${literal(senhas.app)} ${PAPEL} NOBYPASSRLS;`,
    backup,
    `SELECT 'CREATE DATABASE ${banco} OWNER grafite_owner ENCODING ''UTF8'' TEMPLATE template0' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${banco}') \\gexec`,
    `ALTER DATABASE ${banco} OWNER TO grafite_owner;`,
    `REVOKE ALL ON DATABASE ${banco} FROM PUBLIC;`,
    `GRANT CONNECT ON DATABASE ${banco} TO grafite_app, grafite_backup;`,
    `\\connect ${banco}`,
    'ALTER SCHEMA public OWNER TO grafite_owner;',
    'REVOKE ALL ON SCHEMA public FROM PUBLIC;',
    'GRANT USAGE ON SCHEMA public TO grafite_app;',
    'ALTER DEFAULT PRIVILEGES FOR ROLE grafite_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO grafite_app;',
    'ALTER DEFAULT PRIVILEGES FOR ROLE grafite_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO grafite_app;',
    "DO $$ BEGIN IF to_regprocedure('app.conceder_leitura_ao_backup()') IS NOT NULL THEN PERFORM app.conceder_leitura_ao_backup(); END IF; END $$;",
    '',
  ].join('\n');
}

/** A conexão do superusuário `postgres` com um banco da instância, sem a senha. */
export const conexaoDoPostgres = (porta: number, banco = 'postgres', host = '127.0.0.1') =>
  `postgres://postgres@${host}:${porta}/${banco}`;

/** Roda o SQL pelo psql com o superusuário da instância, parando no primeiro erro. */
export async function rodarSql(
  ferramentas: FerramentasDoPostgres,
  { host = '127.0.0.1', porta, senha }: Superusuario,
  sql: string,
  opcoesDoPsql: readonly string[] = [],
): Promise<string> {
  const { codigo, saida, erro } = await ferramentas.executar(
    'psql',
    [
      '--no-psqlrc',
      '--quiet',
      '--set=ON_ERROR_STOP=1',
      ...opcoesDoPsql,
      `--dbname=${conexaoDoPostgres(porta, 'postgres', host)}`,
      '--file=-',
    ],
    { senha, entrada: sql },
  );
  if (codigo !== 0) {
    throw new Error(`O psql falhou na instância de ${host}:${porta}: ${(erro || saida).trim()}`);
  }
  return saida;
}

/**
 * Roda o SQL como `rodarSql` e devolve as linhas das consultas, uma por registro, separadas pelo
 * caractere nulo, que nenhum texto do banco tem.
 */
export async function consultarSql(
  ferramentas: FerramentasDoPostgres,
  superusuario: Superusuario,
  sql: string,
): Promise<string[]> {
  const saida = await rodarSql(ferramentas, superusuario, sql, [
    '--tuples-only',
    '--no-align',
    '--record-separator-zero',
  ]);
  return saida
    .split('\0')
    .map((linha) => linha.replace(/^\n+|\n+$/g, ''))
    .filter((linha) => linha !== '');
}

/** Confere que os binários da pasta são os do PostgreSQL 18. */
export async function conferirPostgres18(
  ferramentas: FerramentasDoPostgres,
  pgBin: string,
): Promise<void> {
  let versao: Awaited<ReturnType<typeof versaoDoPgDump>>;
  try {
    versao = await versaoDoPgDump(ferramentas);
  } catch {
    throw new Error(
      `O PostgreSQL 18 precisa estar instalado, à mão ou pelo atalho de instalação (Instalar-Grafite.cmd): não encontrei o pg_dump em ${pgBin}.`,
    );
  }
  if (versao.maior !== 18) {
    throw new Error(
      `O PostgreSQL 18 precisa estar instalado: em ${pgBin} está o PostgreSQL ${versao.completa}.`,
    );
  }
}

/** Confere que o PostgreSQL da produção responde à senha do postgres e é o 18. */
export async function conferirServidorDaProducao(
  ferramentas: FerramentasDoPostgres,
  senha: string,
): Promise<void> {
  const { porta } = BANCOS.producao;
  const { codigo, saida, erro } = await ferramentas.executar(
    'psql',
    [
      '--no-psqlrc',
      '--tuples-only',
      '--no-align',
      `--dbname=${conexaoDoPostgres(porta)}`,
      '--command=show server_version_num',
    ],
    { senha },
  );
  const numero = Number(saida.trim());
  if (codigo !== 0 || !Number.isInteger(numero)) {
    throw new Error(
      `O PostgreSQL da produção não respondeu em 127.0.0.1:${porta} com a senha do postgres: ${(erro || saida).trim()}`,
    );
  }
  const maior = Math.floor(numero / 10000);
  if (maior !== 18) {
    throw new Error(
      `O PostgreSQL da produção, em 127.0.0.1:${porta}, é o ${maior}; o Grafite precisa do 18.`,
    );
  }
}

/** A marca do que a instalação acrescenta ao postgresql.conf da instância do teste. */
const MARCA_DA_CONFIGURACAO =
  '# Grafite: a instância do ambiente de teste, criada por grafite instalar.';

/** A conta do serviço da instância do teste, como a do instalador oficial. */
const CONTA_DO_SERVICO = 'NT AUTHORITY\\NetworkService';
const SID_DA_CONTA_DO_SERVICO = '*S-1-5-20';

const existe = (caminho: string) =>
  access(caminho).then(
    () => true,
    () => false,
  );

/**
 * Cria a instância do PostgreSQL do teste com os binários da produção: o initdb (com o postgres de
 * senha gerada e o scram-sha-256 em toda conexão), a porta 5433 só em localhost, o log na pasta de
 * dados, o acesso da conta do serviço e o serviço do Windows, que inicia com o Windows e reinicia
 * depois de uma falha. O que já existe fica.
 */
export async function criarInstanciaDoTeste({
  pastas,
  ferramentas,
  executar,
  servicos,
  senhaDoSuperusuario,
}: {
  pastas: PastasDaInstalacao;
  ferramentas: FerramentasDoPostgres;
  executar: ExecutarProcesso;
  servicos: Servicos;
  senhaDoSuperusuario: string;
}): Promise<void> {
  const dados = pastas.bancoDoTeste;
  if (!(await existe(join(dados, 'PG_VERSION')))) {
    await rm(dados, { recursive: true, force: true });
    await mkdir(dirname(dados), { recursive: true });
    // O initdb só lê a senha de um arquivo; ele sai logo depois.
    const arquivoDaSenha = join(dirname(dados), 'senha-do-postgres.tmp');
    await writeFile(arquivoDaSenha, senhaDoSuperusuario);
    try {
      const { codigo, saida, erro } = await ferramentas.executar('initdb', [
        `--pgdata=${dados}`,
        '--username=postgres',
        '--auth=scram-sha-256',
        `--pwfile=${arquivoDaSenha}`,
        '--encoding=UTF8',
      ]);
      if (codigo !== 0) {
        throw new Error(`O initdb não criou a instância do teste: ${(erro || saida).trim()}`);
      }
    } finally {
      await rm(arquivoDaSenha, { force: true });
    }
  }

  const conf = join(dados, 'postgresql.conf');
  const atual = await readFile(conf, 'utf8');
  if (!atual.includes(MARCA_DA_CONFIGURACAO)) {
    const separador = atual === '' || atual.endsWith('\n') ? '' : '\n';
    await appendFile(
      conf,
      [
        separador,
        MARCA_DA_CONFIGURACAO,
        `port = ${BANCOS.teste.porta}`,
        "listen_addresses = 'localhost'",
        'logging_collector = on',
        '',
      ].join('\n'),
    );
  }

  const acesso = await executar(
    'icacls.exe',
    [dados, '/grant', `${SID_DA_CONTA_DO_SERVICO}:(OI)(CI)F`, '/T', '/Q'],
    { env: process.env },
  );
  if (acesso.codigo !== 0) {
    throw new Error(`Não foi possível dar à conta do serviço o acesso a ${dados}.`);
  }

  const servico = SERVICOS.postgresDoTeste;
  if ((await servicos.estado(servico)) === 'ausente') {
    const { codigo, saida, erro } = await ferramentas.executar('pg_ctl', [
      'register',
      '-N',
      servico,
      '-U',
      CONTA_DO_SERVICO,
      '-D',
      dados,
      '-S',
      'auto',
    ]);
    if (codigo !== 0) {
      throw new Error(
        `Não foi possível registrar o serviço do PostgreSQL do teste: ${(erro || saida).trim()}`,
      );
    }
  }
  await configurarServicoDoWindows(executar, servico, {
    nome: 'Grafite PostgreSQL Teste',
    descricao: `Grafite: o PostgreSQL do ambiente de teste, em 127.0.0.1:${BANCOS.teste.porta}.`,
  });
  await servicos.iniciar(servico);
}
