import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { ExecutarProcesso } from '@grafite/operacao';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { restringirAcesso } from './acl.ts';
import { consoleDoTerminal } from './console.ts';
import { abrirPortasDoProxy } from './firewall.ts';
import { juncoesDoSistema } from './juncoes.ts';
import { portasOcupadas } from './portas.ts';

function executorSimulado(codigo = 0, saida = '', erro = '') {
  const chamadas: { arquivo: string; argumentos: string[] }[] = [];
  const executar: ExecutarProcesso = async (arquivo, argumentos) => {
    chamadas.push({ arquivo, argumentos });
    return { codigo, saida, erro };
  };
  return { chamadas, executar };
}

describe('Portas', () => {
  it('pergunta ao Windows quem escuta nas portas, sem abrir nenhuma', async () => {
    // A 80 aparece duas vezes, no IPv4 e no IPv6, como o http.sys do IIS escuta.
    const { chamadas, executar } = executorSimulado(0, '80\r\n80\r\n');
    await expect(portasOcupadas(executar, [80, 443])).resolves.toEqual([80]);
    expect(chamadas).toEqual([
      {
        arquivo: 'powershell.exe',
        argumentos: [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "$ProgressPreference = 'SilentlyContinue'; Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -in 80,443 } | ForEach-Object { $_.LocalPort }",
        ],
      },
    ]);
  });

  it('sem ninguém escutando, nenhuma está ocupada', async () => {
    const { executar } = executorSimulado(0, '');
    await expect(portasOcupadas(executar, [80, 443])).resolves.toEqual([]);
  });

  it('a consulta que falha para tudo', async () => {
    const { executar } = executorSimulado(1, '', 'Get-NetTCPConnection : Acesso negado.\r\n');
    await expect(portasOcupadas(executar, [80, 443])).rejects.toThrow(
      'Não foi possível conferir as portas 80 e 443: Get-NetTCPConnection : Acesso negado.',
    );
  });
});

describe('Firewall', () => {
  it('abre as portas 80 e 443 com regras de nome fixo, refeitas a cada vez', async () => {
    const { chamadas, executar } = executorSimulado();
    await abrirPortasDoProxy(executar);
    expect(chamadas).toEqual(
      [
        ['Grafite HTTP', '80'],
        ['Grafite HTTPS', '443'],
      ].flatMap(([nome, porta]) => [
        {
          arquivo: 'netsh.exe',
          argumentos: ['advfirewall', 'firewall', 'delete', 'rule', `name=${nome}`],
        },
        {
          arquivo: 'netsh.exe',
          argumentos: [
            'advfirewall',
            'firewall',
            'add',
            'rule',
            `name=${nome}`,
            'dir=in',
            'action=allow',
            'protocol=TCP',
            `localport=${porta}`,
          ],
        },
      ]),
    );
  });
});

describe('ACL do config.env', () => {
  it('deixa só os administradores e o sistema, pelos SIDs, sem herança', async () => {
    const { chamadas, executar } = executorSimulado();
    await restringirAcesso(executar, 'C:\\Grafite\\producao\\config.env');
    expect(chamadas).toEqual([
      {
        arquivo: 'icacls.exe',
        argumentos: [
          'C:\\Grafite\\producao\\config.env',
          '/inheritance:r',
          '/grant:r',
          '*S-1-5-32-544:F',
          '*S-1-5-18:F',
        ],
      },
    ]);
  });

  it('a falha do icacls para tudo', async () => {
    const { executar } = executorSimulado(5);
    await expect(restringirAcesso(executar, 'C:\\Grafite\\producao\\config.env')).rejects.toThrow(
      'Não foi possível restringir o acesso a C:\\Grafite\\producao\\config.env.',
    );
  });
});

describe('Juncoes', () => {
  let pasta: string;

  beforeEach(async () => {
    pasta = await mkdtemp(join(tmpdir(), 'grafite-juncoes-'));
    for (const versao of ['0.3.0', '0.4.0']) {
      await mkdir(join(pasta, 'versoes', versao), { recursive: true });
      await writeFile(join(pasta, 'versoes', versao, 'versao.txt'), versao);
    }
  });

  afterEach(async () => {
    await rm(pasta, { recursive: true, force: true });
  });

  it('aponta a junção para a versão e troca o alvo sem tocar nas versões', async () => {
    const juncoes = juncoesDoSistema();
    const atual = join(pasta, 'producao', 'atual');
    await mkdir(join(pasta, 'producao'));
    await expect(juncoes.ler(atual)).resolves.toBeNull();
    await juncoes.apontar(atual, join(pasta, 'versoes', '0.3.0'));
    expect(await readFile(join(atual, 'versao.txt'), 'utf8')).toBe('0.3.0');
    await juncoes.apontar(atual, join(pasta, 'versoes', '0.4.0'));
    expect(await readFile(join(atual, 'versao.txt'), 'utf8')).toBe('0.4.0');
    await expect(juncoes.ler(atual)).resolves.toBe(join(pasta, 'versoes', '0.4.0'));
    expect(await readFile(join(pasta, 'versoes', '0.3.0', 'versao.txt'), 'utf8')).toBe('0.3.0');
  });
});

describe('Console', () => {
  /** Um terminal com as linhas que a pessoa vai digitar. */
  function terminal(...linhas: string[]) {
    const entrada = new PassThrough();
    const saida = new PassThrough();
    let escrito = '';
    saida.on('data', (parte: Buffer) => {
      escrito += parte.toString();
    });
    entrada.end(linhas.map((linha) => `${linha}\n`).join(''));
    return { entrada, saida, escrito: () => escrito };
  }

  it('pergunta e devolve a resposta, ou o padrão sem resposta', async () => {
    const t = terminal('grafite.empresa.local', '');
    const console = consoleDoTerminal({ entrada: t.entrada, saida: t.saida });
    await expect(console.perguntar('Endereço da produção')).resolves.toBe('grafite.empresa.local');
    await expect(console.perguntar('Janela do backup', '00:00-06:00')).resolves.toBe('00:00-06:00');
    expect(t.escrito()).toContain('Endereço da produção: ');
    expect(t.escrito()).toContain('Janela do backup [00:00-06:00]: ');
  });

  it('a confirmação digitada passa só com o texto exato', async () => {
    const certo = terminal('grafite');
    await expect(
      consoleDoTerminal({ entrada: certo.entrada, saida: certo.saida }).confirmarDigitado(
        'Para atualizar a produção, digite o nome do banco',
        'grafite',
      ),
    ).resolves.toBeUndefined();
    const errado = terminal('Grafite');
    await expect(
      consoleDoTerminal({ entrada: errado.entrada, saida: errado.saida }).confirmarDigitado(
        'Para atualizar a produção, digite o nome do banco',
        'grafite',
      ),
    ).rejects.toThrow('O texto digitado não confere com grafite. Nada foi feito.');
  });

  it('com --confirmar, confere o valor dado como se tivesse sido digitado, sem perguntar', async () => {
    const t = terminal();
    const console = consoleDoTerminal({ entrada: t.entrada, saida: t.saida, confirmar: 'grafite' });
    await expect(
      console.confirmarDigitado('Digite o nome do banco', 'grafite'),
    ).resolves.toBeUndefined();
    await expect(
      console.confirmarDigitado('Digite o nome do banco', 'grafite_teste'),
    ).rejects.toThrow('O texto digitado não confere com grafite_teste. Nada foi feito.');
  });

  it('o segredo fora de um terminal, como no roteiro, é lido da linha sem nada além da pergunta', async () => {
    const t = terminal('s3nh4 do postgres');
    const console = consoleDoTerminal({ entrada: t.entrada, saida: t.saida });
    await expect(console.perguntarSegredo('Senha do postgres')).resolves.toBe('s3nh4 do postgres');
    expect(t.escrito()).toBe('Senha do postgres: ');
  });

  it('no terminal, o segredo é digitado no modo bruto, sem eco, com as teclas de apagar', async () => {
    const entrada = Object.assign(new PassThrough(), {
      isTTY: true,
      modos: [] as boolean[],
      setRawMode(ligado: boolean) {
        this.modos.push(ligado);
        return this;
      },
    });
    const saida = new PassThrough();
    let escrito = '';
    saida.on('data', (parte: Buffer) => {
      escrito += parte.toString();
    });
    const console = consoleDoTerminal({ entrada, saida });
    const resposta = console.perguntarSegredo('Token da Cloudflare');
    // No modo bruto, o Enter chega como \r, e o apagar como DEL (ou BS no Windows).
    entrada.write('abc\x7fd\bX\r');
    await expect(resposta).resolves.toBe('abX');
    expect(entrada.modos).toEqual([true, false]);
    expect(escrito).toBe('Token da Cloudflare: \n');
    entrada.end();
  });
});
