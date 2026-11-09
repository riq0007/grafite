// A sintaxe dos passos em PowerShell dos workflows (spec plataforma-base, "Sintaxe dos passos em
// PowerShell conferida"; change ci-nos-executores-do-github, design, decisão 11): cada passo passa
// pelo parser do PowerShell antes de o job rodar no GitHub, porque o actionlint não olha o PowerShell.
import { execFile, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { parse } from 'yaml';

const executar = promisify(execFile);

/** A edição do PowerShell de um passo: o Windows PowerShell 5.1 ou o PowerShell 7 (pwsh). */
export type Edicao = '5.1' | '7';

export interface PassoEmPowerShell {
  arquivo: string;
  job: string;
  /** O nome do passo, ou "passo N" pela posição dele no job. */
  passo: string;
  edicao: Edicao;
  /** O run do passo, com as expressões do Actions trocadas por uma variável. */
  script: string;
}

export interface ErroDeSintaxe {
  arquivo: string;
  job: string;
  passo: string;
  /** A linha no script do passo. */
  linha: number;
  mensagem: string;
}

/** Os parsers desta máquina, por edição: o executável de cada uma. */
export type Parsers = Partial<Record<Edicao, string>>;

/** O Actions troca a expressão por texto antes de rodar o passo; para o parser, ela vira uma variável. */
const EXPRESSAO = /\$\{\{[\s\S]*?\}\}/g;

const texto = (valor: unknown): string | undefined =>
  typeof valor === 'string' ? valor : undefined;

/** A edição de um shell do Actions, pelo programa que ele chama, ou nada se não for o PowerShell. */
function edicaoDoShell(shell: string): Edicao | null {
  const programa = (shell.trim().split(/\s+/)[0] ?? '').split(/[\\/]/).pop()?.toLowerCase();
  if (programa === 'pwsh' || programa === 'pwsh.exe') return '7';
  if (programa === 'powershell' || programa === 'powershell.exe') return '5.1';
  return null;
}

interface Definicao {
  'runs-on'?: unknown;
  defaults?: { run?: { shell?: unknown } };
  steps?: unknown;
}

/**
 * Os passos em PowerShell de um workflow. O shell vem do passo, do defaults do job ou do defaults
 * do workflow; sem nenhum, o Actions usa o pwsh no Windows e o bash nas outras máquinas.
 */
export function passosEmPowerShell(arquivo: string, conteudo: string): PassoEmPowerShell[] {
  const workflow = (parse(conteudo) ?? {}) as Definicao & { jobs?: Record<string, Definicao> };
  const doWorkflow = texto(workflow.defaults?.run?.shell);
  const passos: PassoEmPowerShell[] = [];
  for (const [job, definicao] of Object.entries(workflow.jobs ?? {})) {
    const doJob = texto(definicao?.defaults?.run?.shell);
    const daMaquina = /windows/i.test(String(definicao?.['runs-on'] ?? '')) ? 'pwsh' : 'bash';
    const lista: unknown[] = Array.isArray(definicao?.steps) ? definicao.steps : [];
    lista.forEach((item, indice) => {
      const passo = (item ?? {}) as { name?: unknown; run?: unknown; shell?: unknown };
      const run = texto(passo.run);
      if (run === undefined) return;
      const edicao = edicaoDoShell(texto(passo.shell) ?? doJob ?? doWorkflow ?? daMaquina);
      if (edicao === null) return;
      passos.push({
        arquivo,
        job,
        passo: texto(passo.name) ?? `passo ${indice + 1}`,
        edicao,
        script: run.replace(EXPRESSAO, () => '$expressaoDoActions'),
      });
    });
  }
  return passos;
}

/** Os parsers desta máquina: o 5.1 só no Windows, e o pwsh onde houver. */
export function acharPowerShell(): Parsers {
  const responde = (programa: string) =>
    spawnSync(programa, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'exit 0'], {
      stdio: 'ignore',
    }).status === 0;
  const parsers: Parsers = {};
  if (process.platform === 'win32' && responde('powershell.exe')) parsers['5.1'] = 'powershell.exe';
  const pwsh = process.platform === 'win32' ? 'pwsh.exe' : 'pwsh';
  if (responde(pwsh)) parsers['7'] = pwsh;
  return parsers;
}

/**
 * Os tokens que só o PowerShell 7 aceita. Num passo do 5.1, eles reprovam também quando o parser é o
 * do 7, como no Linux; no parser do 5.1, eles já são erros.
 */
const SO_DO_7 = [
  'AndAnd',
  'OrOr',
  'QuestionQuestion',
  'QuestionQuestionEquals',
  'QuestionDot',
  'QuestionLBracket',
];

// Um processo só para os passos todos: eles chegam num JSON, e os achados voltam noutro. As listas
// vão dentro de um objeto, porque o ConvertFrom-Json do 5.1 desfaz a lista solta de um item.
const ROTEIRO = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false
$dados = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($env:GRAFITE_PASSOS, [Text.Encoding]::UTF8))
$so7 = @(${SO_DO_7.map((token) => `'${token}'`).join(', ')})
$achados = New-Object System.Collections.ArrayList
foreach ($passo in $dados.passos) {
  $tokens = $null
  $erros = $null
  [void][System.Management.Automation.Language.Parser]::ParseInput([string]$passo.script, [ref]$tokens, [ref]$erros)
  foreach ($erro in $erros) {
    [void]$achados.Add(@{ indice = $passo.indice; linha = $erro.Extent.StartLineNumber; mensagem = $erro.Message })
  }
  if ($passo.edicao -eq '5.1') {
    foreach ($token in $tokens) {
      if ($so7 -contains [string]$token.Kind) {
        [void]$achados.Add(@{ indice = $passo.indice; linha = $token.Extent.StartLineNumber; mensagem = "O $($token.Text) só existe no PowerShell 7, e o passo roda no Windows PowerShell 5.1." })
      }
    }
  }
}
ConvertTo-Json -InputObject @{ achados = @($achados) } -Compress -Depth 4
`;

async function conferirNoParser(
  parser: string,
  passos: readonly PassoEmPowerShell[],
): Promise<ErroDeSintaxe[]> {
  if (passos.length === 0) return [];
  const pasta = await mkdtemp(join(tmpdir(), 'grafite-powershell-'));
  try {
    const entrada = join(pasta, 'passos.json');
    await writeFile(
      entrada,
      JSON.stringify({
        passos: passos.map(({ edicao, script }, indice) => ({ indice, edicao, script })),
      }),
      'utf8',
    );
    const { stdout } = await executar(
      parser,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(ROTEIRO, 'utf16le').toString('base64'),
      ],
      { env: { ...process.env, GRAFITE_PASSOS: entrada }, encoding: 'utf8', maxBuffer: 16 << 20 },
    );
    const { achados } = JSON.parse(stdout.replace(/^﻿/, '')) as {
      achados: Array<{ indice: number; linha: number; mensagem: string }>;
    };
    return achados.flatMap(({ indice, linha, mensagem }) => {
      const passo = passos[indice];
      return passo
        ? [{ arquivo: passo.arquivo, job: passo.job, passo: passo.passo, linha, mensagem }]
        : [];
    });
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}

/**
 * Os erros de sintaxe dos passos. O passo do 5.1 passa pelo parser do 5.1 ou, sem ele, pelo do 7,
 * com os tokens que só o 7 aceita recusados. O passo do 7 passa só pelo parser do 7: sem ele, fica
 * sem conferir, porque o do 5.1 recusaria o que o 7 aceita.
 */
export async function errosDeSintaxe(
  passos: readonly PassoEmPowerShell[],
  parsers: Parsers,
): Promise<ErroDeSintaxe[]> {
  const do51 = parsers['5.1'] ?? parsers['7'];
  const do7 = parsers['7'];
  const erros: ErroDeSintaxe[] = [];
  if (do51) {
    erros.push(
      ...(await conferirNoParser(
        do51,
        passos.filter(({ edicao }) => edicao === '5.1'),
      )),
    );
  }
  if (do7) {
    erros.push(
      ...(await conferirNoParser(
        do7,
        passos.filter(({ edicao }) => edicao === '7'),
      )),
    );
  }
  return erros;
}
