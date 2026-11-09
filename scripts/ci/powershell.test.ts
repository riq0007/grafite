import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { acharPowerShell, errosDeSintaxe, passosEmPowerShell } from './powershell.ts';

// Um workflow de exemplo: o shell vem do passo, do defaults do job ou do defaults do workflow.
const WORKFLOW = [
  'name: Versão',
  'defaults:',
  '  run:',
  '    shell: bash',
  'jobs:',
  '  linux:',
  '    runs-on: ubuntu-24.04',
  '    steps:',
  '      - run: echo "no bash"',
  '      - name: No pwsh',
  '        shell: pwsh',
  "        run: Write-Output 'no 7'",
  '  windows:',
  '    runs-on: windows-2022',
  '    defaults:',
  '      run:',
  `        shell: 'powershell -NoLogo -NoProfile -Command ". ''{0}''"'`,
  '    steps:',
  '      - uses: actions/checkout@v7',
  '      - name: A versão',
  '        shell: bash',
  '        run: echo "$VERSAO"',
  '      - name: O choco',
  '        env:',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: a expressão do Actions, como o workflow a escreve.
  '          GH_TOKEN: ${{ github.token }}',
  '        run: |',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: a expressão do Actions, como o workflow a escreve.
  '          Write-Output "${{ inputs.versao }}"',
  "          Write-Output 'pronto'",
  '      - run: Get-Service',
].join('\n');

// Sem defaults, um passo no Windows roda no pwsh, como o Actions faz.
const SEM_PADRAO = [
  'jobs:',
  '  windows:',
  '    runs-on: windows-2022',
  '    steps:',
  '      - name: Sem shell',
  '        run: Get-Date',
].join('\n');

describe('passosEmPowerShell', () => {
  it('acha os passos em PowerShell pelo shell do passo, do job ou do workflow, com as expressões trocadas', () => {
    expect(passosEmPowerShell('versao.yml', WORKFLOW)).toEqual([
      {
        arquivo: 'versao.yml',
        job: 'linux',
        passo: 'No pwsh',
        edicao: '7',
        script: "Write-Output 'no 7'",
      },
      {
        arquivo: 'versao.yml',
        job: 'windows',
        passo: 'O choco',
        edicao: '5.1',
        script: 'Write-Output "$expressaoDoActions"\nWrite-Output \'pronto\'\n',
      },
      {
        arquivo: 'versao.yml',
        job: 'windows',
        passo: 'passo 4',
        edicao: '5.1',
        script: 'Get-Service',
      },
    ]);
  });

  it('sem defaults, o passo no Windows é do pwsh, e o do Linux, do bash', () => {
    expect(passosEmPowerShell('ci.yml', SEM_PADRAO)).toEqual([
      { arquivo: 'ci.yml', job: 'windows', passo: 'Sem shell', edicao: '7', script: 'Get-Date' },
    ]);
    expect(
      passosEmPowerShell('ci.yml', SEM_PADRAO.replace('windows-2022', 'ubuntu-24.04')),
    ).toEqual([]);
  });
});

// Os parsers da máquina: o Windows PowerShell 5.1 no Windows e o pwsh onde houver, como nas imagens
// do GitHub. Sem nenhum dos dois, os casos abaixo não rodam.
const PARSERS = acharPowerShell();
const TEM_PARSER = PARSERS['5.1'] !== undefined || PARSERS['7'] !== undefined;
const passo = (nome: string, script: string, edicao: '5.1' | '7' = '5.1') => ({
  arquivo: 'versao.yml',
  job: 'windows',
  passo: nome,
  edicao,
  script,
});

describe.runIf(TEM_PARSER)('errosDeSintaxe', () => {
  it('reprova a variável seguida de dois-pontos, com a linha do passo', {
    timeout: 60_000,
  }, async () => {
    const erros = await errosDeSintaxe(
      [
        passo(
          'O choco',
          '$ErrorActionPreference = "Continue"\nWrite-Output "saiu com $LASTEXITCODE: nova tentativa"',
        ),
      ],
      PARSERS,
    );
    expect(erros).toHaveLength(1);
    expect(erros[0]).toMatchObject({
      arquivo: 'versao.yml',
      job: 'windows',
      passo: 'O choco',
      linha: 2,
    });
  });

  it('reprova num passo do 5.1 a sintaxe que só o PowerShell 7 aceita', {
    timeout: 60_000,
  }, async () => {
    const erros = await errosDeSintaxe(
      [
        passo('Com ?? no 5.1', "$a = $null ?? 'b'"),
        passo('Com && no 5.1', 'Get-Date && Get-Date'),
        passo('Com ?? no 7', "$a = $null ?? 'b'", '7'),
      ],
      PARSERS,
    );
    expect([...new Set(erros.map(({ passo }) => passo))].sort()).toEqual([
      'Com && no 5.1',
      'Com ?? no 5.1',
    ]);
  });

  it('aceita o passo válido, com acentos e a variável delimitada', {
    timeout: 60_000,
  }, async () => {
    const erros = await errosDeSintaxe(
      [
        passo(
          'O choco',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: a variável delimitada do PowerShell.
          'Write-Output "O choco install saiu com ${LASTEXITCODE}: nova tentativa em 30 s."',
        ),
      ],
      PARSERS,
    );
    expect(erros).toEqual([]);
  });
});

// O teste-guarda: todo passo em PowerShell de cada workflow passa pelo parser. Um caso por workflow.
const PASTA_DOS_WORKFLOWS = join(import.meta.dirname, '..', '..', '.github', 'workflows');
const WORKFLOWS = readdirSync(PASTA_DOS_WORKFLOWS).filter((nome) => /\.ya?ml$/.test(nome));

describe.runIf(TEM_PARSER)('os workflows do repositório', () => {
  it.each(WORKFLOWS)(
    '%s: todo passo em PowerShell passa pelo parser',
    { timeout: 60_000 },
    async (nome) => {
      const passos = passosEmPowerShell(
        nome,
        readFileSync(join(PASTA_DOS_WORKFLOWS, nome), 'utf8'),
      );
      const erros = await errosDeSintaxe(passos, PARSERS);
      expect(
        erros.map(
          ({ job, passo, linha, mensagem }) => `${job} › ${passo}, linha ${linha}: ${mensagem}`,
        ),
      ).toEqual([]);
    },
  );
});
