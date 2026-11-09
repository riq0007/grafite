import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ExecutarProcesso,
  FerramentaDoPostgres,
  FerramentasDoPostgres,
  OpcoesDaFerramenta,
  ResultadoDaFerramenta,
} from '@grafite/operacao';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  conferirPostgres18,
  conferirServidorDaProducao,
  criarInstanciaDoTeste,
  rodarSql,
  sqlDoBanco,
} from './banco.ts';
import { pastasDaInstalacao } from './layout.ts';
import type { EstadoDoServico, Servicos } from './windows/servicos.ts';

interface ChamadaDaFerramenta {
  ferramenta: FerramentaDoPostgres;
  argumentos: string[];
  opcoes: OpcoesDaFerramenta;
}

function ferramentasSimuladas(
  responder: (
    chamada: ChamadaDaFerramenta,
  ) =>
    | Partial<ResultadoDaFerramenta>
    | undefined
    | Promise<Partial<ResultadoDaFerramenta> | undefined>,
) {
  const chamadas: ChamadaDaFerramenta[] = [];
  const ferramentas: FerramentasDoPostgres = {
    async executar(ferramenta, argumentos, opcoes = {}) {
      const chamada = { ferramenta, argumentos, opcoes };
      chamadas.push(chamada);
      const resposta = (await responder(chamada)) ?? {};
      return { codigo: 0, saida: '', erro: '', ...resposta };
    },
  };
  return { chamadas, ferramentas };
}

describe('sqlDoBanco', () => {
  it('cria ou acerta os três papéis e o banco, com o dono e as permissões da aplicação', () => {
    const sql = sqlDoBanco('grafite', {
      dono: 'senha-dono',
      app: 'senha-app',
      backup: 'senha-bkp',
    });
    expect(sql.split('\n')).toEqual([
      '-- Os papéis e o banco do Grafite (grafite instalar). Pode rodar de novo: acerta o que existe.',
      "SELECT 'CREATE ROLE grafite_owner' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'grafite_owner') \\gexec",
      "SELECT 'CREATE ROLE grafite_app' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'grafite_app') \\gexec",
      "SELECT 'CREATE ROLE grafite_backup' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'grafite_backup') \\gexec",
      "ALTER ROLE grafite_owner WITH LOGIN PASSWORD 'senha-dono' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;",
      "ALTER ROLE grafite_app WITH LOGIN PASSWORD 'senha-app' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;",
      "ALTER ROLE grafite_backup WITH LOGIN PASSWORD 'senha-bkp' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;",
      "SELECT 'CREATE DATABASE grafite OWNER grafite_owner ENCODING ''UTF8'' TEMPLATE template0' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'grafite') \\gexec",
      'ALTER DATABASE grafite OWNER TO grafite_owner;',
      'REVOKE ALL ON DATABASE grafite FROM PUBLIC;',
      'GRANT CONNECT ON DATABASE grafite TO grafite_app, grafite_backup;',
      '\\connect grafite',
      'ALTER SCHEMA public OWNER TO grafite_owner;',
      'REVOKE ALL ON SCHEMA public FROM PUBLIC;',
      'GRANT USAGE ON SCHEMA public TO grafite_app;',
      'ALTER DEFAULT PRIVILEGES FOR ROLE grafite_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO grafite_app;',
      'ALTER DEFAULT PRIVILEGES FOR ROLE grafite_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO grafite_app;',
      "DO $$ BEGIN IF to_regprocedure('app.conceder_leitura_ao_backup()') IS NOT NULL THEN PERFORM app.conceder_leitura_ao_backup(); END IF; END $$;",
      '',
    ]);
  });

  it('sem a senha do backup, o papel existe sem entrar, só para as permissões dos dumps restaurados', () => {
    const sql = sqlDoBanco('grafite_teste', { dono: 'a', app: 'b' });
    expect(sql).toContain(
      'ALTER ROLE grafite_backup WITH NOLOGIN PASSWORD NULL NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;',
    );
    expect(sql).toContain('\\connect grafite_teste');
  });

  it('dobra as aspas simples das senhas e recusa um nome de banco fora do padrão', () => {
    expect(sqlDoBanco('grafite', { dono: "d'a", app: 'b', backup: 'c' })).toContain(
      "PASSWORD 'd''a'",
    );
    expect(() => sqlDoBanco('grafite; drop', { dono: 'a', app: 'b' })).toThrow(
      'O nome do banco grafite; drop não serve.',
    );
  });
});

describe('rodarSql', () => {
  it('roda o psql como o postgres da instância, com a senha fora dos argumentos e o SQL pelo stdin', async () => {
    const { chamadas, ferramentas } = ferramentasSimuladas(() => ({ saida: 'pronto' }));
    await expect(rodarSql(ferramentas, { porta: 5433, senha: 's3nh4' }, 'select 1;')).resolves.toBe(
      'pronto',
    );
    expect(chamadas).toEqual([
      {
        ferramenta: 'psql',
        argumentos: [
          '--no-psqlrc',
          '--quiet',
          '--set=ON_ERROR_STOP=1',
          '--dbname=postgres://postgres@127.0.0.1:5433/postgres',
          '--file=-',
        ],
        opcoes: { senha: 's3nh4', entrada: 'select 1;' },
      },
    ]);
  });

  it('a falha do psql vem com o erro dele', async () => {
    const { ferramentas } = ferramentasSimuladas(() => ({
      codigo: 3,
      erro: 'psql: ERROR:  permission denied\n',
    }));
    await expect(rodarSql(ferramentas, { porta: 5432, senha: 'x' }, 'select 1;')).rejects.toThrow(
      'O psql falhou na instância de 127.0.0.1:5432: psql: ERROR:  permission denied',
    );
  });
});

describe('conferirPostgres18', () => {
  const pgBin = 'C:\\Program Files\\PostgreSQL\\18\\bin';

  it('passa com o pg_dump 18', async () => {
    const { ferramentas } = ferramentasSimuladas(() => ({ saida: 'pg_dump (PostgreSQL) 18.1\n' }));
    await expect(conferirPostgres18(ferramentas, pgBin)).resolves.toBeUndefined();
  });

  it('sem os binários, diz que o PostgreSQL 18 precisa estar instalado', async () => {
    const ferramentas: FerramentasDoPostgres = {
      executar: async () => {
        throw new Error('Não foi possível executar pg_dump.exe: spawn ENOENT');
      },
    };
    await expect(conferirPostgres18(ferramentas, pgBin)).rejects.toThrow(
      `O PostgreSQL 18 precisa estar instalado, à mão ou pelo atalho de instalação (Instalar-Grafite.cmd): não encontrei o pg_dump em ${pgBin}.`,
    );
  });

  it('com outra versão, diz qual encontrou', async () => {
    const { ferramentas } = ferramentasSimuladas(() => ({ saida: 'pg_dump (PostgreSQL) 16.4\n' }));
    await expect(conferirPostgres18(ferramentas, pgBin)).rejects.toThrow(
      `O PostgreSQL 18 precisa estar instalado: em ${pgBin} está o PostgreSQL 16.4.`,
    );
  });
});

describe('conferirServidorDaProducao', () => {
  it('passa com o servidor 18 respondendo à senha do postgres', async () => {
    const { chamadas, ferramentas } = ferramentasSimuladas(() => ({ saida: '180001\n' }));
    await expect(conferirServidorDaProducao(ferramentas, 's3nh4')).resolves.toBeUndefined();
    expect(chamadas).toEqual([
      {
        ferramenta: 'psql',
        argumentos: [
          '--no-psqlrc',
          '--tuples-only',
          '--no-align',
          '--dbname=postgres://postgres@127.0.0.1:5432/postgres',
          '--command=show server_version_num',
        ],
        opcoes: { senha: 's3nh4' },
      },
    ]);
  });

  it('a senha errada ou o servidor parado param a instalação com o motivo', async () => {
    const { ferramentas } = ferramentasSimuladas(() => ({
      codigo: 2,
      erro: 'psql: error: password authentication failed for user "postgres"\n',
    }));
    await expect(conferirServidorDaProducao(ferramentas, 'errada')).rejects.toThrow(
      'O PostgreSQL da produção não respondeu em 127.0.0.1:5432 com a senha do postgres: psql: error: password authentication failed for user "postgres"',
    );
  });

  it('o servidor de outra versão para a instalação', async () => {
    const { ferramentas } = ferramentasSimuladas(() => ({ saida: '170005\n' }));
    await expect(conferirServidorDaProducao(ferramentas, 's')).rejects.toThrow(
      'O PostgreSQL da produção, em 127.0.0.1:5432, é o 17; o Grafite precisa do 18.',
    );
  });
});

describe('criarInstanciaDoTeste', () => {
  let raiz: string;

  beforeEach(async () => {
    raiz = await mkdtemp(join(tmpdir(), 'grafite-instancia-'));
  });

  afterEach(async () => {
    await rm(raiz, { recursive: true, force: true });
  });

  function servicosSimulados(inicial: Record<string, EstadoDoServico> = {}) {
    const estados = new Map(Object.entries(inicial));
    const eventos: string[] = [];
    const servicos: Servicos = {
      registrar: async (definicao) => {
        eventos.push(`registrar ${definicao.id}`);
      },
      iniciar: async (id) => {
        eventos.push(`iniciar ${id}`);
        estados.set(id, 'rodando');
      },
      parar: async (id) => {
        eventos.push(`parar ${id}`);
        estados.set(id, 'parado');
      },
      estado: async (id) => estados.get(id) ?? 'ausente',
    };
    return { eventos, servicos };
  }

  function executorSimulado(eventos: string[]) {
    const chamadas: { arquivo: string; argumentos: string[] }[] = [];
    const executar: ExecutarProcesso = async (arquivo, argumentos) => {
      chamadas.push({ arquivo, argumentos });
      eventos.push(`${arquivo} ${argumentos[0]}`);
      return { codigo: 0, saida: '', erro: '' };
    };
    return { chamadas, executar };
  }

  it('cria a instância com o initdb, na porta 5433, e a registra como serviço da conta NetworkService', async () => {
    const pastas = pastasDaInstalacao(raiz);
    const { eventos, servicos } = servicosSimulados();
    const { chamadas: doExecutor, executar } = executorSimulado(eventos);
    let senhaLida = '';
    const { chamadas, ferramentas } = ferramentasSimuladas(async ({ ferramenta, argumentos }) => {
      eventos.push(ferramenta);
      if (ferramenta === 'initdb') {
        const arquivo = argumentos.find((a) => a.startsWith('--pwfile='))?.slice(9) ?? '';
        senhaLida = await readFile(arquivo, 'utf8');
        await mkdir(pastas.bancoDoTeste, { recursive: true });
        await writeFile(join(pastas.bancoDoTeste, 'PG_VERSION'), '18\n');
        await writeFile(join(pastas.bancoDoTeste, 'postgresql.conf'), '#port = 5432\n');
      }
      return undefined;
    });

    await criarInstanciaDoTeste({
      pastas,
      ferramentas,
      executar,
      servicos,
      senhaDoSuperusuario: 'senha-do-teste',
    });

    expect(senhaLida).toBe('senha-do-teste');
    const initdb = chamadas.find((c) => c.ferramenta === 'initdb');
    expect(initdb?.argumentos.filter((a) => !a.startsWith('--pwfile='))).toEqual([
      `--pgdata=${pastas.bancoDoTeste}`,
      '--username=postgres',
      '--auth=scram-sha-256',
      '--encoding=UTF8',
    ]);
    const arquivoDaSenha = initdb?.argumentos.find((a) => a.startsWith('--pwfile='))?.slice(9);
    await expect(access(arquivoDaSenha ?? '')).rejects.toThrow();
    expect(await readFile(join(pastas.bancoDoTeste, 'postgresql.conf'), 'utf8')).toBe(
      [
        '#port = 5432',
        '',
        '# Grafite: a instância do ambiente de teste, criada por grafite instalar.',
        'port = 5433',
        "listen_addresses = 'localhost'",
        'logging_collector = on',
        '',
      ].join('\n'),
    );
    expect(chamadas.find((c) => c.ferramenta === 'pg_ctl')?.argumentos).toEqual([
      'register',
      '-N',
      'grafite-postgresql-teste',
      '-U',
      'NT AUTHORITY\\NetworkService',
      '-D',
      pastas.bancoDoTeste,
      '-S',
      'auto',
    ]);
    expect(doExecutor).toEqual([
      {
        arquivo: 'icacls.exe',
        argumentos: [pastas.bancoDoTeste, '/grant', '*S-1-5-20:(OI)(CI)F', '/T', '/Q'],
      },
      {
        arquivo: 'sc.exe',
        argumentos: [
          'config',
          'grafite-postgresql-teste',
          'DisplayName=',
          'Grafite PostgreSQL Teste',
        ],
      },
      {
        arquivo: 'sc.exe',
        argumentos: [
          'description',
          'grafite-postgresql-teste',
          'Grafite: o PostgreSQL do ambiente de teste, em 127.0.0.1:5433.',
        ],
      },
      {
        arquivo: 'sc.exe',
        argumentos: [
          'failure',
          'grafite-postgresql-teste',
          'reset=',
          '86400',
          'actions=',
          'restart/10000/restart/10000/restart/60000',
        ],
      },
    ]);
    expect(eventos).toEqual([
      'initdb',
      `icacls.exe ${pastas.bancoDoTeste}`,
      'pg_ctl',
      'sc.exe config',
      'sc.exe description',
      'sc.exe failure',
      'iniciar grafite-postgresql-teste',
    ]);
  });

  it('na retomada, não recria a instância nem o serviço, e não repete a configuração', async () => {
    const pastas = pastasDaInstalacao(raiz);
    await mkdir(pastas.bancoDoTeste, { recursive: true });
    await writeFile(join(pastas.bancoDoTeste, 'PG_VERSION'), '18\n');
    const conf =
      '#port = 5432\n\n# Grafite: a instância do ambiente de teste, criada por grafite instalar.\nport = 5433\n';
    await writeFile(join(pastas.bancoDoTeste, 'postgresql.conf'), conf);
    const { eventos, servicos } = servicosSimulados({ 'grafite-postgresql-teste': 'parado' });
    const { executar } = executorSimulado(eventos);
    const { chamadas, ferramentas } = ferramentasSimuladas(() => undefined);

    await criarInstanciaDoTeste({
      pastas,
      ferramentas,
      executar,
      servicos,
      senhaDoSuperusuario: 'senha-do-teste',
    });

    expect(chamadas).toEqual([]);
    expect(await readFile(join(pastas.bancoDoTeste, 'postgresql.conf'), 'utf8')).toBe(conf);
    expect(eventos.at(-1)).toBe('iniciar grafite-postgresql-teste');
  });

  it('a pasta de um initdb interrompido é refeita', async () => {
    const pastas = pastasDaInstalacao(raiz);
    await mkdir(join(pastas.bancoDoTeste, 'base'), { recursive: true });
    const { servicos } = servicosSimulados();
    const { executar } = executorSimulado([]);
    let vaziaNoInitdb = false;
    const { ferramentas } = ferramentasSimuladas(async ({ ferramenta }) => {
      if (ferramenta === 'initdb') {
        vaziaNoInitdb = await access(pastas.bancoDoTeste).then(
          () => false,
          () => true,
        );
        await mkdir(pastas.bancoDoTeste, { recursive: true });
        await writeFile(join(pastas.bancoDoTeste, 'PG_VERSION'), '18\n');
        await writeFile(join(pastas.bancoDoTeste, 'postgresql.conf'), '');
      }
      return undefined;
    });
    await criarInstanciaDoTeste({
      pastas,
      ferramentas,
      executar,
      servicos,
      senhaDoSuperusuario: 's',
    });
    expect(vaziaNoInitdb).toBe(true);
  });

  it('a falha do initdb para com o erro dele, e o arquivo da senha não fica', async () => {
    const pastas = pastasDaInstalacao(raiz);
    const { servicos } = servicosSimulados();
    const { executar } = executorSimulado([]);
    let arquivo = '';
    const { ferramentas } = ferramentasSimuladas(({ ferramenta, argumentos }) => {
      if (ferramenta !== 'initdb') return undefined;
      arquivo = argumentos.find((a) => a.startsWith('--pwfile='))?.slice(9) ?? '';
      return { codigo: 1, erro: 'initdb: error: could not create directory\n' };
    });
    await expect(
      criarInstanciaDoTeste({ pastas, ferramentas, executar, servicos, senhaDoSuperusuario: 's' }),
    ).rejects.toThrow(
      'O initdb não criou a instância do teste: initdb: error: could not create directory',
    );
    await expect(access(arquivo)).rejects.toThrow();
  });
});
