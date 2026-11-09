// Os registros da operação (spec backup; design do F2d, decisões 11, 13 e 14): o backup e o teste de
// restauração gravam a linha em andamento e depois o resultado em operacao.*, e o evento
// operacao.mudou na organização que opera o servidor, na mesma transação do resultado.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type BancoDeTeste, encerrarPool, iniciarBancoDeTeste } from '@grafite/db/teste';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { DependenciasDoBackup } from './backup.ts';
import { type FerramentasDoPostgres, ferramentasNoConteiner } from './postgres.ts';
import { executarBackup, executarTesteDeRestauracao, TRAVA_DA_OPERACAO } from './registros.ts';

let raiz: string;
let banco: BancoDeTeste;
let ferramentas: FerramentasDoPostgres;
let app: pg.Pool;
let dono: pg.Pool;
let operadora: string;

beforeAll(async () => {
  raiz = await mkdtemp(join(tmpdir(), 'grafite-registros-'));
  banco = await iniciarBancoDeTeste({ pastaCompartilhada: raiz });
  ferramentas = ferramentasNoConteiner(banco.executarNoConteiner, {
    pasta: { noHost: raiz, noConteiner: '/compartilhada' },
    endereco: { doHost: banco.enderecoDoHost, doConteiner: '127.0.0.1:5432' },
  });
  app = new pg.Pool({ connectionString: banco.urlApp });
  dono = new pg.Pool({ connectionString: banco.urlDono });
  const { rows } = await dono.query<{ id: string }>('select uuidv7() as id');
  operadora = rows[0]?.id ?? '';
  const c = await dono.connect();
  try {
    await c.query('begin');
    await c.query("select set_config('app.org_id', $1, true)", [operadora]);
    await c.query("insert into organizacoes (id, nome) values ($1, 'Operadora')", [operadora]);
    await c.query('commit');
  } finally {
    c.release();
  }
});

afterEach(async () => {
  await dono.query('delete from operacao.testes_de_restauracao');
  await dono.query('delete from operacao.backups');
});

afterAll(async () => {
  await encerrarPool(app);
  await encerrarPool(dono);
  await banco?.parar();
  await rm(raiz, { recursive: true, force: true }).catch(() => {});
});

async function dependencias(
  caso: string,
  momento: string,
  extra: Partial<DependenciasDoBackup> = {},
): Promise<DependenciasDoBackup> {
  const pastaDosArquivos = join(raiz, caso, 'arquivos');
  await mkdir(pastaDosArquivos, { recursive: true });
  await writeFile(join(pastaDosArquivos, 'foto.webp'), 'foto');
  return {
    urlBackup: banco.urlBackup,
    ferramentas,
    pastaDosArquivos,
    destinos: [join(raiz, caso, 'destino')],
    retencao: { diarios: 7, semanais: 4, mensais: 12 },
    fuso: 'America/Sao_Paulo',
    versao: '0.4.0-teste',
    agora: () => new Date(momento),
    ...extra,
  };
}

const backups = async () =>
  (
    await dono.query(
      `select id, situacao, pedido_por, tamanho::int as tamanho, destinos, pasta, erro,
              manifesto is not null as com_manifesto, terminado_em is not null as terminado,
              removido_em is not null as removido
         from operacao.backups order by iniciado_em`,
    )
  ).rows;

const testes = async () =>
  (
    await dono.query(
      `select backup_id, situacao, erro, detalhes, terminado_em is not null as terminado
         from operacao.testes_de_restauracao order by iniciado_em`,
    )
  ).rows;

/** Os eventos operacao.mudou da organização operadora, lidos no contexto dela. */
async function eventosDaOperadora() {
  const c = await dono.connect();
  try {
    await c.query('begin');
    await c.query("select set_config('app.org_id', $1, true)", [operadora]);
    const { rows } = await c.query(
      `select tipo, alvo_tipo, alvo_id, permissao, todas from eventos
        where tipo = 'operacao.mudou' order by momento, id`,
    );
    await c.query('commit');
    return rows;
  } finally {
    c.release();
  }
}

let eventosAntes = 0;
const eventosNovos = async () => (await eventosDaOperadora()).slice(eventosAntes);

describe('executarBackup', () => {
  it('o backup feito grava a linha do começo ao fim e o evento na organização operadora', async () => {
    eventosAntes = (await eventosDaOperadora()).length;
    const dep = await dependencias('feito', '2026-10-07T05:00:00Z');

    const feito = await executarBackup({
      ...dep,
      pool: app,
      orgOperadoraId: operadora,
      pedidoPor: 'agenda',
    });

    expect(await backups()).toEqual([
      {
        id: feito.id,
        situacao: 'feito',
        pedido_por: 'agenda',
        tamanho: feito.tamanho,
        destinos: [{ destino: dep.destinos[0], situacao: 'gravado' }],
        pasta: '2026-10-07T0500Z',
        erro: null,
        com_manifesto: true,
        terminado: true,
        removido: false,
      },
    ]);
    expect(await eventosNovos()).toEqual([
      {
        tipo: 'operacao.mudou',
        alvo_tipo: 'backup',
        alvo_id: feito.id,
        permissao: 'backup.administrar',
        todas: false,
      },
    ]);
  });

  it('o segundo backup do mesmo minuto grava a linha com a pasta -2', async () => {
    const dep = await dependencias('minuto', '2026-10-14T06:05:05Z');
    const executar = (momento: string) =>
      executarBackup({
        ...dep,
        agora: () => new Date(momento),
        pool: app,
        orgOperadoraId: operadora,
        pedidoPor: 'comando',
      });

    await executar('2026-10-14T06:05:05Z');
    await executar('2026-10-14T06:05:40Z');

    expect((await backups()).map(({ situacao, pasta }) => ({ situacao, pasta }))).toEqual([
      { situacao: 'feito', pasta: '2026-10-14T0605Z' },
      { situacao: 'feito', pasta: '2026-10-14T0605Z-2' },
    ]);
  });

  it('o backup que falhou grava o erro e os destinos, e devolve a falha', async () => {
    eventosAntes = (await eventosDaOperadora()).length;
    const comErro: FerramentasDoPostgres = {
      executar: async () => ({ codigo: 1, saida: '', erro: 'pg_dump: error: falha simulada' }),
    };
    const dep = await dependencias('falhou', '2026-10-07T05:10:00Z', { ferramentas: comErro });

    await expect(
      executarBackup({ ...dep, pool: app, orgOperadoraId: operadora, pedidoPor: 'tela' }),
    ).rejects.toThrow('O pg_dump falhou: pg_dump: error: falha simulada');

    expect(await backups()).toMatchObject([
      {
        situacao: 'falhou',
        pedido_por: 'tela',
        erro: 'O pg_dump falhou: pg_dump: error: falha simulada',
        destinos: [
          {
            destino: dep.destinos[0],
            situacao: 'falhou',
            erro: 'O pg_dump falhou: pg_dump: error: falha simulada',
          },
        ],
        terminado: true,
        com_manifesto: false,
      },
    ]);
    expect(await eventosNovos()).toHaveLength(1);
  });

  it('sem a organização operadora, grava a linha e nenhum evento', async () => {
    eventosAntes = (await eventosDaOperadora()).length;
    const dep = await dependencias('sem-operadora', '2026-10-07T05:20:00Z');
    await executarBackup({ ...dep, pool: app, orgOperadoraId: null, pedidoPor: 'comando' });
    expect(await backups()).toMatchObject([{ situacao: 'feito', pedido_por: 'comando' }]);
    expect(await eventosNovos()).toEqual([]);
  });

  it('com outro backup em andamento noutro processo, recusa sem gravar nada', async () => {
    const outro = await app.connect();
    try {
      await outro.query('select pg_advisory_lock($1)', [TRAVA_DA_OPERACAO]);
      const dep = await dependencias('travado', '2026-10-07T05:30:00Z');
      await expect(
        executarBackup({ ...dep, pool: app, orgOperadoraId: operadora, pedidoPor: 'tela' }),
      ).rejects.toThrow('Já há um backup ou um teste de restauração em andamento.');
      expect(await backups()).toEqual([]);
    } finally {
      await outro.query('select pg_advisory_unlock($1)', [TRAVA_DA_OPERACAO]);
      outro.release();
    }
  });

  it('a linha presa por uma queda vira falha e não bloqueia o próximo backup', async () => {
    await dono.query("insert into operacao.backups (pedido_por) values ('agenda')");
    const dep = await dependencias('queda', '2026-10-07T05:40:00Z');
    await executarBackup({ ...dep, pool: app, orgOperadoraId: operadora, pedidoPor: 'agenda' });
    expect((await backups()).map(({ situacao, erro }) => ({ situacao, erro }))).toEqual([
      { situacao: 'falhou', erro: 'O backup foi interrompido antes de terminar.' },
      { situacao: 'feito', erro: null },
    ]);
  });

  it('marca como removidos os backups que a retenção apagou', async () => {
    const primeiro = await dependencias('retencao', '2026-10-06T05:00:00Z', {
      retencao: { diarios: 1, semanais: 0, mensais: 0 },
    });
    await executarBackup({
      ...primeiro,
      pool: app,
      orgOperadoraId: operadora,
      pedidoPor: 'agenda',
    });
    await executarBackup({
      ...primeiro,
      agora: () => new Date('2026-10-07T05:00:00Z'),
      pool: app,
      orgOperadoraId: operadora,
      pedidoPor: 'agenda',
    });
    expect((await backups()).map(({ pasta, removido }) => ({ pasta, removido }))).toEqual([
      { pasta: '2026-10-06T0500Z', removido: true },
      { pasta: '2026-10-07T0500Z', removido: false },
    ]);
  });
});

describe('executarTesteDeRestauracao', () => {
  it('grava o backup testado, os detalhes e o evento', async () => {
    const dep = await dependencias('teste-bom', '2026-10-07T05:00:00Z');
    const feito = await executarBackup({
      ...dep,
      pool: app,
      orgOperadoraId: operadora,
      pedidoPor: 'agenda',
    });
    eventosAntes = (await eventosDaOperadora()).length;

    const resultado = await executarTesteDeRestauracao({
      ferramentas,
      urlRestauracao: banco.urlSuperusuario,
      destinos: dep.destinos,
      espacoLivre: async () => Number.MAX_SAFE_INTEGER,
      pool: app,
      orgOperadoraId: operadora,
    });

    expect(await testes()).toEqual([
      {
        backup_id: feito.id,
        situacao: 'feito',
        erro: null,
        detalhes: resultado.detalhes,
        terminado: true,
      },
    ]);
    expect(resultado.detalhes.arquivos).toBe(1);
    expect(await eventosNovos()).toMatchObject([
      { tipo: 'operacao.mudou', alvo_tipo: 'teste-de-restauracao', alvo_id: resultado.id },
    ]);
  });

  it('o teste que falha grava o motivo e o backup testado', async () => {
    const dep = await dependencias('teste-ruim', '2026-10-07T05:00:00Z');
    const feito = await executarBackup({
      ...dep,
      pool: app,
      orgOperadoraId: operadora,
      pedidoPor: 'agenda',
    });
    const dump = join(dep.destinos[0] ?? '', 'grafite-producao', '2026-10-07T0500Z', 'banco.dump');
    const bytes = await readFile(dump);
    bytes[bytes.length - 10] = (bytes[bytes.length - 10] ?? 0) ^ 0xff;
    // O pg_dump do contêiner grava o dump como root: no Linux, o teste não o reescreve no lugar,
    // mas troca o arquivo, na pasta que é dele.
    await rm(dump);
    await writeFile(dump, bytes);

    await expect(
      executarTesteDeRestauracao({
        ferramentas,
        urlRestauracao: banco.urlSuperusuario,
        destinos: dep.destinos,
        espacoLivre: async () => Number.MAX_SAFE_INTEGER,
        pool: app,
        orgOperadoraId: operadora,
      }),
    ).rejects.toThrow('A parte banco.dump não confere com o hash do manifesto.');

    expect(await testes()).toMatchObject([
      {
        backup_id: feito.id,
        situacao: 'falhou',
        erro: 'O backup 2026-10-07T0500Z não passou na conferência: A parte banco.dump não confere com o hash do manifesto.',
        terminado: true,
      },
    ]);
  });

  it('sem backup pronto, grava a falha sem backup testado', async () => {
    await expect(
      executarTesteDeRestauracao({
        ferramentas,
        urlRestauracao: banco.urlSuperusuario,
        destinos: [join(raiz, 'sem-backup', 'destino')],
        pool: app,
        orgOperadoraId: operadora,
      }),
    ).rejects.toThrow('Nenhum backup pronto para testar.');
    expect(await testes()).toMatchObject([
      { backup_id: null, situacao: 'falhou', erro: 'Nenhum backup pronto para testar.' },
    ]);
  });
});
