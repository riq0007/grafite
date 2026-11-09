// As peças do Windows de verdade que a preparação do servidor usa (change
// instalador-e-menu-da-operacao, design, decisão 3), com os comandos conferidos por um executor
// simulado: os discos, os serviços que não são do Grafite e o instalador da EDB.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExecutarProcesso } from '@grafite/operacao';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instaladorDaEdb } from './preparar.ts';
import { discosDoSistema, servicosDoSistema } from './sistema.ts';

function executorSimulado(saida = '', codigo = 0, erro = '') {
  const chamadas: { arquivo: string; argumentos: string[] }[] = [];
  const executar: ExecutarProcesso = async (arquivo, argumentos) => {
    chamadas.push({ arquivo, argumentos });
    return { codigo, saida, erro };
  };
  return { chamadas, executar };
}

const powershell = (comando: string) => ({
  arquivo: 'powershell.exe',
  argumentos: ['-NoProfile', '-NonInteractive', '-Command', comando],
});

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-sistema-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

describe('Discos', () => {
  it('lista só os discos fixos, pelo tipo 3 do Windows', async () => {
    const { chamadas, executar } = executorSimulado('C:\r\nD:\r\n');
    await expect(discosDoSistema(executar).fixos()).resolves.toEqual(['C', 'D']);
    expect(chamadas).toEqual([
      powershell(
        "$ProgressPreference = 'SilentlyContinue'; Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { $_.DeviceID }",
      ),
    ]);
  });

  it('diz se a pasta existe com alguma coisa dentro', async () => {
    const { discos } = { discos: discosDoSistema(executorSimulado().executar) };
    const vazia = join(pasta, 'vazia');
    const cheia = join(pasta, 'cheia');
    await mkdir(vazia);
    await mkdir(cheia);
    await writeFile(join(cheia, 'PG_VERSION'), '16');

    await expect(discos.temArquivos(join(pasta, 'nao-existe'))).resolves.toBe(false);
    await expect(discos.temArquivos(vazia)).resolves.toBe(false);
    await expect(discos.temArquivos(cheia)).resolves.toBe(true);
  });
});

describe('Serviços do sistema', () => {
  it('lista os serviços pelo começo do nome, com o estado', async () => {
    const { chamadas, executar } = executorSimulado(
      'postgresql-x64-16|Running\r\npostgresql-x64-18|Stopped\r\n',
    );
    await expect(servicosDoSistema(executar).listar('postgresql')).resolves.toEqual([
      { nome: 'postgresql-x64-16', rodando: true },
      { nome: 'postgresql-x64-18', rodando: false },
    ]);
    expect(chamadas).toEqual([
      powershell(
        "Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | ForEach-Object { $_.Name + '|' + $_.Status }",
      ),
    ]);
  });

  it('para, reinicia e muda o início de um serviço pelo nome', async () => {
    const { chamadas, executar } = executorSimulado();
    const servicos = servicosDoSistema(executar);
    await servicos.parar('W3SVC');
    await servicos.inicio('W3SVC', 'desligado');
    await servicos.reiniciar('postgresql-x64-18');
    await servicos.inicio('postgresql-x64-18', 'automatico');

    expect(chamadas).toEqual([
      powershell("Stop-Service -Name 'W3SVC' -Force -ErrorAction Stop"),
      { arquivo: 'sc.exe', argumentos: ['config', 'W3SVC', 'start=', 'disabled'] },
      powershell("Restart-Service -Name 'postgresql-x64-18' -Force -ErrorAction Stop"),
      { arquivo: 'sc.exe', argumentos: ['config', 'postgresql-x64-18', 'start=', 'auto'] },
    ]);
  });

  it('diz o serviço e o motivo quando o Windows recusa', async () => {
    const { executar } = executorSimulado('', 1, 'Stop-Service : Acesso negado.\r\n');
    await expect(servicosDoSistema(executar).parar('W3SVC')).rejects.toThrow(
      'Não foi possível parar o serviço W3SVC: Stop-Service : Acesso negado.',
    );
  });
});

describe('Instalador da EDB', () => {
  it('roda o instalador em silêncio, com as opções do arquivo', async () => {
    const { chamadas, executar } = executorSimulado();
    await instaladorDaEdb(executar).instalar('D:\\zip\\postgresql.exe', 'C:\\prep\\opcoes');
    expect(chamadas).toEqual([
      {
        arquivo: 'D:\\zip\\postgresql.exe',
        argumentos: [
          '--mode',
          'unattended',
          '--unattendedmodeui',
          'none',
          '--optionfile',
          'C:\\prep\\opcoes',
        ],
      },
    ]);
  });

  it('para com o código do instalador que falha', async () => {
    const { executar } = executorSimulado('Problem running post-install step.', 1);
    await expect(instaladorDaEdb(executar).instalar('postgresql.exe', 'opcoes')).rejects.toThrow(
      'O instalador do PostgreSQL terminou com o código 1: Problem running post-install step.',
    );
  });

  it('põe o servidor para atender só nele mesmo, no postgresql.conf da pasta dos dados', async () => {
    await writeFile(join(pasta, 'postgresql.conf'), "listen_addresses = '*'\r\nport = 5432\r\n");
    await instaladorDaEdb(executorSimulado().executar).atenderSoNoServidor(pasta);
    expect(await readFile(join(pasta, 'postgresql.conf'), 'utf8')).toBe(
      "listen_addresses = 'localhost'\t\t# só o próprio servidor (Grafite)\r\nport = 5432\r\n",
    );
  });
});
