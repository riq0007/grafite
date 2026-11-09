import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type EstadoDaInstalacao, gravarEstado, lerEstado } from './estado.ts';

let raiz: string;

beforeEach(async () => {
  raiz = await mkdtemp(join(tmpdir(), 'grafite-estado-'));
});

afterEach(async () => {
  await rm(raiz, { recursive: true, force: true });
});

const estado = (): EstadoDaInstalacao => ({
  raiz,
  plataforma: 'windows',
  ambientes: {
    producao: {
      enderecos: ['grafite.empresa.local'],
      porta: 3000,
      atual: '0.4.0',
      anterior: '0.3.2',
    },
    teste: {
      enderecos: ['grafite-teste.empresa.local'],
      porta: 3001,
      atual: '0.4.1',
      anterior: '0.4.0',
    },
  },
  mapaDoTeste: { 'grafite.empresa.local': 'grafite-teste.empresa.local' },
  certificado: { modo: 'interno', ac: 'caddy' },
  versoes: ['0.3.2', '0.4.0', '0.4.1'],
  pgBin: 'C:\\Program Files\\PostgreSQL\\18\\bin',
});

describe('estado da instalação', () => {
  it('grava e lê de volta o operacao.json da raiz', async () => {
    await gravarEstado(estado());
    await expect(lerEstado(raiz)).resolves.toEqual(estado());
    expect(await readdir(raiz)).toEqual(['operacao.json']);
  });

  it('guarda os modos do certificado: o público e o da AC da empresa', async () => {
    const publico = {
      ...estado(),
      certificado: { modo: 'publico', email: 'ti@empresa.com.br', provedorDns: 'cloudflare' },
    } satisfies EstadoDaInstalacao;
    await gravarEstado(publico);
    await expect(lerEstado(raiz)).resolves.toEqual(publico);
    const daEmpresa = {
      ...estado(),
      certificado: {
        modo: 'interno',
        ac: 'empresa',
        certificado: 'C:\\Grafite\\caddy\\grafite.crt',
        chave: 'C:\\Grafite\\caddy\\grafite.key',
      },
    } satisfies EstadoDaInstalacao;
    await gravarEstado(daEmpresa);
    await expect(lerEstado(raiz)).resolves.toEqual(daEmpresa);
  });

  it('o estado de antes da plataforma é lido como o do Windows', async () => {
    const { plataforma: _, ...deAntes } = estado();
    await writeFile(join(raiz, 'operacao.json'), JSON.stringify(deAntes));
    await expect(lerEstado(raiz)).resolves.toEqual({ ...estado(), plataforma: 'windows' });
  });

  it('guarda a instalação do Linux, com as ferramentas do PostgreSQL da imagem', async () => {
    const doLinux = {
      ...estado(),
      plataforma: 'linux',
      pgBin: '/usr/lib/postgresql/18/bin',
    } satisfies EstadoDaInstalacao;
    await gravarEstado(doLinux);
    await expect(lerEstado(raiz)).resolves.toEqual(doLinux);
  });

  it('a raiz sem operacao.json ainda não tem instalação', async () => {
    await expect(lerEstado(raiz)).resolves.toBeNull();
  });

  it('recusa o operacao.json que não é válido', async () => {
    await writeFile(join(raiz, 'operacao.json'), '{"raiz": 1}');
    await expect(lerEstado(raiz)).rejects.toThrow(
      `O operacao.json de ${raiz} não é válido; confira o arquivo ou refaça a instalação.`,
    );
  });

  it('não grava nenhum segredo, só o que o estado tem', async () => {
    await gravarEstado(estado());
    const texto = await readFile(join(raiz, 'operacao.json'), 'utf8');
    expect(texto).not.toMatch(/senha|password|token|postgres:\/\//i);
  });
});
