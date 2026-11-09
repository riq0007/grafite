// A preparação do PostgreSQL 18 da produção na instalação pelo atalho (change
// instalador-e-menu-da-operacao, design, decisão 3; spec operacao-servicos, "Atalho de
// instalação"), com as peças do Windows simuladas: os serviços, os discos e o instalador da EDB.
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { ExecutarProcesso, FerramentasDoPostgres } from '@grafite/operacao';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consoleRoteirizado } from '../../test/console-roteirizado.ts';
import type { Baixador } from './baixador.ts';
import {
  comListenAddressesLocal,
  type InstaladorDoPostgres,
  prepararIis,
  prepararPostgres,
} from './preparar.ts';
import type { Prerequisitos } from './prerequisitos.ts';
import type { Discos, ServicoDoSistema, ServicosDoSistema } from './sistema.ts';

const OFICIAL = 'o instalador oficial do PostgreSQL 18.6';
const SENHA = 'S3nha!do-postgres';

const PREREQUISITOS: Prerequisitos = {
  node: {
    versao: '24.22.1',
    arquivo: 'node-v24.22.1-x64.msi',
    url: 'https://nodejs.org/dist/v24.22.1/node-v24.22.1-x64.msi',
    sha256: 'a'.repeat(64),
  },
  postgres: {
    versao: '18.6',
    arquivo: 'postgresql-18.6-1-windows-x64.exe',
    url: 'https://get.enterprisedb.com/postgresql/postgresql-18.6-1-windows-x64.exe',
    sha256: createHash('sha256').update(OFICIAL).digest('hex'),
  },
};

let pasta: string;
let pastaDoZip: string;
let pastaDaPreparacao: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-preparar-'));
  pastaDoZip = join(pasta, 'zip');
  pastaDaPreparacao = join(pasta, 'preparacao');
  await mkdir(pastaDoZip);
  // O instalador oficial na pasta do zip: a preparação não vai à rede.
  await writeFile(join(pastaDoZip, PREREQUISITOS.postgres.arquivo), OFICIAL);
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

const existe = (caminho: string) =>
  access(caminho).then(
    () => true,
    () => false,
  );

/** Um servidor Windows simulado, com o que a preparação vê e o que ela faz nele. */
function servidorSimulado({
  discos = ['C', 'D'],
  servicos = [] as ServicoDoSistema[],
  comArquivos = [] as string[],
  postgres18 = false,
  falhaDoInstalador = undefined as string | undefined,
} = {}) {
  const feito: string[] = [];
  const processos: string[][] = [];
  const opcoes: string[] = [];
  const sistema: ServicosDoSistema = {
    listar: async (prefixo) => servicos.filter(({ nome }) => nome.startsWith(prefixo)),
    parar: async (nome) => {
      feito.push(`parar ${nome}`);
    },
    reiniciar: async (nome) => {
      feito.push(`reiniciar ${nome}`);
    },
    inicio: async (nome, modo) => {
      feito.push(`início ${modo} ${nome}`);
    },
  };
  const discosDoServidor: Discos = {
    fixos: async () => discos,
    temArquivos: async (caminho) => comArquivos.includes(caminho),
  };
  const instaladorDoPostgres: InstaladorDoPostgres = {
    instalar: async (instalador, arquivoDeOpcoes) => {
      feito.push(`instalar ${basename(instalador)}`);
      processos.push([instalador, '--optionfile', arquivoDeOpcoes]);
      opcoes.push(await readFile(arquivoDeOpcoes, 'utf8'));
      if (falhaDoInstalador !== undefined) throw new Error(falhaDoInstalador);
    },
    atenderSoNoServidor: async (dados) => {
      feito.push(`só no servidor ${dados}`);
    },
  };
  const executar: ExecutarProcesso = async (arquivo, argumentos) => {
    processos.push([arquivo, ...argumentos]);
    return { codigo: 0, saida: '', erro: '' };
  };
  const ferramentas = (pgBin: string): FerramentasDoPostgres => ({
    executar: async (ferramenta, argumentos) => {
      processos.push([join(pgBin, ferramenta), ...argumentos]);
      return postgres18
        ? { codigo: 0, saida: 'pg_dump (PostgreSQL) 18.6\n', erro: '' }
        : { codigo: 1, saida: '', erro: 'O sistema não pode encontrar o arquivo especificado.' };
    },
  });
  const baixador: Baixador = {
    baixar: async (url) => {
      throw new Error(`Sem rede para ${url}`);
    },
  };
  return {
    feito,
    processos,
    opcoes,
    pecas: {
      sistema,
      discos: discosDoServidor,
      instaladorDoPostgres,
      baixador,
      executar,
      ferramentas,
    },
  };
}

const preparar = (servidor: ReturnType<typeof servidorSimulado>, ...respostas: string[]) => {
  const roteiro = consoleRoteirizado(...respostas);
  const preparo = prepararPostgres({
    ...servidor.pecas,
    console: roteiro.console,
    prerequisitos: PREREQUISITOS,
    pastaDoZip,
    pastaDaPreparacao,
  });
  return { roteiro, preparo };
};

const PERGUNTAS = [
  'Pasta dos dados do PostgreSQL 18',
  'Senha do usuário postgres do PostgreSQL 18',
  'Repita a senha do usuário postgres',
];

describe('prepararPostgres', () => {
  it('instala o PostgreSQL 18 que falta, com os dados no disco D: (Servidor limpo)', async () => {
    const servidor = servidorSimulado();
    const { roteiro, preparo } = preparar(servidor, '', SENHA, SENHA);

    await expect(preparo).resolves.toEqual({ senhaDoPostgres: SENHA });

    expect(roteiro.perguntas).toEqual(PERGUNTAS);
    expect(servidor.feito).toEqual([
      'instalar postgresql-18.6-1-windows-x64.exe',
      'só no servidor D:\\PostgreSQL\\18\\data',
      'início automatico postgresql-x64-18',
      'reiniciar postgresql-x64-18',
    ]);
    expect(servidor.opcoes).toEqual([
      [
        `superpassword=${SENHA}`,
        'serverport=5432',
        'prefix=C:\\Program Files\\PostgreSQL\\18',
        'datadir=D:\\PostgreSQL\\18\\data',
        'servicename=postgresql-x64-18',
        'enable-components=server,commandlinetools',
        'disable-components=pgAdmin,stackbuilder',
        '',
      ].join('\r\n'),
    ]);
    expect(roteiro.escritos).toContain(
      'PostgreSQL 18.6 instalado, com os dados em D:\\PostgreSQL\\18\\data, atendendo só neste servidor.',
    );
  });

  it('não deixa a senha nos argumentos de nenhum processo nem o arquivo das opções no disco', async () => {
    const servidor = servidorSimulado();
    await preparar(servidor, '', SENHA, SENHA).preparo;

    expect(servidor.processos.flat().some((argumento) => argumento.includes(SENHA))).toBe(false);
    // O arquivo das opções fica numa pasta só dos administradores, apagada no fim.
    expect(servidor.processos).toContainEqual([
      'icacls.exe',
      pastaDaPreparacao,
      '/inheritance:r',
      '/grant:r',
      '*S-1-5-32-544:(OI)(CI)F',
      '*S-1-5-18:(OI)(CI)F',
    ]);
    expect(await existe(pastaDaPreparacao)).toBe(false);
  });

  it('propõe a pasta padrão do instalador oficial no servidor sem disco D:', async () => {
    const servidor = servidorSimulado({ discos: ['C'] });
    await preparar(servidor, '', SENHA, SENHA).preparo;

    expect(servidor.opcoes[0]).toContain('datadir=C:\\Program Files\\PostgreSQL\\18\\data\r\n');
    expect(servidor.feito).toContain('só no servidor C:\\Program Files\\PostgreSQL\\18\\data');
  });

  it('recusa a pasta dos dados com arquivos e pergunta de novo, antes de instalar (Pasta dos dados com arquivos)', async () => {
    const servidor = servidorSimulado({ comArquivos: ['D:\\PostgreSQL\\18\\data'] });
    const { roteiro, preparo } = preparar(servidor, '', 'E:\\Dados\\PostgreSQL', SENHA, SENHA);
    await preparo;

    expect(roteiro.perguntas).toEqual([PERGUNTAS[0], ...PERGUNTAS]);
    expect(roteiro.escritos).toContain(
      'A pasta D:\\PostgreSQL\\18\\data já tem arquivos: a pasta dos dados precisa estar vazia ou não existir.',
    );
    expect(servidor.opcoes[0]).toContain('datadir=E:\\Dados\\PostgreSQL\r\n');
  });

  it('pede a senha de novo quando as duas não são iguais ou ela fica em branco', async () => {
    const servidor = servidorSimulado();
    const { roteiro, preparo } = preparar(servidor, '', '', SENHA, 'outra', SENHA, SENHA);

    await expect(preparo).resolves.toEqual({ senhaDoPostgres: SENHA });
    expect(roteiro.escritos).toContain('A senha não pode ficar em branco.');
    expect(roteiro.escritos).toContain('As duas senhas não são iguais. Digite de novo.');
    expect(roteiro.sobra()).toBe(0);
  });

  // Sem um terminal, o console responde vazio quando a entrada acaba: as perguntas não repetem
  // para sempre.
  it('para depois de três senhas que não servem, sem instalar nada', async () => {
    const servidor = servidorSimulado();
    const { roteiro, preparo } = preparar(servidor, '', '', '', '');

    await expect(preparo).rejects.toThrow(
      'A senha do usuário postgres não foi confirmada depois de três tentativas. Nada foi instalado.',
    );
    expect(roteiro.sobra()).toBe(0);
    expect(servidor.feito).toEqual([]);
  });

  it('para depois de três pastas dos dados com arquivos, sem instalar nada', async () => {
    const servidor = servidorSimulado({ comArquivos: ['D:\\PostgreSQL\\18\\data'] });
    const { roteiro, preparo } = preparar(servidor, '', '', '');

    await expect(preparo).rejects.toThrow(
      'Nenhuma pasta vazia foi informada para os dados do PostgreSQL depois de três tentativas. Nada foi instalado.',
    );
    expect(roteiro.sobra()).toBe(0);
    expect(servidor.feito).toEqual([]);
  });

  it('deixa como está o PostgreSQL 18 que o servidor já tem, sem perguntar nada (Pré-requisitos presentes)', async () => {
    const servidor = servidorSimulado({
      servicos: [{ nome: 'postgresql-x64-18', rodando: true }],
      postgres18: true,
    });
    const { roteiro, preparo } = preparar(servidor);

    await expect(preparo).resolves.toEqual({});
    expect(roteiro.perguntas).toEqual([]);
    expect(servidor.feito).toEqual([]);
    expect(roteiro.escritos).toEqual([
      'O PostgreSQL 18 já está instalado em C:\\Program Files\\PostgreSQL\\18\\bin: fica como está.',
    ]);
  });

  it('deixa como está o PostgreSQL 18 de fora da pasta padrão, pelo serviço dele', async () => {
    const servidor = servidorSimulado({ servicos: [{ nome: 'postgresql-x64-18', rodando: true }] });
    const { roteiro, preparo } = preparar(servidor);

    await expect(preparo).resolves.toEqual({});
    expect(roteiro.perguntas).toEqual([]);
    expect(servidor.feito).toEqual([]);
    expect(roteiro.escritos).toEqual([
      'O PostgreSQL 18 já está instalado (o serviço postgresql-x64-18), fora da pasta padrão: fica como está, e a instalação pergunta a pasta dos programas dele.',
    ]);
  });

  it('para antes de instalar qualquer coisa com o PostgreSQL de outra versão', async () => {
    const servidor = servidorSimulado({ servicos: [{ nome: 'postgresql-x64-16', rodando: true }] });
    const { roteiro, preparo } = preparar(servidor);

    await expect(preparo).rejects.toThrow(
      'Este servidor já tem outro PostgreSQL (o serviço postgresql-x64-16), e a produção do Grafite precisa do PostgreSQL 18. O atalho não instala um segundo PostgreSQL: instale o 18 à mão e rode a instalação pelo comando, como diz o runbook.',
    );
    expect(roteiro.perguntas).toEqual([]);
    expect(servidor.feito).toEqual([]);
  });

  it('apaga o arquivo das opções quando o instalador falha, e o que sobrou de uma execução anterior', async () => {
    await mkdir(pastaDaPreparacao);
    await writeFile(join(pastaDaPreparacao, 'postgresql.opcoes'), 'superpassword=antiga\r\n');
    const servidor = servidorSimulado({
      falhaDoInstalador: 'O instalador terminou com o código 1.',
    });

    await expect(preparar(servidor, '', SENHA, SENHA).preparo).rejects.toThrow(
      'O instalador terminou com o código 1.',
    );
    expect(await existe(pastaDaPreparacao)).toBe(false);
    expect(servidor.feito).toEqual(['instalar postgresql-18.6-1-windows-x64.exe']);
  });
});

describe('comListenAddressesLocal', () => {
  it('troca o listen_addresses do instalador pelo do próprio servidor', () => {
    const conf = [
      '# - Connection Settings -',
      '',
      "listen_addresses = '*'\t\t# what IP address(es) to listen on;",
      'port = 5432\t\t\t\t# (change requires restart)',
      '',
    ].join('\n');
    expect(comListenAddressesLocal(conf)).toBe(
      [
        '# - Connection Settings -',
        '',
        "listen_addresses = 'localhost'\t\t# só o próprio servidor (Grafite)",
        'port = 5432\t\t\t\t# (change requires restart)',
        '',
      ].join('\n'),
    );
  });

  it('acrescenta a linha quando o arquivo só tem a comentada', () => {
    const conf = "#listen_addresses = 'localhost'\t# what IP address(es) to listen on;\r\n";
    expect(comListenAddressesLocal(conf)).toBe(
      `${conf}listen_addresses = 'localhost'\t\t# só o próprio servidor (Grafite)\r\n`,
    );
  });
});

describe('prepararIis', () => {
  /** O Windows simulado: quem escuta nas portas a cada consulta, o IIS e o proxy do Grafite. */
  function windowsSimulado({
    portas,
    iisRodando = true,
    proxyRodando = false,
  }: {
    portas: string[];
    iisRodando?: boolean;
    proxyRodando?: boolean;
  }) {
    const feito: string[] = [];
    const executar: ExecutarProcesso = async (arquivo, argumentos) => {
      feito.push(
        `consultar as portas por ${arquivo} ${argumentos.at(-1)?.includes('Get-NetTCPConnection') ? 'Get-NetTCPConnection' : ''}`.trim(),
      );
      return { codigo: 0, saida: portas.shift() ?? '', erro: '' };
    };
    const sistema: ServicosDoSistema = {
      listar: async (prefixo) =>
        [
          ...(iisRodando ? [{ nome: 'W3SVC', rodando: true }] : []),
          ...(proxyRodando ? [{ nome: 'grafite-proxy', rodando: true }] : []),
        ].filter(({ nome }) => nome.startsWith(prefixo)),
      parar: async (nome) => {
        feito.push(`parar ${nome}`);
      },
      reiniciar: async (nome) => {
        feito.push(`reiniciar ${nome}`);
      },
      inicio: async (nome, modo) => {
        feito.push(`início ${modo} ${nome}`);
      },
    };
    return { feito, executar, sistema };
  }

  const PERGUNTA_DO_IIS =
    'O IIS (serviço W3SVC) ocupa a porta 80, que o proxy do Grafite precisa. Parar o IIS e desligar o início automático dele? (sim/não)';

  it('com o sim, para o IIS, desliga o início automático e confere as portas de novo (IIS nas portas do proxy)', async () => {
    const windows = windowsSimulado({ portas: ['80\r\n80\r\n', ''] });
    const { console, perguntas, escritos } = consoleRoteirizado('sim');

    await prepararIis({ console, executar: windows.executar, sistema: windows.sistema });

    expect(perguntas).toEqual([PERGUNTA_DO_IIS]);
    expect(windows.feito).toEqual([
      'consultar as portas por powershell.exe Get-NetTCPConnection',
      'parar W3SVC',
      'início desligado W3SVC',
      'consultar as portas por powershell.exe Get-NetTCPConnection',
    ]);
    expect(escritos).toEqual(['IIS parado, sem iniciar com o Windows.']);
  });

  it('com o não, deixa o IIS e para com a mensagem da porta ocupada', async () => {
    const windows = windowsSimulado({ portas: ['80\r\n'] });
    const { console } = consoleRoteirizado('não');

    await expect(
      prepararIis({ console, executar: windows.executar, sistema: windows.sistema }),
    ).rejects.toThrow(
      'A porta 80 está ocupada por outro programa, como o IIS, e o proxy do Grafite precisa das portas 80 e 443: libere-a e rode a instalação de novo.',
    );
    expect(windows.feito).toEqual(['consultar as portas por powershell.exe Get-NetTCPConnection']);
  });

  it('com a porta presa por outro programa, para com a mensagem de hoje, sem perguntar', async () => {
    const windows = windowsSimulado({ portas: ['443\r\n80\r\n'], iisRodando: false });
    const { console, perguntas } = consoleRoteirizado();

    await expect(
      prepararIis({ console, executar: windows.executar, sistema: windows.sistema }),
    ).rejects.toThrow(
      'As portas 80 e 443 estão ocupadas por outro programa, como o IIS, e o proxy do Grafite precisa delas: libere-as e rode a instalação de novo.',
    );
    expect(perguntas).toEqual([]);
  });

  it('com o IIS parado e a porta ainda presa, para com a mensagem de hoje', async () => {
    const windows = windowsSimulado({ portas: ['80\r\n', '80\r\n'] });
    const { console } = consoleRoteirizado('sim');

    await expect(
      prepararIis({ console, executar: windows.executar, sistema: windows.sistema }),
    ).rejects.toThrow('A porta 80 está ocupada por outro programa');
    expect(windows.feito).toContain('parar W3SVC');
  });

  it('na retomada, com o proxy do Grafite nas portas, não pergunta nem para', async () => {
    const windows = windowsSimulado({
      portas: ['80\r\n443\r\n'],
      iisRodando: false,
      proxyRodando: true,
    });
    const { console, perguntas } = consoleRoteirizado();

    await prepararIis({ console, executar: windows.executar, sistema: windows.sistema });

    expect(perguntas).toEqual([]);
    expect(windows.feito).toEqual(['consultar as portas por powershell.exe Get-NetTCPConnection']);
  });

  it('com as portas livres, não pergunta nem muda nada', async () => {
    const windows = windowsSimulado({ portas: [''] });
    const { console, perguntas } = consoleRoteirizado();

    await prepararIis({ console, executar: windows.executar, sistema: windows.sistema });

    expect(perguntas).toEqual([]);
    expect(windows.feito).toEqual(['consultar as portas por powershell.exe Get-NetTCPConnection']);
  });
});
