import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ErroDeConfiguracao } from '../config.ts';
import { prepararPastaDosArquivos } from './pasta.ts';

let raiz = '';

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'grafite-pasta-'));
});

afterEach(() => {
  chmodSync(raiz, 0o700);
  rmSync(raiz, { recursive: true, force: true });
});

describe('prepararPastaDosArquivos', () => {
  it('cria a pasta que falta e não deixa o arquivo de prova', async () => {
    const pasta = join(raiz, 'dados', 'arquivos');
    await prepararPastaDosArquivos(pasta);
    expect(existsSync(pasta)).toBe(true);
    expect(readdirSync(pasta)).toEqual([]);
  });

  it('aceita a pasta que já existe, com o que ela já tem', async () => {
    writeFileSync(join(raiz, 'foto.webp'), 'conteúdo');
    await prepararPastaDosArquivos(raiz);
    expect(readdirSync(raiz)).toEqual(['foto.webp']);
  });

  it('recusa a pasta que não pode existir, nomeando a variável', async () => {
    writeFileSync(join(raiz, 'arquivo'), 'não é pasta');
    const pasta = join(raiz, 'arquivo', 'arquivos');
    const erro = await prepararPastaDosArquivos(pasta).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDeConfiguracao);
    expect((erro as ErroDeConfiguracao).variaveis).toEqual(['GRAFITE_ARQUIVOS_PASTA']);
    expect((erro as Error).message).toContain(
      `GRAFITE_ARQUIVOS_PASTA: a pasta ${pasta} não aceita gravação`,
    );
  });

  // O root grava em qualquer pasta, e no Windows o chmod não tira a gravação de uma pasta: nos dois,
  // não há como montar o caso. O CI, no Linux, o roda.
  const semComoTirarAGravacao = process.getuid?.() === 0 || process.platform === 'win32';
  it.skipIf(semComoTirarAGravacao)('recusa a pasta sem permissão de gravação', async () => {
    chmodSync(raiz, 0o500);
    await expect(prepararPastaDosArquivos(raiz)).rejects.toThrow(
      /GRAFITE_ARQUIVOS_PASTA: a pasta .* não aceita gravação/,
    );
  });
});
