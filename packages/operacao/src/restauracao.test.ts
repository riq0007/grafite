// O espaço livre antes do teste de restauração (spec backup; change servidor-linux-com-docker,
// design, decisão 11): pela pasta de dados da instância do teste vista daqui, quando ela é dada,
// como no Linux, onde a pasta que o PostgreSQL diz só existe dentro do contêiner do banco.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Manifesto, sha256DoArquivo } from './manifesto.ts';
import { testarRestauracao } from './restauracao.ts';

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-restauracao-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

/** Um backup pronto, que passa na conferência das partes. */
async function backupPronto(destino: string, nome: string) {
  const pronta = join(destino, 'grafite-producao', nome);
  await mkdir(pronta, { recursive: true });
  const partes = {} as Manifesto['partes'];
  for (const parte of ['banco.dump', 'arquivos.zip'] as const) {
    await writeFile(join(pronta, parte), parte);
    partes[parte] = {
      tamanho: Buffer.byteLength(parte),
      sha256: await sha256DoArquivo(join(pronta, parte)),
    };
  }
  const manifesto: Manifesto = {
    versao: '1.4.0',
    migracoes: [],
    criadoEm: '2026-10-23T05:00:00.000Z',
    linhas: {},
    partes,
  };
  await writeFile(join(pronta, 'manifesto.json'), JSON.stringify(manifesto));
}

describe('o espaço livre do teste de restauração', () => {
  it('com a pasta da instância dada, mede o disco dela, sem perguntar ao banco', async () => {
    const destino = join(pasta, 'destino');
    await backupPronto(destino, '2026-10-23T0500Z');
    // A pasta que não existe falha no statfs dela: o banco, que também não existe, nem é procurado.
    const pastaDoBanco = join(pasta, 'teste', 'banco');

    const teste = testarRestauracao({
      ferramentas: {
        executar: async () => {
          throw new Error('nenhuma ferramenta antes do espaço livre');
        },
      },
      urlRestauracao: 'postgres://postgres:x@127.0.0.1:1/postgres',
      destinos: [destino],
      pastaDaInstancia: pastaDoBanco,
    });

    await expect(teste).rejects.toThrow(`statfs '${pastaDoBanco}'`);
  });
});
