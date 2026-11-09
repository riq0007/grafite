// O banco de teste sem Docker (change ci-sem-docker): com GRAFITE_TESTE_PG_BIN apontando para a
// pasta bin de um PostgreSQL 18, cada banco de teste é um cluster próprio, criado pelo initdb numa
// pasta temporária e ligado pelo pg_ctl numa porta livre, com os mesmos papéis do contêiner. Os
// papéis valem para o cluster inteiro, e as migrations os citam pelo nome: por isso, um cluster por
// banco, e não um banco por teste numa instância só (design, decisão 1).
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

const FERRAMENTAS = ['pg_dump', 'pg_restore', 'psql', 'pg_dumpall', 'postgres', 'initdb', 'pg_ctl'];
const ENDERECO_NO_CONTEINER = '127.0.0.1:5432';
const PASTA_NO_CONTEINER = '/compartilhada';

export interface ComandoLocal {
  ferramenta: string;
  argumentos: string[];
  senha?: string;
  entrada?: string;
}

/**
 * O comando que os testes mandariam ao contêiner, como o `ferramentasNoConteiner` o monta, rodado
 * da pasta da instalação: o endereço do contêiner vira o do cluster, e a pasta compartilhada, a do
 * host (design, decisão 2).
 */
export function comandoLocal(
  comando: readonly string[],
  env: Record<string, string>,
  { porta, pasta }: { porta: number; pasta?: string },
): ComandoLocal {
  const comShell = comando[0] === 'sh' && comando[1] === '-c';
  const [ferramenta = '', ...resto] = comShell ? comando.slice(4) : comando;
  if (!FERRAMENTAS.includes(ferramenta)) {
    throw new Error(
      `O banco de teste local só roda as ferramentas do PostgreSQL, e não ${ferramenta}.`,
    );
  }
  const argumentos = resto.map((argumento) => {
    let traduzido = argumento.replaceAll(ENDERECO_NO_CONTEINER, `127.0.0.1:${porta}`);
    const inicio = traduzido.indexOf(PASTA_NO_CONTEINER);
    if (pasta && inicio >= 0) {
      const partes = traduzido
        .slice(inicio + PASTA_NO_CONTEINER.length)
        .split('/')
        .filter(Boolean);
      traduzido = `${traduzido.slice(0, inicio)}${join(pasta, ...partes)}`;
    }
    return traduzido;
  });
  return {
    ferramenta,
    argumentos,
    ...(env.PGPASSWORD !== undefined && { senha: env.PGPASSWORD }),
    ...(comShell && env.GRAFITE_ENTRADA !== undefined && { entrada: env.GRAFITE_ENTRADA }),
  };
}

/** A versão maior na saída do `postgres --version`. */
export function versaoMaiorDoPostgres(saida: string): number | undefined {
  const versao = /^postgres \(PostgreSQL\) (\d+)/.exec(saida.trim());
  return versao?.[1] ? Number(versao[1]) : undefined;
}

const literal = (texto: string) => `'${texto.replaceAll("'", "''")}'`;

/** O SQL dos papéis do 01-papeis.sh do desenvolvimento, com as senhas, para o banco `grafite`. */
export function sqlDosPapeis(senhas: { dono: string; app: string; backup?: string }): string {
  const papeis = `CREATE ROLE grafite_owner LOGIN PASSWORD ${literal(senhas.dono)}
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE grafite_app LOGIN PASSWORD ${literal(senhas.app)}
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

ALTER DATABASE grafite OWNER TO grafite_owner;
REVOKE ALL ON DATABASE grafite FROM PUBLIC;
GRANT CONNECT ON DATABASE grafite TO grafite_app;

ALTER SCHEMA public OWNER TO grafite_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO grafite_app;

ALTER DEFAULT PRIVILEGES FOR ROLE grafite_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO grafite_app;
ALTER DEFAULT PRIVILEGES FOR ROLE grafite_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO grafite_app;`;
  if (senhas.backup === undefined) return papeis;
  return `${papeis}
CREATE ROLE grafite_backup LOGIN PASSWORD ${literal(senhas.backup)}
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
GRANT CONNECT ON DATABASE grafite TO grafite_backup;`;
}

export interface ResultadoLocal {
  codigo: number;
  saida: string;
  erro: string;
}

/** Roda uma ferramenta da pasta bin, com a senha no PGPASSWORD e a entrada no stdin. */
export function rodarFerramenta(
  pastaBin: string,
  { ferramenta, argumentos, senha, entrada }: ComandoLocal,
): Promise<ResultadoLocal> {
  const arquivo = join(pastaBin, process.platform === 'win32' ? `${ferramenta}.exe` : ferramenta);
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.PGPASSWORD;
  if (senha !== undefined) env.PGPASSWORD = senha;
  return new Promise((resolver, rejeitar) => {
    const filho = spawn(arquivo, argumentos, { env, windowsHide: true });
    let saida = '';
    let erro = '';
    filho.stdout.on('data', (parte) => {
      saida += parte;
    });
    filho.stderr.on('data', (parte) => {
      erro += parte;
    });
    filho.on('error', rejeitar);
    filho.on('close', (codigo) => resolver({ codigo: codigo ?? 1, saida, erro }));
    filho.stdin.on('error', () => {});
    filho.stdin.end(entrada ?? '');
  });
}

function portaLivre(): Promise<number> {
  return new Promise((resolver, rejeitar) => {
    const servidor = createServer();
    servidor.on('error', rejeitar);
    servidor.listen(0, '127.0.0.1', () => {
      const endereco = servidor.address();
      servidor.close(() =>
        typeof endereco === 'object' && endereco ? resolver(endereco.port) : rejeitar(),
      );
    });
  });
}

async function exigir(pastaBin: string, comando: ComandoLocal, oQue: string): Promise<string> {
  const { codigo, saida, erro } = await rodarFerramenta(pastaBin, comando);
  if (codigo !== 0) throw new Error(`${oQue} falhou: ${(erro || saida).trim()}`);
  return saida;
}

export interface ClusterLocal {
  porta: number;
  executar: (comando: string[], env?: Record<string, string>) => Promise<ResultadoLocal>;
  parar: () => Promise<void>;
}

/**
 * Cria e liga um cluster do PostgreSQL 18 da pasta bin, com o banco `grafite` e os papéis, como o
 * contêiner do banco de teste. O superusuário é o `postgres`, com a senha dada.
 */
export async function iniciarClusterLocal(
  pastaBin: string,
  {
    senhaDoSuperusuario,
    papeis,
    pastaCompartilhada,
  }: {
    senhaDoSuperusuario: string;
    papeis: { dono: string; app: string; backup?: string };
    pastaCompartilhada?: string;
  },
): Promise<ClusterLocal> {
  const versao = versaoMaiorDoPostgres(
    await exigir(
      pastaBin,
      { ferramenta: 'postgres', argumentos: ['--version'] },
      'O postgres --version',
    ),
  );
  if (versao !== 18) {
    throw new Error(
      `GRAFITE_TESTE_PG_BIN aponta para o PostgreSQL ${versao ?? 'desconhecido'}, e o banco de teste pede o 18: ${pastaBin}`,
    );
  }
  const pasta = await mkdtemp(join(tmpdir(), 'grafite-teste-'));
  const dados = join(pasta, 'dados');
  const arquivoDaSenha = join(pasta, `senha-${randomBytes(4).toString('hex')}`);
  await writeFile(arquivoDaSenha, senhaDoSuperusuario);
  await exigir(
    pastaBin,
    {
      ferramenta: 'initdb',
      argumentos: [
        `--pgdata=${dados}`,
        '--username=postgres',
        `--pwfile=${arquivoDaSenha}`,
        '--auth=scram-sha-256',
        '--encoding=UTF8',
        '--no-locale',
      ],
    },
    'O initdb do banco de teste',
  );
  await rm(arquivoDaSenha);
  const porta = await portaLivre();
  const opcoes = [`-p ${porta}`, '-c listen_addresses=127.0.0.1'];
  if (process.platform !== 'win32') opcoes.push(`-c unix_socket_directories=${pasta}`);
  await exigir(
    pastaBin,
    {
      ferramenta: 'pg_ctl',
      argumentos: [
        'start',
        '-w',
        `-D${dados}`,
        `-l${join(pasta, 'postgres.log')}`,
        `-o${opcoes.join(' ')}`,
      ],
    },
    'O pg_ctl start do banco de teste',
  );
  const parar = async () => {
    await rodarFerramenta(pastaBin, {
      ferramenta: 'pg_ctl',
      argumentos: ['stop', '-w', '-m', 'fast', `-D${dados}`],
    });
    await rm(pasta, { recursive: true, force: true });
  };
  try {
    const superusuario = (banco: string) =>
      new pg.Client({
        connectionString: `postgres://postgres:${encodeURIComponent(senhaDoSuperusuario)}@127.0.0.1:${porta}/${banco}`,
      });
    const instancia = superusuario('postgres');
    await instancia.connect();
    await instancia.query("CREATE DATABASE grafite ENCODING 'UTF8' TEMPLATE template0");
    await instancia.end();
    const grafite = superusuario('grafite');
    await grafite.connect();
    await grafite.query(sqlDosPapeis(papeis));
    await grafite.end();
  } catch (erro) {
    await parar();
    throw erro;
  }
  return {
    porta,
    executar: (comando, env = {}) =>
      rodarFerramenta(pastaBin, comandoLocal(comando, env, { porta, pasta: pastaCompartilhada })),
    parar,
  };
}
