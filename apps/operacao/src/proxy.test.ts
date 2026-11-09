import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExecutarProcesso } from '@grafite/operacao';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EstadoDaInstalacao } from './estado.ts';
import { configurarProxy, exportarRaiz, gerarCaddyfile } from './proxy.ts';
import type { Servicos } from './windows/servicos.ts';

const estado = (
  certificado: EstadoDaInstalacao['certificado'],
  raiz = 'C:\\Grafite',
): EstadoDaInstalacao => ({
  raiz,
  plataforma: 'windows',
  ambientes: {
    producao: {
      enderecos: ['grafite.empresa.com.br', 'grafite.matriz.empresa.com.br'],
      porta: 3000,
      atual: '0.4.0',
      anterior: null,
    },
    teste: {
      enderecos: ['grafite-teste.empresa.com.br'],
      porta: 3001,
      atual: '0.4.0',
      anterior: null,
    },
  },
  mapaDoTeste: { 'grafite.empresa.com.br': 'grafite-teste.empresa.com.br' },
  certificado,
  versoes: ['0.4.0'],
  pgBin: 'C:\\Program Files\\PostgreSQL\\18\\bin',
});

describe('gerarCaddyfile', () => {
  it("no modo público, o Let's Encrypt pelo DNS da Cloudflare, um site por endereço e o HSTS só na produção", () => {
    expect(
      gerarCaddyfile(
        estado({ modo: 'publico', email: 'ti@empresa.com.br', provedorDns: 'cloudflare' }),
      ),
    ).toBe(
      [
        '# Gerado por "grafite proxy configurar" a partir do operacao.json. Não edite: rode o comando de novo.',
        '{',
        '\tadmin off',
        '\temail ti@empresa.com.br',
        '\tstorage file_system {',
        '\t\troot C:/Grafite/caddy/dados',
        '\t}',
        '}',
        '',
        'grafite.empresa.com.br {',
        '\ttls {',
        '\t\tdns cloudflare {env.CLOUDFLARE_API_TOKEN}',
        '\t}',
        '\theader Strict-Transport-Security "max-age=31536000"',
        '\treverse_proxy 127.0.0.1:3000',
        '}',
        '',
        'grafite.matriz.empresa.com.br {',
        '\ttls {',
        '\t\tdns cloudflare {env.CLOUDFLARE_API_TOKEN}',
        '\t}',
        '\theader Strict-Transport-Security "max-age=31536000"',
        '\treverse_proxy 127.0.0.1:3000',
        '}',
        '',
        'grafite-teste.empresa.com.br {',
        '\ttls {',
        '\t\tdns cloudflare {env.CLOUDFLARE_API_TOKEN}',
        '\t}',
        '\treverse_proxy 127.0.0.1:3001',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('no modo interno, a AC do próprio Caddy, sem instalar a raiz no servidor', () => {
    const caddyfile = gerarCaddyfile(estado({ modo: 'interno', ac: 'caddy' }));
    expect(caddyfile).toContain(
      [
        '{',
        '\tadmin off',
        '\tskip_install_trust',
        '\tstorage file_system {',
        '\t\troot C:/Grafite/caddy/dados',
        '\t}',
        '}',
      ].join('\n'),
    );
    expect(caddyfile).toContain(
      [
        'grafite.empresa.com.br {',
        '\ttls internal',
        '\theader Strict-Transport-Security "max-age=31536000"',
        '\treverse_proxy 127.0.0.1:3000',
        '}',
      ].join('\n'),
    );
    expect(caddyfile).toContain(
      [
        'grafite-teste.empresa.com.br {',
        '\ttls internal',
        '\treverse_proxy 127.0.0.1:3001',
        '}',
      ].join('\n'),
    );
    expect(caddyfile).not.toContain('email');
  });

  it('no modo interno com a AC da empresa, os arquivos do certificado', () => {
    const caddyfile = gerarCaddyfile(
      estado({
        modo: 'interno',
        ac: 'empresa',
        certificado: 'C:\\Grafite\\caddy\\grafite.crt',
        chave: 'C:\\Grafite\\caddy\\grafite.key',
      }),
    );
    expect(caddyfile).toContain(
      '\ttls C:/Grafite/caddy/grafite.crt C:/Grafite/caddy/grafite.key\n',
    );
    expect(caddyfile).not.toContain('tls internal');
  });

  it('no Linux, os dados na pasta montada no proxy e cada app pelo nome do serviço', () => {
    const caddyfile = gerarCaddyfile({
      ...estado({ modo: 'interno', ac: 'caddy' }, '/opt/grafite'),
      plataforma: 'linux',
    });
    expect(caddyfile).toContain('\t\troot /opt/grafite/caddy/dados\n');
    expect(caddyfile).toContain(
      [
        'grafite.empresa.com.br {',
        '\ttls internal',
        '\theader Strict-Transport-Security "max-age=31536000"',
        '\treverse_proxy app-producao:3000',
        '}',
      ].join('\n'),
    );
    expect(caddyfile).toContain(
      [
        'grafite-teste.empresa.com.br {',
        '\ttls internal',
        '\treverse_proxy app-teste:3001',
        '}',
      ].join('\n'),
    );
    expect(caddyfile).not.toContain('127.0.0.1');
  });
});

describe('grafite proxy', () => {
  let raiz: string;
  let chamadas: { arquivo: string; argumentos: string[] }[];
  let ordem: string[];

  beforeEach(async () => {
    raiz = await mkdtemp(join(tmpdir(), 'grafite-proxy-'));
    await mkdir(join(raiz, 'caddy'));
    chamadas = [];
    ordem = [];
  });

  afterEach(async () => {
    await rm(raiz, { recursive: true, force: true });
  });

  const servicos: Servicos = {
    registrar: async () => {},
    iniciar: async (id) => {
      ordem.push(`iniciar ${id}`);
    },
    parar: async (id) => {
      ordem.push(`parar ${id}`);
    },
    estado: async () => 'rodando',
  };

  const executor =
    (codigo: number, erro = ''): ExecutarProcesso =>
    async (arquivo, argumentos) => {
      chamadas.push({ arquivo, argumentos });
      return { codigo, saida: '', erro };
    };

  it('configurar grava o Caddyfile, confere com o caddy validate e reinicia o proxy', async () => {
    const instalado = estado({ modo: 'interno', ac: 'caddy' }, raiz);
    await configurarProxy({
      estado: instalado,
      executar: executor(0),
      servicos,
      caddy: join(raiz, 'caddy', 'caddy.exe'),
    });
    const caddyfile = join(raiz, 'caddy', 'Caddyfile');
    expect(await readFile(caddyfile, 'utf8')).toBe(gerarCaddyfile(instalado));
    expect(chamadas).toEqual([
      {
        arquivo: join(raiz, 'caddy', 'caddy.exe'),
        argumentos: ['validate', '--config', `${caddyfile}.novo`, '--adapter', 'caddyfile'],
      },
    ]);
    expect(ordem).toEqual(['parar grafite-proxy', 'iniciar grafite-proxy']);
  });

  it('o Caddyfile recusado pelo caddy validate não troca o atual nem reinicia', async () => {
    const caddyfile = join(raiz, 'caddy', 'Caddyfile');
    await writeFile(caddyfile, 'o Caddyfile que funcionava');
    await expect(
      configurarProxy({
        estado: estado({ modo: 'interno', ac: 'caddy' }, raiz),
        executar: executor(1, 'Error: adapting config using caddyfile: unknown directive'),
        servicos,
        caddy: 'caddy.exe',
      }),
    ).rejects.toThrow(
      'O Caddy recusou a configuração nova, e a atual continua: Error: adapting config using caddyfile: unknown directive',
    );
    expect(await readFile(caddyfile, 'utf8')).toBe('o Caddyfile que funcionava');
    expect(ordem).toEqual([]);
  });

  it('raiz copia o certificado raiz da AC do Caddy para o destino', async () => {
    const pki = join(raiz, 'caddy', 'dados', 'pki', 'authorities', 'local');
    await mkdir(pki, { recursive: true });
    await writeFile(join(pki, 'root.crt'), '-----BEGIN CERTIFICATE-----');
    const destino = join(raiz, 'distribuir');
    await mkdir(destino);
    const copiado = await exportarRaiz(estado({ modo: 'interno', ac: 'caddy' }, raiz), destino);
    expect(copiado).toBe(join(destino, 'grafite-raiz.crt'));
    expect(await readFile(copiado, 'utf8')).toBe('-----BEGIN CERTIFICATE-----');
  });

  it.each([
    [
      { modo: 'publico', email: 'ti@empresa.com.br', provedorDns: 'cloudflare' } as const,
      "O modo público usa o Let's Encrypt, em que todo dispositivo já confia: não há raiz para distribuir.",
    ],
    [
      { modo: 'interno', ac: 'empresa', certificado: 'a.crt', chave: 'a.key' } as const,
      'O certificado é da AC da empresa: distribua a raiz dela.',
    ],
  ])('raiz explica por que não há o que copiar no modo %j', async (certificado, mensagem) => {
    await expect(exportarRaiz(estado(certificado, raiz), raiz)).rejects.toThrow(mensagem);
  });

  it('raiz antes de o proxy gerar a AC diz o que fazer', async () => {
    await expect(
      exportarRaiz(estado({ modo: 'interno', ac: 'caddy' }, raiz), raiz),
    ).rejects.toThrow(
      'O proxy ainda não gerou a raiz: inicie o serviço Grafite Proxy e tente de novo.',
    );
  });
});
