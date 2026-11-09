import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const servidor = join(dirname(fileURLToPath(import.meta.url)), 'servidor.ts');
const ambienteMinimo = {
  PATH: process.env.PATH ?? '',
  SystemRoot: process.env.SystemRoot ?? '',
  GRAFITE_AMBIENTE: 'desenvolvimento',
};
const CHAVE_DOIS_PASSOS = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=';
const CHAVE_DO_COFRE = 'CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk=';

// Cada teste sobe um processo novo, que carrega a API inteira antes de conferir a configuração: com
// a suíte inteira rodando junto, isso passa dos 5 s do Vitest, e no executor próprio carregado, o
// primeiro passou dos 15 s (CI do PR #30). O limite do processo, o mesmo do comando da operação, o
// encerra se ele chegar a subir, e o do teste fica acima dele (change testes-sob-carga).
const LIMITE_DO_PROCESSO = 60_000;
const LIMITE_DO_TESTE = LIMITE_DO_PROCESSO + 5_000;

it(
  'sem o ambiente, o processo encerra com código 1 e nomeia a variável',
  () => {
    const { GRAFITE_AMBIENTE: _, ...semAmbiente } = ambienteMinimo;
    const r = spawnSync(process.execPath, [servidor], {
      env: {
        ...semAmbiente,
        GRAFITE_DATABASE_URL: 'postgres://grafite_app:x@localhost:1/grafite',
        GRAFITE_CHAVE_DOIS_PASSOS: CHAVE_DOIS_PASSOS,
        GRAFITE_CHAVE_DO_COFRE: CHAVE_DO_COFRE,
        GRAFITE_ARQUIVOS_PASTA: join(tmpdir(), 'grafite-servidor-sem-ambiente'),
      },
      encoding: 'utf8',
      timeout: LIMITE_DO_PROCESSO,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('GRAFITE_AMBIENTE: obrigatório');
  },
  LIMITE_DO_TESTE,
);

it(
  'sem a URL do banco, o processo encerra com código 1 e nomeia a variável',
  () => {
    const r = spawnSync(process.execPath, [servidor], {
      env: ambienteMinimo,
      encoding: 'utf8',
      timeout: LIMITE_DO_PROCESSO,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('GRAFITE_DATABASE_URL');
  },
  LIMITE_DO_TESTE,
);

it(
  'sem a chave dos dois passos, o processo encerra com código 1 e nomeia a variável',
  () => {
    const r = spawnSync(process.execPath, [servidor], {
      env: {
        ...ambienteMinimo,
        GRAFITE_DATABASE_URL: 'postgres://grafite_app:x@localhost:1/grafite',
      },
      encoding: 'utf8',
      timeout: LIMITE_DO_PROCESSO,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('GRAFITE_CHAVE_DOIS_PASSOS');
  },
  LIMITE_DO_TESTE,
);

it(
  'sem a chave do cofre, o processo encerra com código 1, nomeia a variável e não mostra chave',
  () => {
    const r = spawnSync(process.execPath, [servidor], {
      env: {
        ...ambienteMinimo,
        GRAFITE_DATABASE_URL: 'postgres://grafite_app:x@localhost:1/grafite',
        GRAFITE_CHAVE_DOIS_PASSOS: CHAVE_DOIS_PASSOS,
        GRAFITE_ARQUIVOS_PASTA: join(tmpdir(), 'grafite-servidor-sem-cofre'),
      },
      encoding: 'utf8',
      timeout: LIMITE_DO_PROCESSO,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('GRAFITE_CHAVE_DO_COFRE: obrigatória');
    expect(r.stderr).not.toContain(CHAVE_DOIS_PASSOS);
  },
  LIMITE_DO_TESTE,
);

it(
  'sem a pasta dos arquivos, o processo encerra com código 1 e nomeia a variável',
  () => {
    const r = spawnSync(process.execPath, [servidor], {
      env: {
        ...ambienteMinimo,
        GRAFITE_DATABASE_URL: 'postgres://grafite_app:x@localhost:1/grafite',
        GRAFITE_CHAVE_DOIS_PASSOS: CHAVE_DOIS_PASSOS,
        GRAFITE_CHAVE_DO_COFRE: CHAVE_DO_COFRE,
      },
      encoding: 'utf8',
      timeout: LIMITE_DO_PROCESSO,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('GRAFITE_ARQUIVOS_PASTA: obrigatória');
  },
  LIMITE_DO_TESTE,
);

it(
  'com a pasta dos arquivos que não aceita gravação, o processo encerra com código 1',
  () => {
    const raiz = mkdtempSync(join(tmpdir(), 'grafite-servidor-'));
    writeFileSync(join(raiz, 'arquivo'), 'não é pasta');
    const r = spawnSync(process.execPath, [servidor], {
      env: {
        ...ambienteMinimo,
        GRAFITE_DATABASE_URL: 'postgres://grafite_app:x@localhost:1/grafite',
        GRAFITE_CHAVE_DOIS_PASSOS: CHAVE_DOIS_PASSOS,
        GRAFITE_CHAVE_DO_COFRE: CHAVE_DO_COFRE,
        GRAFITE_ARQUIVOS_PASTA: join(raiz, 'arquivo', 'arquivos'),
      },
      encoding: 'utf8',
      timeout: LIMITE_DO_PROCESSO,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/GRAFITE_ARQUIVOS_PASTA: a pasta .* não aceita gravação/);
  },
  LIMITE_DO_TESTE,
);
