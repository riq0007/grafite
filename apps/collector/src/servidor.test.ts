import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const servidor = join(dirname(fileURLToPath(import.meta.url)), 'servidor.ts');

it('sem configuração, o coletor encerra com código 1 e nomeia as variáveis', () => {
  const ambienteMinimo = { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' };
  const r = spawnSync(process.execPath, [servidor], { env: ambienteMinimo, encoding: 'utf8' });
  expect(r.status).toBe(1);
  expect(r.stderr).toContain('GRAFITE_COLETOR_API_URL');
  expect(r.stderr).toContain('GRAFITE_COLETOR_TOKEN');
});
