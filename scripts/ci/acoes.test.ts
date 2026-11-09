import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { acaoPermitida, acoesDoArquivo } from './acoes.ts';

const WORKFLOW = [
  'name: CI',
  'on:',
  '  pull_request:',
  'jobs:',
  '  verificacoes:',
  '    runs-on: ubuntu-24.04',
  '    steps:',
  '      - uses: actions/checkout@v7',
  '      - name: Preparar',
  '        uses: ./.github/actions/preparar',
  '      - name: Texto que parece um uso',
  `        run: 'echo "uses: pnpm/action-setup@v4"'`,
  '      - uses: pnpm/action-setup@v4',
  '  reutilizado:',
  '    uses: outra-conta/workflows/.github/workflows/ci.yml@main',
].join('\n');

const ACAO_COMPOSTA = [
  'name: Preparar',
  'runs:',
  '  using: composite',
  '  steps:',
  '    - uses: actions/setup-node@v7',
  '    - name: Instalar',
  '      shell: bash',
  '      run: pnpm install',
].join('\n');

describe('acoesDoArquivo', () => {
  it('lê o uses de cada passo e o do job reutilizado, sem confundir o texto de um run', () => {
    expect(acoesDoArquivo('ci.yml', WORKFLOW)).toEqual([
      { arquivo: 'ci.yml', job: 'verificacoes', passo: 'passo 1', uses: 'actions/checkout@v7' },
      {
        arquivo: 'ci.yml',
        job: 'verificacoes',
        passo: 'Preparar',
        uses: './.github/actions/preparar',
      },
      { arquivo: 'ci.yml', job: 'verificacoes', passo: 'passo 4', uses: 'pnpm/action-setup@v4' },
      {
        arquivo: 'ci.yml',
        job: 'reutilizado',
        passo: '(o job inteiro)',
        uses: 'outra-conta/workflows/.github/workflows/ci.yml@main',
      },
    ]);
  });

  it('lê os passos de uma ação composta', () => {
    expect(acoesDoArquivo('preparar/action.yml', ACAO_COMPOSTA)).toEqual([
      {
        arquivo: 'preparar/action.yml',
        job: '(ação composta)',
        passo: 'passo 1',
        uses: 'actions/setup-node@v7',
      },
    ]);
  });
});

describe('acaoPermitida', () => {
  it('aceita as ações do GitHub e as do próprio repositório', () => {
    expect(acaoPermitida('actions/checkout@v7')).toBe(true);
    expect(acaoPermitida('actions/upload-artifact@v7')).toBe(true);
    expect(acaoPermitida('github/codeql-action/init@v3')).toBe(true);
    expect(acaoPermitida('./.github/actions/preparar')).toBe(true);
  });

  it('recusa a ação de outra conta, mesmo com um nome parecido ou do mesmo dono', () => {
    expect(acaoPermitida('pnpm/action-setup@v4')).toBe(false);
    expect(acaoPermitida('docker/build-push-action@v6')).toBe(false);
    expect(acaoPermitida('actions-mirror/checkout@v7')).toBe(false);
    expect(acaoPermitida('github-actions/checkout@v7')).toBe(false);
    expect(acaoPermitida('riq0007/outra-acao@v1')).toBe(false);
  });

  it('recusa a imagem de contêiner, a ação sem versão e o valor vazio', () => {
    expect(acaoPermitida('docker://alpine:3.20')).toBe(false);
    expect(acaoPermitida('actions/checkout')).toBe(false);
    expect(acaoPermitida('')).toBe(false);
  });
});

// O teste-guarda: cada workflow e cada ação local do repositório só usa as ações do GitHub e as do
// próprio repositório. Um caso por arquivo, para a falha dizer qual arquivo, qual job e qual passo.
const RAIZ = join(import.meta.dirname, '..', '..');
const PASTA_DAS_ACOES = join(RAIZ, '.github', 'actions');
const ARQUIVOS = [
  ...readdirSync(join(RAIZ, '.github', 'workflows'))
    .filter((nome) => /\.ya?ml$/.test(nome))
    .map((nome) => `.github/workflows/${nome}`),
  ...readdirSync(PASTA_DAS_ACOES).flatMap((acao) =>
    ['action.yml', 'action.yaml']
      .filter((nome) => existsSync(join(PASTA_DAS_ACOES, acao, nome)))
      .map((nome) => `.github/actions/${acao}/${nome}`),
  ),
];
const ler = (arquivo: string) => readFileSync(join(RAIZ, arquivo), 'utf8');

describe('os workflows e as ações locais do repositório', () => {
  it('existem, e cada um usa ao menos uma ação lida', () => {
    expect(ARQUIVOS).toContain('.github/workflows/ci.yml');
    expect(ARQUIVOS).toContain('.github/workflows/versao.yml');
    expect(ARQUIVOS).toContain('.github/actions/preparar/action.yml');
    for (const arquivo of ARQUIVOS) {
      expect(acoesDoArquivo(arquivo, ler(arquivo)).length, arquivo).toBeGreaterThan(0);
    }
  });

  it.each(ARQUIVOS)('%s: só as ações do GitHub e as do próprio repositório', (arquivo) => {
    const fora = acoesDoArquivo(arquivo, ler(arquivo))
      .filter(({ uses }) => !acaoPermitida(uses))
      .map(({ job, passo, uses }) => `${job} › ${passo}: ${uses}`);
    expect(fora).toEqual([]);
  });
});
