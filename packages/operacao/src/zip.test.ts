import { mkdir, mkdtemp, readdir, readFile, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { conferirZip, deszipar, lerDoZip, zipar } from './zip.ts';

let raiz: string;

beforeEach(async () => {
  raiz = await mkdtemp(join(tmpdir(), 'grafite-zip-'));
});

afterEach(async () => {
  await rm(raiz, { recursive: true, force: true });
});

/** Os arquivos de uma pasta, com o caminho relativo em barras normais e o conteúdo. */
async function conteudoDa(pasta: string): Promise<Record<string, string>> {
  const nomes = (await readdir(pasta, { recursive: true, withFileTypes: true }))
    .filter((item) => item.isFile())
    .map((item) => join(item.parentPath, item.name));
  const conteudo: Record<string, string> = {};
  for (const nome of nomes.sort()) {
    conteudo[relative(pasta, nome).split('\\').join('/')] = (await readFile(nome)).toString(
      'base64',
    );
  }
  return conteudo;
}

const BINARIO = Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 37) % 256));

describe('zipar e deszipar', () => {
  it('guarda as subpastas e os nomes com acento pelos caminhos relativos, e deszipa igual', async () => {
    const origem = join(raiz, 'arquivos');
    await mkdir(join(origem, 'fotos', 'João Ação'), { recursive: true });
    await writeFile(join(origem, 'leia-me.txt'), 'olá');
    await writeFile(join(origem, 'fotos', 'João Ação', 'retrato çé.webp'), BINARIO);
    const zip = join(raiz, 'arquivos.zip');

    await expect(zipar(origem, zip)).resolves.toEqual({ arquivos: 2 });
    expect((await readFile(zip)).includes(Buffer.from(raiz))).toBe(false);
    await expect(conferirZip(zip)).resolves.toEqual({ arquivos: 2 });

    const destino = join(raiz, 'restaurados');
    await expect(deszipar(zip, destino)).resolves.toEqual({ arquivos: 2 });
    expect(await conteudoDa(destino)).toEqual(await conteudoDa(origem));
    expect(Object.keys(await conteudoDa(destino))).toEqual([
      'fotos/João Ação/retrato çé.webp',
      'leia-me.txt',
    ]);
  });

  it('a pasta vazia vira um zip sem arquivos, que deszipa numa pasta vazia', async () => {
    const origem = join(raiz, 'vazia');
    await mkdir(origem);
    const zip = join(raiz, 'vazia.zip');
    await expect(zipar(origem, zip)).resolves.toEqual({ arquivos: 0 });
    await expect(conferirZip(zip)).resolves.toEqual({ arquivos: 0 });
    const destino = join(raiz, 'restaurada');
    await expect(deszipar(zip, destino)).resolves.toEqual({ arquivos: 0 });
    expect(await readdir(destino)).toEqual([]);
  });
});

describe('conferirZip', () => {
  async function zipDeExemplo(): Promise<string> {
    const origem = join(raiz, 'arquivos');
    await mkdir(origem);
    await writeFile(join(origem, 'a.bin'), BINARIO);
    const zip = join(raiz, 'arquivos.zip');
    await zipar(origem, zip);
    return zip;
  }

  it('recusa o zip truncado', async () => {
    const zip = await zipDeExemplo();
    const { size } = await import('node:fs/promises').then((fs) => fs.stat(zip));
    await truncate(zip, Math.floor(size / 2));
    await expect(conferirZip(zip)).rejects.toThrow(`O zip ${zip} está danificado:`);
    await expect(deszipar(zip, join(raiz, 'destino'))).rejects.toThrow(
      `O zip ${zip} está danificado:`,
    );
  });

  it('recusa o zip com o conteúdo de uma entrada alterado', async () => {
    const zip = await zipDeExemplo();
    const bytes = await readFile(zip);
    // Os dados da entrada começam depois do cabeçalho local (30 bytes) e do nome ("a.bin").
    const meio = 30 + 'a.bin'.length + 10;
    bytes[meio] = (bytes[meio] ?? 0) ^ 0xff;
    await writeFile(zip, bytes);
    await expect(conferirZip(zip)).rejects.toThrow(`O zip ${zip} está danificado:`);
    await expect(lerDoZip(zip, 'a.bin')).rejects.toThrow(`O zip ${zip} está danificado:`);
  });
});

describe('lerDoZip', () => {
  it('lê um arquivo do zip pelo caminho, sem extrair os outros, e devolve null sem ele', async () => {
    const origem = join(raiz, 'pacote');
    await mkdir(join(origem, 'apps', 'operação'), { recursive: true });
    await writeFile(join(origem, 'pacote.json'), '{"versao":"0.4.0"}');
    await writeFile(join(origem, 'apps', 'operação', 'grande.bin'), BINARIO);
    const zip = join(raiz, 'pacote.zip');
    await zipar(origem, zip);

    await expect(lerDoZip(zip, 'pacote.json')).resolves.toEqual(Buffer.from('{"versao":"0.4.0"}'));
    await expect(lerDoZip(zip, 'apps/operação/grande.bin')).resolves.toEqual(BINARIO);
    await expect(lerDoZip(zip, 'falta.json')).resolves.toBeNull();
    expect(await readdir(raiz)).toEqual(['pacote', 'pacote.zip']);
  });
});
