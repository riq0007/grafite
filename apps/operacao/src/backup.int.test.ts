// O backup da produção pelo comando de operação, contra o PostgreSQL de verdade: a configuração do
// config.env da produção, o registro como pedido pelo comando, o evento na organização operadora e a
// conferência do backup, com as ferramentas do contêiner.
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type BancoDeTeste, encerrarPool, iniciarBancoDeTeste } from '@grafite/db/teste';
import { type FerramentasDoPostgres, ferramentasNoConteiner } from '@grafite/operacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { backupDoServidor } from './backup.ts';
import { gerarConfigEnv } from './configuracao.ts';
import type { EstadoDaInstalacao } from './estado.ts';
import type { Instalacao } from './instalacao.ts';
import { pastasDaInstalacao } from './layout.ts';

let pasta: string;
let banco: BancoDeTeste;
let ferramentas: FerramentasDoPostgres;
let dono: pg.Pool;
let operadora: string;

beforeAll(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-backup-do-comando-'));
  banco = await iniciarBancoDeTeste({ pastaCompartilhada: pasta });
  ferramentas = ferramentasNoConteiner(banco.executarNoConteiner, {
    pasta: { noHost: pasta, noConteiner: '/compartilhada' },
    endereco: { doHost: banco.enderecoDoHost, doConteiner: '127.0.0.1:5432' },
  });
  dono = new pg.Pool({ connectionString: banco.urlDono });
  const { rows } = await dono.query<{ id: string }>('select uuidv7() as id');
  operadora = rows[0]?.id ?? '';
  const cliente = await dono.connect();
  try {
    await cliente.query('begin');
    await cliente.query("select set_config('app.org_id', $1, true)", [operadora]);
    await cliente.query("insert into organizacoes (id, nome) values ($1, 'Operadora')", [
      operadora,
    ]);
    await cliente.query(
      "insert into enderecos_de_acesso (org_id, endereco) values ($1, 'grafite.operadora.local')",
      [operadora],
    );
    await cliente.query('commit');
  } finally {
    cliente.release();
  }
});

afterAll(async () => {
  await encerrarPool(dono);
  await banco?.parar();
  await rm(pasta, { recursive: true, force: true }).catch(() => {});
});

async function instalacaoCom(variaveis: Record<string, string>): Promise<Instalacao> {
  const raiz = join(pasta, `Grafite-${Math.random().toString(36).slice(2)}`);
  const pastas = pastasDaInstalacao(raiz);
  await mkdir(pastas.producao.arquivos, { recursive: true });
  await writeFile(join(pastas.producao.arquivos, 'foto.webp'), 'uma foto');
  await writeFile(
    pastas.producao.configEnv,
    gerarConfigEnv({ GRAFITE_ARQUIVOS_PASTA: pastas.producao.arquivos, ...variaveis }),
  );
  const estado = {
    raiz,
    ambientes: { producao: { atual: '0.4.0' } },
  } as unknown as EstadoDaInstalacao;
  return { estado, pastas };
}

describe('backupDoServidor', () => {
  it('faz o backup com a configuração da produção, registrado como pedido pelo comando, e o confere', async () => {
    const destinos = [join(pasta, 'destino-1'), join(pasta, 'destino 2')];
    const instalacao = await instalacaoCom({
      GRAFITE_DATABASE_URL: banco.urlApp,
      GRAFITE_BACKUP_URL: banco.urlBackup,
      GRAFITE_BACKUP_DESTINOS: destinos.join(';'),
      GRAFITE_ORGANIZACAO_OPERADORA: 'grafite.operadora.local',
    });
    const backup = backupDoServidor({
      instalacao,
      ferramentas,
      agora: () => new Date('2026-10-08T15:00:00.000Z'),
    });

    const pronto = await backup.fazer();
    expect(pronto).toEqual({
      nome: '2026-10-08T1500Z',
      pasta: join(destinos[0] ?? '', 'grafite-producao', '2026-10-08T1500Z'),
      criadoEm: new Date('2026-10-08T15:00:00.000Z'),
    });
    const { rows } = await dono.query(
      'select pedido_por, situacao, pasta, manifesto->>$1 as versao from operacao.backups',
      ['versao'],
    );
    expect(rows).toEqual([
      { pedido_por: 'comando', situacao: 'feito', pasta: '2026-10-08T1500Z', versao: '0.4.0' },
    ]);
    const cliente = await dono.connect();
    try {
      await cliente.query('begin');
      await cliente.query("select set_config('app.org_id', $1, true)", [operadora]);
      const { rows: eventos } = await cliente.query(
        "select tipo from eventos where tipo = 'operacao.mudou'",
      );
      expect(eventos).toHaveLength(1);
      await cliente.query('commit');
    } finally {
      cliente.release();
    }

    await expect(backup.maisNovo()).resolves.toEqual(pronto);
    await expect(backup.conferir(pronto.pasta)).resolves.toMatchObject({ versao: '0.4.0' });

    // O dump alterado depois de gravado não passa. O pg_dump do contêiner o grava como root: no
    // Linux, o teste não o reescreve no lugar, mas troca o arquivo, na pasta que é dele.
    const dump = join(pronto.pasta, 'banco.dump');
    const bytes = await readFile(dump);
    bytes[bytes.length - 10] = (bytes[bytes.length - 10] ?? 0) ^ 0xff;
    await rm(dump);
    await writeFile(dump, bytes);
    await expect(backup.conferir(pronto.pasta)).rejects.toThrow(
      `O backup em ${pronto.pasta} não passou na conferência: A parte banco.dump não confere com o hash do manifesto.`,
    );
  });

  it('lista os backups de cada destino e testa a restauração do mais novo, com o registro', async () => {
    await dono.query('delete from operacao.backups');
    const destinos = [join(pasta, 'lista-1'), join(pasta, 'lista 2')];
    const instalacao = await instalacaoCom({
      GRAFITE_DATABASE_URL: banco.urlApp,
      GRAFITE_BACKUP_URL: banco.urlBackup,
      GRAFITE_BACKUP_DESTINOS: destinos.join(';'),
      GRAFITE_ORGANIZACAO_OPERADORA: 'grafite.operadora.local',
      // A instância do contêiner faz o papel da instância do teste.
      GRAFITE_RESTAURACAO_URL: banco.urlSuperusuario,
    });
    let momento = new Date('2026-10-07T05:00:00.000Z');
    const backup = backupDoServidor({
      instalacao,
      ferramentas,
      agora: () => momento,
      espacoLivre: async () => 100 * 1024 ** 3,
    });
    await backup.fazer();
    momento = new Date('2026-10-08T05:00:00.000Z');
    await backup.fazer();

    const lista = await backup.listar();
    expect(lista.map(({ destino, backups }) => [destino, backups.map((b) => b.nome)])).toEqual(
      destinos.map((destino) => [destino, ['2026-10-07T0500Z', '2026-10-08T0500Z']]),
    );
    for (const { backups } of lista) {
      for (const item of backups) {
        expect(item.versao).toBe('0.4.0');
        expect(item.tamanho).toBeGreaterThan(0);
      }
    }

    const resultado = await backup.testar();
    expect(resultado.backup).toBe('2026-10-08T0500Z');
    expect(resultado.detalhes.tabelas).toBeGreaterThan(0);
    expect(resultado.detalhes.arquivos).toBe(1);
    const { rows } = await dono.query('select situacao from operacao.testes_de_restauracao');
    expect(rows).toEqual([{ situacao: 'feito' }]);
  });

  it('sem o backup configurado, diz o que falta', async () => {
    const instalacao = await instalacaoCom({ GRAFITE_DATABASE_URL: banco.urlApp });
    const backup = backupDoServidor({ instalacao, ferramentas });
    await expect(backup.fazer()).rejects.toThrow(
      `Falta GRAFITE_BACKUP_DESTINOS em ${instalacao.pastas.producao.configEnv}: o backup não está configurado.`,
    );
  });
});

describe('backupDoServidor no Linux (change servidor-linux-com-docker)', () => {
  it('com a marca exigida, o destino desmontado é recusado, e nada é gravado nele', async () => {
    const montagem = join(pasta, 'linux-desmontado', 'mnt', 'nas');
    await mkdir(montagem, { recursive: true });
    const instalacao = await instalacaoCom({
      GRAFITE_DATABASE_URL: banco.urlApp,
      GRAFITE_BACKUP_URL: banco.urlBackup,
      GRAFITE_BACKUP_DESTINOS: montagem,
      GRAFITE_BACKUP_EXIGIR_MARCA: 'sim',
    });
    const backup = backupDoServidor({
      instalacao,
      ferramentas,
      agora: () => new Date('2026-10-08T16:00:00.000Z'),
    });

    await expect(backup.fazer()).rejects.toThrow(
      `O destino ${montagem} não tem a marca do Grafite (.grafite-destino): ele pode ser um compartilhamento que não está montado, e o backup não grava no disco do servidor no lugar dele.`,
    );
    expect(await readdir(montagem)).toEqual([]);
  });

  it('o backup feito pelo comando, como o root, passa ao usuário dos contêineres em cada destino', async () => {
    const destinos = [join(pasta, 'linux-marcado', 'backups'), join(pasta, 'linux-marcado', 'nas')];
    for (const destino of destinos) {
      await mkdir(destino, { recursive: true });
      await writeFile(join(destino, '.grafite-destino'), 'marca');
    }
    const instalacao = await instalacaoCom({
      GRAFITE_DATABASE_URL: banco.urlApp,
      GRAFITE_BACKUP_URL: banco.urlBackup,
      GRAFITE_BACKUP_DESTINOS: destinos.join(';'),
      GRAFITE_BACKUP_EXIGIR_MARCA: 'sim',
    });
    const acertadas: string[] = [];
    const backup = backupDoServidor({
      instalacao,
      ferramentas,
      agora: () => new Date('2026-10-08T17:00:00.000Z'),
      acertarDono: async (caminho) => {
        acertadas.push(caminho);
      },
    });

    const pronto = await backup.fazer();

    expect(pronto.nome).toBe('2026-10-08T1700Z');
    expect(acertadas).toEqual(destinos.map((destino) => join(destino, 'grafite-producao')));
  });
});
