import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { gravarCaddyfilesDeExemplo } from './caddyfiles.ts';

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-caddyfiles-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

it('grava o Caddyfile de cada modo do certificado, gerado como na instalação, para o caddy validate', async () => {
  const arquivos = await gravarCaddyfilesDeExemplo(pasta);
  expect(arquivos).toEqual([join(pasta, 'interno.Caddyfile'), join(pasta, 'publico.Caddyfile')]);
  expect((await readdir(pasta)).sort()).toEqual(['interno.Caddyfile', 'publico.Caddyfile']);
  const publico = await readFile(join(pasta, 'publico.Caddyfile'), 'utf8');
  expect(publico).toContain('dns cloudflare {env.CLOUDFLARE_API_TOKEN}');
  expect(publico).toContain('grafite-teste.empresa.com.br {');
  const interno = await readFile(join(pasta, 'interno.Caddyfile'), 'utf8');
  expect(interno).toContain('tls internal');
});
