// Um PostgreSQL 18 efêmero com os mesmos papéis do ambiente de desenvolvimento
// (docker/init/01-papeis.sh) e as migrations aplicadas como grafite_owner. Os testes de integração
// do packages/db e dos outros pacotes (pelo export @grafite/db/teste) sobem o banco por aqui. Com
// GRAFITE_TESTE_PG_BIN, o banco é um cluster do PostgreSQL 18 instalado, sem Docker (cluster-local.ts).
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type pg from 'pg';
import { migrar } from '../src/migrar.ts';
import { iniciarClusterLocal } from './cluster-local.ts';

const raizDb = join(dirname(fileURLToPath(import.meta.url)), '..');
const senha = () => randomBytes(18).toString('hex');

export interface ResultadoNoConteiner {
  codigo: number;
  saida: string;
  erro: string;
}

export interface BancoDeTeste {
  /** Conexão do papel dono das tabelas (grafite_owner), o das migrations. */
  urlDono: string;
  /** Conexão do papel da aplicação (grafite_app), que não fura o RLS. */
  urlApp: string;
  /** Conexão do papel do backup (grafite_backup), só de leitura e por cima do RLS. */
  urlBackup: string;
  /** Conexão do superusuário da instância (postgres), como a do teste de restauração. */
  urlSuperusuario: string;
  /** O endereço do banco visto do host (`host:porta`); de dentro do contêiner, é 127.0.0.1:5432. */
  enderecoDoHost: string;
  /** Roda um comando dentro do contêiner, como as ferramentas do PostgreSQL da mesma versão. */
  executarNoConteiner: (
    comando: string[],
    opcoes?: { env?: Record<string, string> },
  ) => Promise<ResultadoNoConteiner>;
  parar: () => Promise<void>;
}

/**
 * Encerra o pool e espera cada conexão fechar de fato, antes de o teste parar o contêiner. O `end()`
 * do pg-pool devolve antes de os sockets fecharem, e o desligamento do PostgreSQL (57P01) que chega
 * nesse meio-tempo viraria um erro do pool sem ouvinte. Sem o pool, não faz nada.
 */
export async function encerrarPool(pool: pg.Pool | undefined): Promise<void> {
  if (!pool) return;
  // O erro de uma conexão que já está fechando não interessa ao teste.
  pool.on('error', () => {});
  let abertas = pool.totalCount;
  const fechadas = new Promise<void>((resolver) => {
    if (abertas === 0) resolver();
    pool.on('remove', () => {
      abertas -= 1;
      if (abertas <= 0) resolver();
    });
  });
  await pool.end();
  await fechadas;
}

export interface OpcoesDoBancoDeTeste {
  /** Sem as migrations, para o teste aplicar só uma parte delas (padrão: aplica todas). */
  aplicarMigracoes?: boolean;
  /** Sem o papel do backup, como um banco de antes dele (padrão: com o papel). */
  papelDoBackup?: boolean;
  /** Uma pasta do host montada em /compartilhada, onde as ferramentas do contêiner leem e gravam. */
  pastaCompartilhada?: string;
}

export async function iniciarBancoDeTeste({
  aplicarMigracoes = true,
  papelDoBackup = true,
  pastaCompartilhada,
}: OpcoesDoBancoDeTeste = {}): Promise<BancoDeTeste> {
  const senhas = { super: senha(), dono: senha(), app: senha(), backup: senha() };
  const pastaBin = process.env.GRAFITE_TESTE_PG_BIN;
  if (pastaBin) {
    const cluster = await iniciarClusterLocal(pastaBin, {
      senhaDoSuperusuario: senhas.super,
      papeis: {
        dono: senhas.dono,
        app: senhas.app,
        ...(papelDoBackup ? { backup: senhas.backup } : {}),
      },
      pastaCompartilhada,
    });
    const enderecoDoHost = `127.0.0.1:${cluster.porta}`;
    const urlDono = `postgres://grafite_owner:${senhas.dono}@${enderecoDoHost}/grafite`;
    try {
      if (aplicarMigracoes) await migrar(urlDono);
    } catch (erro) {
      await cluster.parar();
      throw erro;
    }
    return {
      urlDono,
      urlApp: `postgres://grafite_app:${senhas.app}@${enderecoDoHost}/grafite`,
      urlBackup: `postgres://grafite_backup:${senhas.backup}@${enderecoDoHost}/grafite`,
      urlSuperusuario: `postgres://postgres:${senhas.super}@${enderecoDoHost}/grafite`,
      enderecoDoHost,
      executarNoConteiner: (comando, opcoes = {}) => cluster.executar(comando, opcoes.env),
      parar: cluster.parar,
    };
  }
  const imagem = new PostgreSqlContainer('postgres:18')
    .withDatabase('grafite')
    .withUsername('postgres')
    .withPassword(senhas.super)
    .withEnvironment({
      GRAFITE_DB_OWNER_PASSWORD: senhas.dono,
      GRAFITE_DB_APP_PASSWORD: senhas.app,
      ...(papelDoBackup ? { GRAFITE_DB_BACKUP_PASSWORD: senhas.backup } : {}),
    })
    .withCopyFilesToContainer([
      {
        source: join(raizDb, 'docker', 'init', '01-papeis.sh'),
        target: '/docker-entrypoint-initdb.d/01-papeis.sh',
        mode: 0o755,
      },
    ]);
  const container = await (pastaCompartilhada
    ? imagem.withBindMounts([{ source: pastaCompartilhada, target: '/compartilhada', mode: 'rw' }])
    : imagem
  ).start();

  const enderecoDoHost = `${container.getHost()}:${container.getPort()}`;
  const endereco = `${enderecoDoHost}/grafite`;
  const urlDono = `postgres://grafite_owner:${senhas.dono}@${endereco}`;
  const urlApp = `postgres://grafite_app:${senhas.app}@${endereco}`;
  const urlBackup = `postgres://grafite_backup:${senhas.backup}@${endereco}`;
  const urlSuperusuario = `postgres://postgres:${senhas.super}@${endereco}`;
  if (aplicarMigracoes) await migrar(urlDono);
  return {
    urlDono,
    urlApp,
    urlBackup,
    urlSuperusuario,
    enderecoDoHost,
    executarNoConteiner: async (comando, opcoes = {}) => {
      const { exitCode, stdout, stderr } = await container.exec(comando, { env: opcoes.env });
      return { codigo: exitCode, saida: stdout, erro: stderr };
    },
    parar: async () => {
      await container.stop();
    },
  };
}
