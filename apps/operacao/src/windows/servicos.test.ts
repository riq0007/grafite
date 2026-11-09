import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExecutarProcesso } from '@grafite/operacao';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  configurarServicoDoWindows,
  definicaoDoServico,
  servicosDoWindows,
  xmlDoWinSW,
} from './servicos.ts';

const FERRAMENTAS = {
  node: 'C:\\Program Files\\nodejs\\node.exe',
  caddy: 'C:\\Grafite\\versoes\\0.4.0\\ferramentas\\caddy.exe',
};

describe('o XML de cada serviço', () => {
  it('a API da produção, com o config.env, o reinício e o log por tamanho', () => {
    expect(xmlDoWinSW(definicaoDoServico('api-producao', 'C:\\Grafite', FERRAMENTAS))).toBe(
      [
        '<service>',
        '  <id>grafite</id>',
        '  <name>Grafite</name>',
        '  <description>Grafite: a API e a web da produção, em 127.0.0.1:3000.</description>',
        '  <executable>C:\\Program Files\\nodejs\\node.exe</executable>',
        '  <arguments>--env-file="C:\\Grafite\\producao\\config.env" "C:\\Grafite\\producao\\atual\\apps\\api\\src\\servidor.ts"</arguments>',
        '  <workingdirectory>C:\\Grafite\\producao\\atual</workingdirectory>',
        '  <startmode>Automatic</startmode>',
        '  <onfailure action="restart" delay="10 sec"/>',
        '  <resetfailure>1 hour</resetfailure>',
        '  <stoptimeout>45 sec</stoptimeout>',
        '  <logpath>C:\\Grafite\\producao\\logs</logpath>',
        '  <log mode="roll-by-size">',
        '    <sizeThreshold>10240</sizeThreshold>',
        '    <keepFiles>8</keepFiles>',
        '  </log>',
        '</service>',
        '',
      ].join('\n'),
    );
  });

  it('a API do teste, na pasta do teste', () => {
    const xml = xmlDoWinSW(definicaoDoServico('api-teste', 'C:\\Grafite', FERRAMENTAS));
    expect(xml).toContain('<id>grafite-teste</id>');
    expect(xml).toContain('<name>Grafite Teste</name>');
    expect(xml).toContain(
      '<arguments>--env-file="C:\\Grafite\\teste\\config.env" "C:\\Grafite\\teste\\atual\\apps\\api\\src\\servidor.ts"</arguments>',
    );
    expect(xml).toContain('<logpath>C:\\Grafite\\teste\\logs</logpath>');
    expect(xml).toContain('em 127.0.0.1:3001');
  });

  it('o coletor, com o coletor.env da produção', () => {
    const xml = xmlDoWinSW(definicaoDoServico('coletor', 'C:\\Grafite', FERRAMENTAS));
    expect(xml).toContain('<id>grafite-coletor</id>');
    expect(xml).toContain('<name>Grafite Coletor</name>');
    expect(xml).toContain(
      '<arguments>--env-file="C:\\Grafite\\producao\\coletor.env" "C:\\Grafite\\producao\\atual\\apps\\collector\\src\\servidor.ts"</arguments>',
    );
    expect(xml).toContain('<logpath>C:\\Grafite\\producao\\logs</logpath>');
  });

  it('o proxy, o Caddy com o Caddyfile e o config.env do token', () => {
    const xml = xmlDoWinSW(definicaoDoServico('proxy', 'C:\\Grafite', FERRAMENTAS));
    expect(xml).toContain('<id>grafite-proxy</id>');
    expect(xml).toContain('<name>Grafite Proxy</name>');
    expect(xml).toContain(
      '<executable>C:\\Grafite\\versoes\\0.4.0\\ferramentas\\caddy.exe</executable>',
    );
    expect(xml).toContain(
      '<arguments>run --config "C:\\Grafite\\caddy\\Caddyfile" --adapter caddyfile --envfile "C:\\Grafite\\caddy\\config.env"</arguments>',
    );
    expect(xml).toContain('<workingdirectory>C:\\Grafite\\caddy</workingdirectory>');
    expect(xml).toContain('<logpath>C:\\Grafite\\caddy\\logs</logpath>');
  });

  it('escapa o que o XML não aceita cru', () => {
    const xml = xmlDoWinSW({
      ...definicaoDoServico('api-producao', 'C:\\Grafite & Cia', FERRAMENTAS),
    });
    expect(xml).toContain('C:\\Grafite &amp; Cia\\producao\\config.env');
    expect(xml).toContain('"C:\\Grafite &amp; Cia\\producao\\atual');
  });
});

interface Chamada {
  arquivo: string;
  argumentos: string[];
}

/** Um executor que responde em ordem e anota cada chamada. */
function executorSimulado(...respostas: { codigo: number; saida?: string; erro?: string }[]) {
  const chamadas: Chamada[] = [];
  const executar: ExecutarProcesso = async (arquivo, argumentos) => {
    chamadas.push({ arquivo, argumentos });
    const resposta = respostas.shift() ?? { codigo: 0 };
    return { codigo: resposta.codigo, saida: resposta.saida ?? '', erro: resposta.erro ?? '' };
  };
  return { chamadas, executar };
}

const consulta = (estado: string) => ({
  codigo: 0,
  saida: `\r\nSERVICE_NAME: grafite\r\n        TYPE               : 10  WIN32_OWN_PROCESS\r\n        STATE              : ${estado}\r\n`,
});

describe('servicosDoWindows', () => {
  let pasta: string;

  beforeEach(async () => {
    pasta = await mkdtemp(join(tmpdir(), 'grafite-servicos-'));
  });

  afterEach(async () => {
    await rm(pasta, { recursive: true, force: true });
  });

  it('registra o serviço: o XML e o WinSW com o nome dele, e o install', async () => {
    const winsw = join(pasta, 'WinSW.exe');
    await writeFile(winsw, 'binário do WinSW');
    const { chamadas, executar } = executorSimulado(
      { codigo: 1060, saida: 'O serviço especificado não existe como serviço instalado.' },
      { codigo: 0 },
      consulta('1  STOPPED'),
    );
    const servicos = servicosDoWindows({
      executar,
      pastaDosServicos: join(pasta, 'servicos'),
      winsw,
      esperar: async () => {},
    });
    const definicao = definicaoDoServico('api-producao', 'C:\\Grafite', FERRAMENTAS);
    await servicos.registrar(definicao);
    expect((await readdir(join(pasta, 'servicos'))).sort()).toEqual(['grafite.exe', 'grafite.xml']);
    expect(await readFile(join(pasta, 'servicos', 'grafite.xml'), 'utf8')).toBe(
      xmlDoWinSW(definicao),
    );
    expect(chamadas).toEqual([
      { arquivo: 'sc.exe', argumentos: ['query', 'grafite'] },
      { arquivo: join(pasta, 'servicos', 'grafite.exe'), argumentos: ['install'] },
    ]);
    // Registrar de novo só atualiza o XML: o serviço já existe.
    await servicos.registrar(definicao);
    expect(chamadas).toHaveLength(3);
  });

  it('inicia e espera o serviço rodar', async () => {
    const { chamadas, executar } = executorSimulado(
      { codigo: 0 },
      consulta('2  START_PENDING'),
      consulta('4  RUNNING'),
    );
    const servicos = servicosDoWindows({
      executar,
      pastaDosServicos: pasta,
      winsw: '',
      esperar: async () => {},
    });
    await servicos.iniciar('grafite');
    expect(chamadas).toEqual([
      { arquivo: 'sc.exe', argumentos: ['start', 'grafite'] },
      { arquivo: 'sc.exe', argumentos: ['query', 'grafite'] },
      { arquivo: 'sc.exe', argumentos: ['query', 'grafite'] },
    ]);
  });

  it('para e espera o serviço parar; o já parado não é erro', async () => {
    const { chamadas, executar } = executorSimulado(
      { codigo: 0 },
      consulta('3  STOP_PENDING'),
      consulta('1  STOPPED'),
      { codigo: 1062, saida: 'O serviço não foi iniciado.' },
      consulta('1  STOPPED'),
    );
    const servicos = servicosDoWindows({
      executar,
      pastaDosServicos: pasta,
      winsw: '',
      esperar: async () => {},
    });
    await servicos.parar('grafite');
    await servicos.parar('grafite');
    expect(chamadas.map((c) => c.argumentos[0])).toEqual([
      'stop',
      'query',
      'query',
      'stop',
      'query',
    ]);
  });

  it('diz o estado, e o serviço que não existe fica ausente', async () => {
    const { executar } = executorSimulado(consulta('4  RUNNING'), consulta('1  STOPPED'), {
      codigo: 1060,
      saida: 'O serviço especificado não existe como serviço instalado.',
    });
    const servicos = servicosDoWindows({
      executar,
      pastaDosServicos: pasta,
      winsw: '',
      esperar: async () => {},
    });
    await expect(servicos.estado('grafite')).resolves.toBe('rodando');
    await expect(servicos.estado('grafite')).resolves.toBe('parado');
    await expect(servicos.estado('grafite')).resolves.toBe('ausente');
  });

  it('desiste de esperar o serviço que não sobe, com o nome dele', async () => {
    const { executar } = executorSimulado(
      { codigo: 0 },
      ...Array.from({ length: 200 }, () => consulta('2  START_PENDING')),
    );
    const servicos = servicosDoWindows({
      executar,
      pastaDosServicos: pasta,
      winsw: '',
      esperar: async () => {},
      tentativas: 5,
    });
    await expect(servicos.iniciar('grafite')).rejects.toThrow(
      'O serviço grafite não ficou rodando a tempo. Veja o log dele na pasta logs.',
    );
  });

  it('a falha do sc.exe ao iniciar vem com a saída dele', async () => {
    const { executar } = executorSimulado({ codigo: 1053, saida: 'O serviço não respondeu.' });
    const servicos = servicosDoWindows({
      executar,
      pastaDosServicos: pasta,
      winsw: '',
      esperar: async () => {},
    });
    await expect(servicos.iniciar('grafite')).rejects.toThrow(
      'Não foi possível iniciar o serviço grafite: O serviço não respondeu.',
    );
  });
});

describe('configurarServicoDoWindows', () => {
  it('dá o nome, a descrição e o reinício depois de uma falha ao serviço registrado fora do WinSW', async () => {
    const { chamadas, executar } = executorSimulado();
    await expect(
      configurarServicoDoWindows(executar, 'grafite-postgresql-teste', {
        nome: 'Grafite PostgreSQL Teste',
        descricao: 'O PostgreSQL do teste.',
      }),
    ).resolves.toBe(true);
    expect(chamadas).toEqual([
      {
        arquivo: 'sc.exe',
        argumentos: [
          'config',
          'grafite-postgresql-teste',
          'DisplayName=',
          'Grafite PostgreSQL Teste',
        ],
      },
      {
        arquivo: 'sc.exe',
        argumentos: ['description', 'grafite-postgresql-teste', 'O PostgreSQL do teste.'],
      },
      {
        arquivo: 'sc.exe',
        argumentos: [
          'failure',
          'grafite-postgresql-teste',
          'reset=',
          '86400',
          'actions=',
          'restart/10000/restart/10000/restart/60000',
        ],
      },
    ]);
  });

  it('só o reinício, sem o nome; o serviço que não existe devolve false', async () => {
    const { chamadas, executar } = executorSimulado({
      codigo: 1060,
      saida: 'O serviço especificado não existe como serviço instalado.',
    });
    await expect(configurarServicoDoWindows(executar, 'postgresql-x64-18')).resolves.toBe(false);
    expect(chamadas.map((c) => c.argumentos[0])).toEqual(['failure']);
  });

  it('outra falha do sc.exe para com a saída dele', async () => {
    const { executar } = executorSimulado({ codigo: 5, saida: 'Acesso negado.' });
    await expect(configurarServicoDoWindows(executar, 'postgresql-x64-18')).rejects.toThrow(
      'Não foi possível configurar o serviço postgresql-x64-18: Acesso negado.',
    );
  });
});
