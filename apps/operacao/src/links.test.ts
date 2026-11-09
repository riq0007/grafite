import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { garantirLinksDoPacote } from './links.ts';

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-links-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

describe('garantirLinksDoPacote', () => {
  it('numa cópia desempacotada à mão, cria os links que faltam como junções, uma vez', async () => {
    await mkdir(join(pasta, 'packages', 'db', 'src'), { recursive: true });
    await writeFile(join(pasta, 'packages', 'db', 'src', 'index.ts'), 'export {};');
    await writeFile(
      join(pasta, 'pacote.json'),
      JSON.stringify({
        versao: '0.4.0',
        links: [{ caminho: 'node_modules/@grafite/db', alvo: 'packages/db' }],
      }),
    );
    await expect(garantirLinksDoPacote(pasta)).resolves.toBe(1);
    expect(
      await readFile(join(pasta, 'node_modules', '@grafite', 'db', 'src', 'index.ts'), 'utf8'),
    ).toBe('export {};');
    await expect(garantirLinksDoPacote(pasta)).resolves.toBe(0);
  });

  it('fora de um pacote, como no repositório, não faz nada', async () => {
    await expect(garantirLinksDoPacote(pasta)).resolves.toBe(0);
  });
});
