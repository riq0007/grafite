// O armazenamento em disco (spec arquivos-e-imagens; design do F2c, decisão 6): o conteúdo de cada
// chave, gravado inteiro ou nada, com cada organização na própria pasta.
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArmazenamentoEmDisco, chaveDoArquivo } from './armazenamento.ts';

// O writeFile de verdade, que o teste da falha troca por um que grava só o começo e falha.
vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  return { ...real, writeFile: vi.fn(real.writeFile) };
});

const ORG_A = '0199a6e0-0000-7000-8000-00000000000a';
const ORG_B = '0199a6e0-0000-7000-8000-00000000000b';
const ARQUIVO = '0199a6e0-0000-7000-8000-000000000f01';

let pasta = '';
let armazenamento: ArmazenamentoEmDisco;

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'grafite-armazenamento-'));
  armazenamento = new ArmazenamentoEmDisco(pasta);
});

afterEach(() => {
  rmSync(pasta, { recursive: true, force: true });
});

/** Os arquivos gravados na pasta, pelo caminho a partir dela. */
const gravados = () =>
  readdirSync(pasta, { recursive: true, withFileTypes: true })
    .filter((entrada) => entrada.isFile())
    .map((entrada) => relative(pasta, join(entrada.parentPath, entrada.name)));

describe('ArmazenamentoEmDisco', () => {
  it('grava, abre e apaga pela chave', async () => {
    const chave = chaveDoArquivo(ORG_A, ARQUIVO, '512');
    await armazenamento.gravar(chave, Buffer.from('miniatura'));
    expect(await armazenamento.abrir(chave)).toEqual(Buffer.from('miniatura'));
    expect(gravados()).toEqual([join(ORG_A, ARQUIVO, '512')]);
    await armazenamento.apagar(chave);
    expect(await armazenamento.abrir(chave)).toBeNull();
    expect(gravados()).toEqual([]);
  });

  it('a gravação que falha no meio não deixa nada na chave nem o arquivo temporário', async () => {
    const real = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(writeFile).mockImplementationOnce(async (caminho, conteudo) => {
      await real.writeFile(caminho, (conteudo as Buffer).subarray(0, 4));
      throw Object.assign(new Error('Sem espaço no disco.'), { code: 'ENOSPC' });
    });
    const chave = chaveDoArquivo(ORG_A, ARQUIVO, 'completa');
    await expect(armazenamento.gravar(chave, Buffer.from('imagem inteira'))).rejects.toThrow(
      'Sem espaço no disco.',
    );
    expect(await armazenamento.abrir(chave)).toBeNull();
    expect(gravados()).toEqual([]);
  });

  it('apagar o que não existe não é erro', async () => {
    await expect(
      armazenamento.apagar(chaveDoArquivo(ORG_A, ARQUIVO, '64')),
    ).resolves.toBeUndefined();
  });

  it('apagar a última variante tira a pasta do arquivo, e com outras a pasta fica', async () => {
    await armazenamento.gravar(chaveDoArquivo(ORG_A, ARQUIVO, '64'), Buffer.from('64'));
    await armazenamento.gravar(chaveDoArquivo(ORG_A, ARQUIVO, '128'), Buffer.from('128'));
    await armazenamento.apagar(chaveDoArquivo(ORG_A, ARQUIVO, '64'));
    expect(gravados()).toEqual([join(ORG_A, ARQUIVO, '128')]);
    await armazenamento.apagar(chaveDoArquivo(ORG_A, ARQUIVO, '128'));
    expect(existsSync(join(pasta, ORG_A, ARQUIVO))).toBe(false);
  });

  it('cada organização fica na própria pasta', async () => {
    await armazenamento.gravar(chaveDoArquivo(ORG_A, ARQUIVO, '64'), Buffer.from('da A'));
    expect(await armazenamento.abrir(chaveDoArquivo(ORG_B, ARQUIVO, '64'))).toBeNull();
    await armazenamento.gravar(chaveDoArquivo(ORG_B, ARQUIVO, '64'), Buffer.from('da B'));
    expect(gravados().sort()).toEqual([join(ORG_A, ARQUIVO, '64'), join(ORG_B, ARQUIVO, '64')]);
    expect(await armazenamento.abrir(chaveDoArquivo(ORG_A, ARQUIVO, '64'))).toEqual(
      Buffer.from('da A'),
    );
  });

  it.each([
    '../fora',
    `${ORG_A}/../../fora/64`,
    `${ORG_A}/${ARQUIVO}/32`,
    `${ORG_A}/${ARQUIVO}`,
    `${ORG_A.toUpperCase()}/${ARQUIVO}/64`,
  ])('recusa a chave fora do formato, sem tocar no disco: %s', async (chave) => {
    await expect(armazenamento.gravar(chave, Buffer.from('x'))).rejects.toThrow(
      'Chave de arquivo inválida',
    );
    await expect(armazenamento.abrir(chave)).rejects.toThrow('Chave de arquivo inválida');
    await expect(armazenamento.apagar(chave)).rejects.toThrow('Chave de arquivo inválida');
    expect(gravados()).toEqual([]);
  });
});
