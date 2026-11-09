import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { conferirPartes, lerManifesto, type Manifesto, sha256DoArquivo } from './manifesto.ts';

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-manifesto-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

/** Uma pasta de backup com as duas partes e o manifesto que bate com elas. */
async function backupDeExemplo(): Promise<Manifesto> {
  await writeFile(join(pasta, 'banco.dump'), 'conteúdo do dump');
  await writeFile(join(pasta, 'arquivos.zip'), 'conteúdo do zip');
  const manifesto: Manifesto = {
    versao: '0.4.0',
    migracoes: ['0000_fundacao', '0017_papel_do_backup'],
    criadoEm: '2026-10-07T05:00:00.000Z',
    linhas: { 'public.pessoas': 3, 'operacao.agenda': 1 },
    partes: {
      'banco.dump': {
        tamanho: Buffer.byteLength('conteúdo do dump'),
        sha256: await sha256DoArquivo(join(pasta, 'banco.dump')),
      },
      'arquivos.zip': {
        tamanho: Buffer.byteLength('conteúdo do zip'),
        sha256: await sha256DoArquivo(join(pasta, 'arquivos.zip')),
      },
    },
  };
  await writeFile(join(pasta, 'manifesto.json'), JSON.stringify(manifesto, null, 2));
  return manifesto;
}

describe('sha256DoArquivo', () => {
  it('é o SHA-256 do conteúdo, em hexadecimal', async () => {
    await writeFile(join(pasta, 'abc.txt'), 'abc');
    await expect(sha256DoArquivo(join(pasta, 'abc.txt'))).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('conferirPartes', () => {
  it('não aponta nada quando as partes batem com o manifesto', async () => {
    const manifesto = await backupDeExemplo();
    await expect(conferirPartes(pasta, manifesto)).resolves.toEqual([]);
  });

  it('aponta a parte alterada com o mesmo tamanho', async () => {
    const manifesto = await backupDeExemplo();
    await writeFile(join(pasta, 'banco.dump'), 'conteúdo do dumq');
    await expect(conferirPartes(pasta, manifesto)).resolves.toEqual([
      'A parte banco.dump não confere com o hash do manifesto.',
    ]);
  });

  it('aponta a parte com outro tamanho', async () => {
    const manifesto = await backupDeExemplo();
    await writeFile(join(pasta, 'arquivos.zip'), 'zip');
    await expect(conferirPartes(pasta, manifesto)).resolves.toEqual([
      `A parte arquivos.zip tem 3 bytes, e o manifesto diz ${Buffer.byteLength('conteúdo do zip')}.`,
    ]);
  });

  it('aponta a parte ausente', async () => {
    const manifesto = await backupDeExemplo();
    await rm(join(pasta, 'banco.dump'));
    await expect(conferirPartes(pasta, manifesto)).resolves.toEqual(['Falta a parte banco.dump.']);
  });
});

describe('lerManifesto', () => {
  it('lê o manifesto da pasta do backup', async () => {
    const manifesto = await backupDeExemplo();
    await expect(lerManifesto(pasta)).resolves.toEqual(manifesto);
  });

  it('recusa a pasta sem manifesto', async () => {
    await expect(lerManifesto(pasta)).rejects.toThrow(`Falta o manifesto.json em ${pasta}.`);
  });

  it.each([
    ['um JSON quebrado', '{ "versao": '],
    [
      'sem as partes',
      JSON.stringify({ versao: '0.4.0', migracoes: [], criadoEm: 'x', linhas: {} }),
    ],
    [
      'com uma contagem negativa',
      JSON.stringify({
        versao: '0.4.0',
        migracoes: [],
        criadoEm: '2026-10-07T05:00:00.000Z',
        linhas: { 'public.pessoas': -1 },
        partes: {
          'banco.dump': { tamanho: 1, sha256: 'a'.repeat(64) },
          'arquivos.zip': { tamanho: 1, sha256: 'b'.repeat(64) },
        },
      }),
    ],
  ])('recusa o manifesto %s', async (_caso, conteudo) => {
    await writeFile(join(pasta, 'manifesto.json'), conteudo);
    await expect(lerManifesto(pasta)).rejects.toThrow(`O manifesto de ${pasta} não é válido.`);
  });
});
