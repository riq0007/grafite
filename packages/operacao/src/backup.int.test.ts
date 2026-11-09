// O backup num destino (spec backup; design do F2d, decisão 11), com o PostgreSQL de verdade: o
// pg_dump roda no contêiner do banco, numa pasta do host montada nele.
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lerDiarioDasMigracoes } from '@grafite/db';
import { type BancoDeTeste, encerrarPool, iniciarBancoDeTeste } from '@grafite/db/teste';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type DependenciasDoBackup, FalhaNoBackup, fazerBackup } from './backup.ts';
import { MARCA_DO_DESTINO } from './distribuicao.ts';
import { conferirPartes, lerManifesto } from './manifesto.ts';
import { type FerramentasDoPostgres, ferramentasNoConteiner } from './postgres.ts';
import { conferirZip } from './zip.ts';

let raiz: string;
let banco: BancoDeTeste;
let ferramentas: FerramentasDoPostgres;
let app: pg.Pool;

beforeAll(async () => {
  raiz = await mkdtemp(join(tmpdir(), 'grafite-backup-'));
  banco = await iniciarBancoDeTeste({ pastaCompartilhada: raiz });
  ferramentas = ferramentasNoConteiner(banco.executarNoConteiner, {
    pasta: { noHost: raiz, noConteiner: '/compartilhada' },
    endereco: { doHost: banco.enderecoDoHost, doConteiner: '127.0.0.1:5432' },
  });
  app = new pg.Pool({ connectionString: banco.urlApp });
});

afterAll(async () => {
  await encerrarPool(app);
  await banco?.parar();
  await rm(raiz, { recursive: true, force: true }).catch(() => {});
});

const SENHA_DO_BACKUP = () => new URL(banco.urlBackup).password;

async function dependencias(
  nome: string,
  momento: string,
  extra: Partial<DependenciasDoBackup> = {},
): Promise<DependenciasDoBackup> {
  const pastaDosArquivos = join(raiz, nome, 'arquivos');
  await mkdir(join(pastaDosArquivos, 'fotos'), { recursive: true });
  await writeFile(join(pastaDosArquivos, 'fotos', 'retrato.webp'), 'foto');
  return {
    urlBackup: banco.urlBackup,
    ferramentas,
    pastaDosArquivos,
    destinos: [join(raiz, nome, 'destino um')],
    retencao: { diarios: 7, semanais: 4, mensais: 12 },
    fuso: 'America/Sao_Paulo',
    versao: '0.4.0-teste',
    agora: () => new Date(momento),
    ...extra,
  };
}

const testeDeRestauracaoFalho = () =>
  app.query(
    `insert into operacao.testes_de_restauracao (situacao, terminado_em, erro)
     values ('falhou', now(), 'Nenhum backup pronto para testar.')`,
  );

/** As linhas de uma tabela dentro do dump, pela saída do pg_restore em SQL. */
async function linhasNoDump(dump: string, esquema: string, tabela: string): Promise<number> {
  const { codigo, saida, erro } = await ferramentas.executar('pg_restore', [
    '--data-only',
    `--schema=${esquema}`,
    `--table=${tabela}`,
    '--file=-',
    dump,
  ]);
  expect(erro).toBe('');
  expect(codigo).toBe(0);
  const linhas = saida.split('\n');
  const inicio = linhas.findIndex((linha) => linha.startsWith(`COPY ${esquema}.${tabela} `));
  const fim = linhas.indexOf('\\.', inicio);
  return fim - inicio - 1;
}

describe('fazerBackup num destino', () => {
  it('uma inclusão no meio do dump não desalinha o manifesto', async () => {
    await testeDeRestauracaoFalho();
    await testeDeRestauracaoFalho();
    const comInclusao: FerramentasDoPostgres = {
      executar: async (ferramenta, argumentos, opcoes) => {
        if (ferramenta === 'pg_dump') await testeDeRestauracaoFalho();
        return ferramentas.executar(ferramenta, argumentos, opcoes);
      },
    };
    const feito = await fazerBackup(
      await dependencias('inclusao', '2026-10-07T05:00:00Z', { ferramentas: comInclusao }),
    );

    const { rows } = await app.query<{ n: number }>(
      'select count(*)::int as n from operacao.testes_de_restauracao',
    );
    expect(rows[0]?.n).toBe(3);
    expect(feito.manifesto.linhas['operacao.testes_de_restauracao']).toBe(2);
    const pronta = join(raiz, 'inclusao', 'destino um', 'grafite-producao', '2026-10-07T0500Z');
    expect(
      await linhasNoDump(join(pronta, 'banco.dump'), 'operacao', 'testes_de_restauracao'),
    ).toBe(2);
    // A última migration do diário, qualquer que seja: cada change pode trazer uma nova.
    const diario = await lerDiarioDasMigracoes();
    expect(feito.manifesto.migracoes.at(-1)).toBe(diario.at(-1)?.etiqueta);
    expect(feito.manifesto).toMatchObject({
      versao: '0.4.0-teste',
      criadoEm: '2026-10-07T05:00:00.000Z',
    });
  });

  it('a pasta pronta tem só o dump, o zip e o manifesto, sem nenhuma configuração', async () => {
    const feito = await fazerBackup(await dependencias('pronta', '2026-10-07T05:10:00Z'));
    const destino = join(raiz, 'pronta', 'destino um', 'grafite-producao');
    expect(await readdir(destino)).toEqual(['2026-10-07T0510Z']);
    const pronta = join(destino, '2026-10-07T0510Z');
    expect((await readdir(pronta)).sort()).toEqual([
      'arquivos.zip',
      'banco.dump',
      'manifesto.json',
    ]);

    const manifesto = await lerManifesto(pronta);
    expect(manifesto).toEqual(feito.manifesto);
    await expect(conferirPartes(pronta, manifesto)).resolves.toEqual([]);
    await expect(conferirZip(join(pronta, 'arquivos.zip'))).resolves.toEqual({ arquivos: 1 });
    const texto = await readFile(join(pronta, 'manifesto.json'), 'utf8');
    expect(texto).not.toContain(SENHA_DO_BACKUP());
    expect(texto).not.toContain('postgres://');
    expect(feito).toMatchObject({
      pasta: '2026-10-07T0510Z',
      tamanho:
        manifesto.partes['banco.dump'].tamanho +
        manifesto.partes['arquivos.zip'].tamanho +
        Buffer.byteLength(texto),
    });
  });

  it('um erro do pg_dump deixa a .parcial e devolve o erro', async () => {
    const comErro: FerramentasDoPostgres = {
      executar: async (ferramenta, argumentos, opcoes) =>
        ferramenta === 'pg_dump'
          ? { codigo: 1, saida: '', erro: 'pg_dump: error: falha simulada\n' }
          : ferramentas.executar(ferramenta, argumentos, opcoes),
    };
    const dep = await dependencias('erro', '2026-10-07T05:20:00Z', {
      ferramentas: comErro,
      destinos: [join(raiz, 'erro', 'destino um'), join(raiz, 'erro', 'destino dois')],
    });
    const falha = await fazerBackup(dep).catch((erro: unknown) => erro);
    expect(falha).toBeInstanceOf(FalhaNoBackup);
    expect((falha as FalhaNoBackup).message).toBe(
      'O pg_dump falhou: pg_dump: error: falha simulada',
    );
    expect((falha as FalhaNoBackup).destinos).toEqual([
      {
        destino: dep.destinos[0],
        situacao: 'falhou',
        erro: 'O pg_dump falhou: pg_dump: error: falha simulada',
      },
    ]);
    expect(await readdir(join(raiz, 'erro', 'destino um', 'grafite-producao'))).toEqual([
      '2026-10-07T0520Z.parcial',
    ]);
  });

  it('dois destinos com espaço e acento recebem o backup, e a .parcial de ontem some', async () => {
    const destinos = [
      join(raiz, 'dois', 'Backups Grafite', 'Produção'),
      join(raiz, 'dois', 'Cópia de segurança'),
    ];
    const dep = await dependencias('dois', '2026-10-07T05:30:00Z', { destinos });
    await mkdir(join(destinos[1] ?? '', 'grafite-producao', '2026-10-06T0530Z.parcial'), {
      recursive: true,
    });

    const feito = await fazerBackup(dep);

    expect(feito.destinos).toEqual([
      { destino: destinos[0], situacao: 'gravado' },
      { destino: destinos[1], situacao: 'gravado' },
    ]);
    for (const destino of destinos) {
      const pastaDosBackups = join(destino, 'grafite-producao');
      expect(await readdir(pastaDosBackups)).toEqual(['2026-10-07T0530Z']);
      await expect(
        conferirPartes(join(pastaDosBackups, '2026-10-07T0530Z'), feito.manifesto),
      ).resolves.toEqual([]);
    }
  });

  it('o segundo backup do mesmo minuto ganha o -2 nos dois destinos e fica como o mais novo', async () => {
    const destinos = [join(raiz, 'minuto', 'primeiro'), join(raiz, 'minuto', 'segundo')];
    const dep = await dependencias('minuto', '2026-10-14T06:05:05Z', { destinos });

    const primeiro = await fazerBackup(dep);
    const segundo = await fazerBackup({ ...dep, agora: () => new Date('2026-10-14T06:05:40Z') });

    expect(primeiro.pasta).toBe('2026-10-14T0605Z');
    expect(segundo.pasta).toBe('2026-10-14T0605Z-2');
    expect(segundo.destinos.map(({ situacao }) => situacao)).toEqual(['gravado', 'gravado']);
    expect(segundo.removidos).toEqual(['2026-10-14T0605Z']);
    for (const destino of destinos) {
      const pastaDosBackups = join(destino, 'grafite-producao');
      expect(await readdir(pastaDosBackups)).toEqual(['2026-10-14T0605Z-2']);
      await expect(
        conferirPartes(join(pastaDosBackups, '2026-10-14T0605Z-2'), segundo.manifesto),
      ).resolves.toEqual([]);
    }
  });

  it('o segundo destino sem espaço faz o backup falhar, sem a retenção', async () => {
    const destinos = [join(raiz, 'cheio', 'primeiro'), join(raiz, 'cheio', 'segundo')];
    const dep = await dependencias('cheio', '2026-10-07T05:40:00Z', {
      destinos,
      retencao: { diarios: 0, semanais: 0, mensais: 0 },
      copiarArquivo: async () => {
        throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
      },
    });
    await mkdir(join(destinos[0] ?? '', 'grafite-producao', '2026-10-06T0540Z'), {
      recursive: true,
    });

    const falha = await fazerBackup(dep).catch((erro: unknown) => erro);

    expect(falha).toBeInstanceOf(FalhaNoBackup);
    expect((falha as FalhaNoBackup).message).toBe(
      `O backup não chegou a todos os destinos. ${destinos[1]}: O disco ficou sem espaço.`,
    );
    expect((falha as FalhaNoBackup).destinos).toEqual([
      { destino: destinos[0], situacao: 'gravado' },
      { destino: destinos[1], situacao: 'falhou', erro: 'O disco ficou sem espaço.' },
    ]);
    expect((await readdir(join(destinos[0] ?? '', 'grafite-producao'))).sort()).toEqual([
      '2026-10-06T0540Z',
      '2026-10-07T0540Z',
    ]);
  });
});

describe('a marca dos destinos, no Linux (change servidor-linux-com-docker)', () => {
  it('Backup no compartilhamento: o destino marcado recebe o banco, os arquivos e o manifesto', async () => {
    const nas = join(raiz, 'linux', 'mnt', 'nas');
    await mkdir(nas, { recursive: true });
    await writeFile(join(nas, MARCA_DO_DESTINO), 'marca');
    const dep = await dependencias('linux', '2026-10-07T05:50:00Z', {
      destinos: [nas],
      exigirMarca: true,
    });

    const feito = await fazerBackup(dep);

    expect(feito.destinos).toEqual([{ destino: nas, situacao: 'gravado' }]);
    const pronta = join(nas, 'grafite-producao', '2026-10-07T0550Z');
    expect((await readdir(pronta)).sort()).toEqual([
      'arquivos.zip',
      'banco.dump',
      'manifesto.json',
    ]);
    await expect(conferirPartes(pronta, feito.manifesto)).resolves.toEqual([]);
  });

  it('Compartilhamento desmontado: o primeiro destino sem a marca falha antes do dump, sem gravar nada', async () => {
    const montagem = join(raiz, 'desmontado', 'mnt', 'nas');
    await mkdir(montagem, { recursive: true });
    const dep = await dependencias('desmontado', '2026-10-07T06:00:00Z', {
      destinos: [montagem],
      exigirMarca: true,
    });

    const falha = await fazerBackup(dep).catch((erro: unknown) => erro);

    expect(falha).toBeInstanceOf(FalhaNoBackup);
    const motivo = `O destino ${montagem} não tem a marca do Grafite (.grafite-destino): ele pode ser um compartilhamento que não está montado, e o backup não grava no disco do servidor no lugar dele.`;
    expect((falha as FalhaNoBackup).message).toBe(motivo);
    expect((falha as FalhaNoBackup).destinos).toEqual([
      { destino: montagem, situacao: 'falhou', erro: motivo },
    ]);
    expect(await readdir(montagem)).toEqual([]);
  });
});
