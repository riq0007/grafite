// A restauração e o teste de restauração (spec backup; design do F2d, decisões 13 e 16), com o
// PostgreSQL de verdade. O mesmo contêiner faz as vezes da produção (o banco `grafite`) e da
// instância do teste, onde o banco descartável `grafite_restauracao` é criado e apagado.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type BancoDeTeste, encerrarPool, iniciarBancoDeTeste } from '@grafite/db/teste';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fazerBackup } from './backup.ts';
import { type FerramentasDoPostgres, ferramentasNoConteiner } from './postgres.ts';
import {
  conferirDump,
  contarLinhas,
  type DependenciasDoTesteDeRestauracao,
  testarRestauracao,
} from './restauracao.ts';

let raiz: string;
let banco: BancoDeTeste;
let ferramentas: FerramentasDoPostgres;
let superusuario: pg.Pool;

beforeAll(async () => {
  raiz = await mkdtemp(join(tmpdir(), 'grafite-restauracao-'));
  banco = await iniciarBancoDeTeste({ pastaCompartilhada: raiz });
  ferramentas = ferramentasNoConteiner(banco.executarNoConteiner, {
    pasta: { noHost: raiz, noConteiner: '/compartilhada' },
    endereco: { doHost: banco.enderecoDoHost, doConteiner: '127.0.0.1:5432' },
  });
  superusuario = new pg.Pool({ connectionString: banco.urlSuperusuario });
});

afterAll(async () => {
  await encerrarPool(superusuario);
  await banco?.parar();
  await rm(raiz, { recursive: true, force: true }).catch(() => {});
});

/** Um backup feito de verdade num destino próprio do caso; devolve o destino e a pasta pronta. */
async function backupDoCaso(caso: string, momento: string) {
  const pastaDosArquivos = join(raiz, caso, 'arquivos');
  await mkdir(join(pastaDosArquivos, 'fotos'), { recursive: true });
  await writeFile(join(pastaDosArquivos, 'fotos', 'retrato.webp'), 'foto');
  const destino = join(raiz, caso, 'Backups Grafite');
  const feito = await fazerBackup({
    urlBackup: banco.urlBackup,
    ferramentas,
    pastaDosArquivos,
    destinos: [destino],
    retencao: { diarios: 7, semanais: 4, mensais: 12 },
    fuso: 'America/Sao_Paulo',
    versao: '0.4.0-teste',
    agora: () => new Date(momento),
  });
  return { destino, pronta: join(destino, 'grafite-producao', feito.pasta), feito };
}

const dependencias = (
  destino: string,
  extra: Partial<DependenciasDoTesteDeRestauracao> = {},
): DependenciasDoTesteDeRestauracao => ({
  ferramentas,
  urlRestauracao: banco.urlSuperusuario,
  destinos: [destino],
  espacoLivre: async () => Number.MAX_SAFE_INTEGER,
  ...extra,
});

async function bancoDescartavelExiste(): Promise<boolean> {
  const { rows } = await superusuario.query(
    "select 1 from pg_database where datname = 'grafite_restauracao'",
  );
  return rows.length > 0;
}

describe('testarRestauracao', () => {
  it('restaura o backup bom num banco descartável, confere tudo e apaga o banco', async () => {
    const { destino, feito } = await backupDoCaso('bom', '2026-10-07T05:00:00Z');

    const resultado = await testarRestauracao(dependencias(destino));

    const tabelas = Object.keys(feito.manifesto.linhas).length;
    const linhas = Object.values(feito.manifesto.linhas).reduce((soma, n) => soma + n, 0);
    expect(resultado).toEqual({
      backup: '2026-10-07T0500Z',
      detalhes: { tabelas, linhas, arquivos: 1 },
    });
    expect(tabelas).toBeGreaterThan(10);
    expect(await bancoDescartavelExiste()).toBe(false);
  });

  it('testa o backup mais novo do primeiro destino', async () => {
    const { destino } = await backupDoCaso('novo', '2026-10-06T05:00:00Z');
    await mkdir(join(raiz, 'novo', 'arquivos'), { recursive: true });
    await fazerBackup({
      urlBackup: banco.urlBackup,
      ferramentas,
      pastaDosArquivos: join(raiz, 'novo', 'arquivos'),
      destinos: [destino],
      retencao: { diarios: 7, semanais: 4, mensais: 12 },
      fuso: 'America/Sao_Paulo',
      versao: '0.4.0-teste',
      agora: () => new Date('2026-10-07T05:00:00Z'),
    });
    const resultado = await testarRestauracao(dependencias(destino));
    expect(resultado.backup).toBe('2026-10-07T0500Z');
  });

  it('o dump alterado falha no hash, antes de criar o banco', async () => {
    const { destino, pronta } = await backupDoCaso('alterado', '2026-10-07T05:00:00Z');
    const dump = await readFile(join(pronta, 'banco.dump'));
    dump[dump.length - 10] = (dump[dump.length - 10] ?? 0) ^ 0xff;
    // O pg_dump do contêiner grava o dump como root: no Linux, o teste não o reescreve no lugar,
    // mas troca o arquivo, na pasta que é dele.
    await rm(join(pronta, 'banco.dump'));
    await writeFile(join(pronta, 'banco.dump'), dump);

    await expect(testarRestauracao(dependencias(destino))).rejects.toThrow(
      'O backup 2026-10-07T0500Z não passou na conferência: A parte banco.dump não confere com o hash do manifesto.',
    );
    expect(await bancoDescartavelExiste()).toBe(false);
  });

  it('as linhas que não batem com o manifesto falham, e o banco descartável é apagado', async () => {
    const { destino, pronta } = await backupDoCaso('linhas', '2026-10-07T05:00:00Z');
    const manifesto = JSON.parse(await readFile(join(pronta, 'manifesto.json'), 'utf8'));
    manifesto.linhas['operacao.agenda'] = 5;
    await writeFile(join(pronta, 'manifesto.json'), JSON.stringify(manifesto));

    await expect(testarRestauracao(dependencias(destino))).rejects.toThrow(
      'As linhas restauradas não batem com o manifesto: operacao.agenda tem 1, e o manifesto diz 5.',
    );
    expect(await bancoDescartavelExiste()).toBe(false);
  });

  it('sem espaço livre para restaurar, falha com o motivo e não cria o banco', async () => {
    const { destino } = await backupDoCaso('espaco', '2026-10-07T05:00:00Z');
    await expect(
      testarRestauracao(dependencias(destino, { espacoLivre: async () => 1024 })),
    ).rejects.toThrow(
      /^Falta espaço para o teste de restauração: são precisos .+ livres, e há 1 KB\.$/,
    );
    expect(await bancoDescartavelExiste()).toBe(false);
  });

  it('sem nenhum backup pronto, falha com o motivo', async () => {
    const destino = join(raiz, 'vazio', 'Backups Grafite');
    await mkdir(join(destino, 'grafite-producao', '2026-10-07T0500Z.parcial'), { recursive: true });
    await expect(testarRestauracao(dependencias(destino))).rejects.toThrow(
      'Nenhum backup pronto para testar.',
    );
  });
});

describe('conferirDump e contarLinhas', () => {
  it('o pg_restore lê o dump bom e recusa o truncado', async () => {
    const { pronta } = await backupDoCaso('dump', '2026-10-07T05:00:00Z');
    await expect(conferirDump(ferramentas, join(pronta, 'banco.dump'))).resolves.toBeUndefined();
    const truncado = join(raiz, 'dump', 'truncado.dump');
    await writeFile(truncado, (await readFile(join(pronta, 'banco.dump'))).subarray(0, 200));
    await expect(conferirDump(ferramentas, truncado)).rejects.toThrow(
      `O pg_restore não conseguiu ler ${truncado}:`,
    );
  });

  it('conta as linhas de cada tabela da aplicação', async () => {
    const linhas = await contarLinhas(banco.urlSuperusuario);
    expect(linhas['operacao.agenda']).toBe(1);
    expect(Object.keys(linhas)).toContain('drizzle.__drizzle_migrations');
  });
});
