import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { executoresDoWorkflow, executorPermitido } from './executores.ts';

const WORKFLOW = [
  'name: CI',
  'on:',
  '  pull_request:',
  'jobs:',
  '  verificacoes:',
  '    name: Lint',
  '    runs-on: ubuntu-24.04',
  '    steps:',
  '      - run: pnpm lint',
  '  pacote:',
  '    runs-on: [self-hosted, preparado]',
  '    steps:',
  '      - run: echo "runs-on: falso, dentro de um passo"',
  '  em-linhas:',
  '    runs-on:',
  '      - self-hosted',
].join('\n');

describe('executoresDoWorkflow', () => {
  it('lê o runs-on de cada job, sem confundir o texto de um passo', () => {
    expect(executoresDoWorkflow('ci.yml', WORKFLOW)).toEqual([
      { arquivo: 'ci.yml', job: 'verificacoes', executor: 'ubuntu-24.04' },
      { arquivo: 'ci.yml', job: 'pacote', executor: '[self-hosted, preparado]' },
      { arquivo: 'ci.yml', job: 'em-linhas', executor: '' },
    ]);
  });
});

describe('executorPermitido', () => {
  it('aceita as imagens fixadas do GitHub', () => {
    expect(executorPermitido('ubuntu-24.04')).toBe(true);
    expect(executorPermitido('windows-2022')).toBe(true);
  });

  it('aceita a imagem entre aspas ou numa lista de um rótulo só', () => {
    expect(executorPermitido("'ubuntu-24.04'")).toBe(true);
    expect(executorPermitido('"windows-2022"')).toBe(true);
    expect(executorPermitido('[ubuntu-24.04]')).toBe(true);
    expect(executorPermitido("[ 'windows-2022' ]")).toBe(true);
    expect(executorPermitido('[ubuntu-24.04, windows-2022]')).toBe(false);
  });

  it('recusa o executor próprio, em qualquer forma', () => {
    expect(executorPermitido('self-hosted')).toBe(false);
    expect(executorPermitido('[self-hosted, preparado]')).toBe(false);
    expect(executorPermitido('[self-hosted, preparado, docker]')).toBe(false);
  });

  it('recusa a imagem que muda sozinha, a expressão e o valor que vem nas linhas seguintes', () => {
    expect(executorPermitido('ubuntu-latest')).toBe(false);
    expect(executorPermitido('windows-latest')).toBe(false);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a expressão do Actions, como o workflow a escreve.
    expect(executorPermitido('${{ matrix.os }}')).toBe(false);
    expect(executorPermitido('')).toBe(false);
  });
});

// O teste-guarda: cada job de cada workflow do repositório roda numa imagem fixada do GitHub. Um
// caso por workflow, para a falha dizer qual arquivo e quais jobs.
const PASTA_DOS_WORKFLOWS = join(import.meta.dirname, '..', '..', '.github', 'workflows');
const WORKFLOWS = readdirSync(PASTA_DOS_WORKFLOWS).filter((nome) => /\.ya?ml$/.test(nome));

describe('os workflows do repositório', () => {
  it('existem, e cada um tem jobs com o runs-on lido', () => {
    expect(WORKFLOWS).toContain('ci.yml');
    expect(WORKFLOWS).toContain('versao.yml');
    for (const nome of WORKFLOWS) {
      const texto = readFileSync(join(PASTA_DOS_WORKFLOWS, nome), 'utf8');
      expect(executoresDoWorkflow(nome, texto).length, nome).toBeGreaterThan(0);
    }
  });

  it.each(WORKFLOWS)(
    '%s: nenhum job roda num executor próprio nem numa imagem fora das fixadas',
    (nome) => {
      const texto = readFileSync(join(PASTA_DOS_WORKFLOWS, nome), 'utf8');
      const fora = executoresDoWorkflow(nome, texto)
        .filter(({ executor }) => !executorPermitido(executor))
        .map(({ job, executor }) => `${job}: ${executor || '(nas linhas seguintes)'}`);
      expect(fora).toEqual([]);
    },
  );
});
