// O pacote da versão para Linux (spec operacao-em-linux, "Pacote da versão para Linux"; change
// servidor-linux-com-docker, design, decisão 6), com uma pasta de exemplo no lugar do repositório e
// o Docker simulado: o tar, lido pelo tar do sistema, com os scripts executáveis, e o pacote.json,
// que o comando de operação confere como no servidor.
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { type ExecutarProcesso, sha256DoArquivo } from '@grafite/operacao';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { conferirPacoteDoLinux } from '../src/linux/pacote.ts';
import { BASH, noBash, temBash } from '../test/bash.ts';
import {
  argumentosDoBuild,
  type DockerDoEmpacotamento,
  empacotarLinux,
  escreverTar,
} from './empacotar-linux.ts';

const executar = promisify(execFile);

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-empacotar-linux-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

/** O tar do sistema, pelo bash: o mesmo que o servidor usa. */
const tarDoSistema: ExecutarProcesso = async (_arquivo, argumentos) => {
  try {
    const { stdout, stderr } = await executar(BASH, [
      '-c',
      'tar "$@"',
      'tar',
      ...argumentos.map((argumento) => (argumento.includes('\\') ? noBash(argumento) : argumento)),
    ]);
    return { codigo: 0, saida: stdout, erro: stderr };
  } catch (falha) {
    const { code, stdout, stderr } = falha as { code: number; stdout: string; stderr: string };
    return { codigo: code, saida: stdout, erro: stderr };
  }
};

const listar = async (tar: string) => (await tarDoSistema('tar', ['-tvf', tar], { env: {} })).saida;
const ler = async (tar: string, nome: string) =>
  (await tarDoSistema('tar', ['-xOf', tar, nome], { env: {} })).saida;

// As imagens base vêm sempre do registro, e nunca de uma etiqueta que a máquina já tinha (change
// ci-nos-executores-do-github, design, decisão 8).
describe('o docker build de cada estágio', () => {
  it('puxa as imagens base do registro, com o estágio e a etiqueta da versão', () => {
    expect(argumentosDoBuild('banco', 'grafite/banco:1.4.0', '/repositorio')).toEqual([
      'build',
      '--pull',
      '--target',
      'banco',
      '-t',
      'grafite/banco:1.4.0',
      '/repositorio',
    ]);
  });
});

describe.runIf(temBash)('o tar', () => {
  it('leva cada arquivo com o modo dele, inclusive o vazio e o de mais de um bloco, e o tar do sistema o lê', async () => {
    const arquivos = {
      'pacote.json': '{"versao":"1.4.0"}\n',
      'instalar.sh': '#!/usr/bin/env bash\necho instalar\n',
      vazio: '',
      'docs/operacao/runbook.md': `# Runbook\n${'linha do runbook\n'.repeat(100)}`,
    };
    for (const [nome, conteudo] of Object.entries(arquivos)) {
      await mkdir(dirname(join(pasta, nome)), { recursive: true });
      await writeFile(join(pasta, nome), conteudo);
    }
    const tar = join(pasta, 'pacote.tar');

    await escreverTar(
      tar,
      Object.keys(arquivos).map((nome) => ({
        nome,
        de: join(pasta, nome),
        modo: nome.endsWith('.sh') ? 0o755 : 0o644,
      })),
      new Date('2026-10-23T12:00:00.000Z'),
    );

    const lista = await listar(tar);
    expect(lista).toMatch(/^-rw-r--r-- root\/root +19 2026-10-23 \d\d:\d\d pacote\.json$/m);
    expect(lista).toMatch(/^-rwxr-xr-x root\/root +\d+ .* instalar\.sh$/m);
    expect(lista).toMatch(/^-rw-r--r-- root\/root +0 .* vazio$/m);
    for (const [nome, conteudo] of Object.entries(arquivos)) {
      expect(await ler(tar, nome)).toBe(conteudo);
    }
  });
});

/** O repositório de exemplo: a versão da API, os scripts do Linux e o runbook. */
async function repositorioDeExemplo(versaoDaApi = '1.4.0') {
  const repositorio = join(pasta, 'repositorio');
  const arquivos: Record<string, string> = {
    'apps/api/package.json': JSON.stringify({ name: '@grafite/api', version: versaoDaApi }),
    'apps/operacao/lancadores/grafite': '#!/usr/bin/env bash\necho o lançador\n',
    'apps/operacao/lancadores/instalar.sh': '#!/usr/bin/env bash\necho a instalação\n',
    'docs/operacao/runbook.md': '# Runbook da operação\n',
  };
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    await mkdir(dirname(join(repositorio, nome)), { recursive: true });
    await writeFile(join(repositorio, nome), conteudo);
  }
  return repositorio;
}

const ID = (letra: string) => `sha256:${letra.repeat(64)}`;
const IDS: Record<string, string> = {
  aplicacao: ID('a'),
  coletor: ID('c'),
  operacao: ID('d'),
  proxy: ID('e'),
  banco: ID('b'),
};

/** O Docker simulado, com as imagens da versão e o que foi construído e salvo. */
function dockerSimulado(versao: string, { semImagem }: { semImagem?: string } = {}) {
  const eventos: string[] = [];
  const docker: DockerDoEmpacotamento = {
    async idDaImagem(imagem) {
      const [nome, etiqueta] = imagem.replace('grafite/', '').split(':');
      if (nome === semImagem || etiqueta !== versao) return null;
      return IDS[nome ?? ''] ?? null;
    },
    async construir(alvo, imagem) {
      eventos.push(`build ${alvo} ${imagem}`);
    },
    async salvar(imagens, destino) {
      eventos.push(`save ${imagens.join(' ')}`);
      await writeFile(destino, 'as imagens comprimidas');
    },
  };
  return { docker, eventos };
}

describe.runIf(temBash)('o pacote para Linux', () => {
  it('leva as imagens, o pacote.json, os scripts executáveis e o runbook, e o comando o confere', async () => {
    const repositorio = await repositorioDeExemplo();
    const saida = join(pasta, 'saida');
    const { docker, eventos } = dockerSimulado('1.4.0');

    const pronto = await empacotarLinux({
      repositorio,
      versao: '1.4.0',
      saida,
      docker,
      escrever: () => {},
    });

    expect(basename(pronto.tar)).toBe('grafite-1.4.0-linux-x64.tar');
    expect(eventos).toEqual([
      'save grafite/aplicacao:1.4.0 grafite/coletor:1.4.0 grafite/operacao:1.4.0 grafite/proxy:1.4.0 grafite/banco:1.4.0',
    ]);
    const lista = await listar(pronto.tar);
    expect(
      lista
        .trim()
        .split('\n')
        .map((linha) => `${linha.slice(0, 10)} ${linha.split(' ').at(-1)}`),
    ).toEqual([
      '-rw-r--r-- pacote.json',
      '-rw-r--r-- imagens.tar.gz',
      '-rwxr-xr-x instalar.sh',
      '-rwxr-xr-x grafite',
      '-rw-r--r-- docs/operacao/runbook.md',
    ]);
    expect(await ler(pronto.tar, 'imagens.tar.gz')).toBe('as imagens comprimidas');
    expect(await ler(pronto.tar, 'grafite')).toBe('#!/usr/bin/env bash\necho o lançador\n');
    expect(await readFile(`${pronto.tar}.sha256`, 'utf8')).toBe(
      `${await sha256DoArquivo(pronto.tar)}  grafite-1.4.0-linux-x64.tar\n`,
    );
    // O roteiro de instalação também fica ao lado do pacote, para a release, igual ao de dentro.
    expect(await ler(pronto.tar, 'instalar.sh')).toBe('#!/usr/bin/env bash\necho a instalação\n');
    expect(await readFile(join(saida, 'instalar.sh'), 'utf8')).toBe(
      await ler(pronto.tar, 'instalar.sh'),
    );
    // O comando de operação confere o hash e lê a descrição, como no servidor.
    await expect(conferirPacoteDoLinux(pronto.tar, { executar: tarDoSistema })).resolves.toEqual({
      versao: '1.4.0',
      plataforma: 'linux',
      imagens: ['aplicacao', 'coletor', 'operacao', 'proxy', 'banco'],
    });
  });

  it('com o construir, constrói cada imagem pelo estágio do Dockerfile, com a etiqueta da versão', async () => {
    const repositorio = await repositorioDeExemplo();
    const { docker, eventos } = dockerSimulado('1.4.0');
    await empacotarLinux({
      repositorio,
      versao: '1.4.0',
      saida: join(pasta, 'saida'),
      construir: true,
      docker,
      escrever: () => {},
    });
    expect(eventos.slice(0, 5)).toEqual([
      'build aplicacao grafite/aplicacao:1.4.0',
      'build coletor grafite/coletor:1.4.0',
      'build operacao grafite/operacao:1.4.0',
      'build proxy grafite/proxy:1.4.0',
      'build banco grafite/banco:1.4.0',
    ]);
  });

  it('recusa a versão que não é a da API e a imagem que falta no Docker', async () => {
    const repositorio = await repositorioDeExemplo('1.5.0');
    await expect(
      empacotarLinux({
        repositorio,
        versao: '1.4.0',
        saida: join(pasta, 'saida'),
        docker: dockerSimulado('1.4.0').docker,
        escrever: () => {},
      }),
    ).rejects.toThrow('A versão pedida, 1.4.0, não é a da API, 1.5.0');

    const daVersao = await repositorioDeExemplo('1.4.0');
    await expect(
      empacotarLinux({
        repositorio: daVersao,
        versao: '1.4.0',
        saida: join(pasta, 'saida'),
        docker: dockerSimulado('1.4.0', { semImagem: 'proxy' }).docker,
        escrever: () => {},
      }),
    ).rejects.toThrow(
      'Falta a imagem grafite/proxy:1.4.0 no Docker: construa-a com docker build --target proxy -t grafite/proxy:1.4.0 . ou rode com --construir.',
    );
  });
});
