// Regressão visual (design, decisão 8): compila o Storybook e tira as capturas dentro do
// contêiner oficial do Playwright, para as referências serem idênticas no Windows e no CI.
// Uso: pnpm test:visual [--atualizar] [--sem-build]
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface OpcoesDoDocker {
  /** Pasta do pacote de UI no computador, montada em /work. */
  pasta: string;
  /** Versão do Playwright do projeto: a mesma da imagem e do pacote instalado no contêiner. */
  versao: string;
  atualizar: boolean;
}

export function argumentosDoDocker({ pasta, versao, atualizar }: OpcoesDoDocker): string[] {
  // Os node_modules do Windows não servem no Linux: o contêiner instala só o @playwright/test.
  const roteiro = [
    'set -e',
    'mkdir -p /tmp/visual',
    'cp /work/visual/playwright.config.ts /work/visual/visual.spec.ts /work/visual/servidor.mjs /tmp/visual/',
    'cd /tmp/visual',
    'npm init -y >/dev/null',
    `npm install --no-audit --no-fund --loglevel=error @playwright/test@${versao}`,
    `RAIZ_DO_PACOTE=/work npx playwright test -c playwright.config.ts${atualizar ? ' --update-snapshots' : ''}`,
  ].join(' && ');
  return [
    'run',
    '--rm',
    '--ipc=host',
    '-v',
    `${pasta}:/work`,
    '-v',
    'grafite-npm:/root/.npm',
    `mcr.microsoft.com/playwright:v${versao}-noble`,
    '/bin/bash',
    '-c',
    roteiro,
  ];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const argumentos = process.argv.slice(2);
  const { version: versao } = JSON.parse(
    readFileSync(join(raiz, 'apps/web/node_modules/@playwright/test/package.json'), 'utf8'),
  ) as { version: string };

  if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
    console.error('O Docker não está rodando. Abra o Docker Desktop e tente de novo.');
    process.exit(1);
  }
  if (!argumentos.includes('--sem-build')) {
    // O pnpm no Windows é um .cmd: precisa de shell (os argumentos aqui são simples).
    const build = spawnSync('pnpm', ['--filter', '@grafite/ui', 'build-storybook'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (build.status !== 0) process.exit(build.status ?? 1);
  }
  const capturas = spawnSync(
    'docker',
    argumentosDoDocker({
      pasta: join(raiz, 'packages', 'ui'),
      versao,
      atualizar: argumentos.includes('--atualizar'),
    }),
    { stdio: 'inherit' },
  );
  process.exit(capturas.status ?? 1);
}
