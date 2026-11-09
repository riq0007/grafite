// O comando de operação como o grafite.ps1 o chama: um processo do Node com os argumentos.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { AJUDA } from './comando.ts';

const grafite = join(dirname(fileURLToPath(import.meta.url)), 'grafite.ts');

const rodar = (...argumentos: string[]) =>
  spawnSync(process.execPath, [grafite, ...argumentos], { encoding: 'utf8', timeout: 60_000 });

it('--ajuda mostra os comandos e sai com 0', () => {
  const { status, stdout } = rodar('--ajuda');
  expect(status).toBe(0);
  expect(stdout).toBe(`${AJUDA}\n`);
});

it('um comando desconhecido sai com 2, com a ajuda no erro', () => {
  const { status, stderr } = rodar('apagar-tudo');
  expect(status).toBe(2);
  expect(stderr).toContain('Comando desconhecido: apagar-tudo.');
});
