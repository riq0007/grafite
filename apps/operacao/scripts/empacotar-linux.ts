// O pacote da versão para Linux (spec operacao-em-linux, "Pacote da versão para Linux"; change
// servidor-linux-com-docker, design, decisão 6): o tar que o CI publica na release, com o .sha256 ao
// lado. O servidor não compila nem baixa nada, então o pacote leva:
// - imagens.tar.gz: o docker save das cinco imagens da versão, com a etiqueta grafite/<nome>:x.y.z;
// - pacote.json: a versão e as imagens que ele leva, que o comando confere na carga;
// - o instalar.sh e o lançador grafite, executáveis;
// - o runbook.
// Ao lado do tar, uma cópia do instalar.sh, que a release publica com o pacote e o .sha256 (change
// instalar-sh-na-release, design, decisão 1).
// As imagens saem dos estágios do Dockerfile, construídas antes ou pelo --construir. O tar é escrito
// aqui, no formato ustar, para os scripts irem executáveis mesmo quando o pacote é montado no
// Windows, que não guarda o modo dos arquivos.
// Uso: node apps/operacao/scripts/empacotar-linux.ts --versao <x.y.z> --saida <pasta> [--construir]
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createGzip } from 'node:zlib';
import { executarProcesso, formatarTamanho, sha256DoArquivo } from '@grafite/operacao';
import {
  type DescricaoDoPacoteDoLinux,
  IMAGENS_DO_PACOTE,
  imagemDaVersao,
} from '../src/linux/pacote.ts';
import { conferirVersao } from './empacotar.ts';

export const nomeDoPacoteDoLinux = (versao: string) => `grafite-${versao}-linux-x64.tar`;

/** Um arquivo do tar: o nome nele, o arquivo de onde vem e o modo. */
export interface EntradaDoTar {
  nome: string;
  de: string;
  modo: number;
}

const BLOCO = 512;

/** O cabeçalho ustar de um arquivo comum do root, com a soma de conferência. */
function cabecalho(nome: string, tamanho: number, modo: number, momento: Date): Buffer {
  if (Buffer.byteLength(nome) > 100) throw new Error(`O nome ${nome} não cabe no tar.`);
  const bloco = Buffer.alloc(BLOCO);
  const campo = (texto: string, inicio: number, tamanhoDoCampo: number) => {
    bloco.write(texto, inicio, tamanhoDoCampo, 'utf8');
  };
  // Os números em octal, com o zero do fim do campo, que o Buffer.alloc já deixou.
  const octal = (valor: number, tamanhoDoCampo: number) =>
    valor.toString(8).padStart(tamanhoDoCampo - 1, '0');
  campo(nome, 0, 100);
  campo(octal(modo, 8), 100, 8);
  campo(octal(0, 8), 108, 8);
  campo(octal(0, 8), 116, 8);
  campo(octal(tamanho, 12), 124, 12);
  campo(octal(Math.floor(momento.getTime() / 1000), 12), 136, 12);
  campo(' '.repeat(8), 148, 8);
  campo('0', 156, 1);
  campo('ustar\0', 257, 6);
  campo('00', 263, 2);
  campo('root', 265, 32);
  campo('root', 297, 32);
  const soma = bloco.reduce((total, byte) => total + byte, 0);
  campo(`${soma.toString(8).padStart(6, '0')}\0 `, 148, 8);
  return bloco;
}

/** Escreve o tar com os arquivos, na ordem, cada um lido aos pedaços, sem caber na memória. */
export async function escreverTar(
  destino: string,
  entradas: readonly EntradaDoTar[],
  momento = new Date(),
): Promise<void> {
  const saida = createWriteStream(destino);
  const escrever = (dados: Buffer) =>
    new Promise<void>((resolver, rejeitar) => {
      saida.write(dados, (erro) => (erro ? rejeitar(erro) : resolver()));
    });
  try {
    for (const { nome, de, modo } of entradas) {
      const { size } = await stat(de);
      await escrever(cabecalho(nome, size, modo, momento));
      for await (const pedaco of createReadStream(de)) await escrever(pedaco as Buffer);
      const resto = size % BLOCO;
      if (resto !== 0) await escrever(Buffer.alloc(BLOCO - resto));
    }
    // O fim do tar: dois blocos vazios.
    await escrever(Buffer.alloc(BLOCO * 2));
  } finally {
    await new Promise<void>((resolver) => {
      saida.end(resolver);
    });
  }
}

/** O Docker de quem monta o pacote, que os testes simulam. */
export interface DockerDoEmpacotamento {
  /** O identificador da imagem, ou `null` sem ela. */
  idDaImagem(imagem: string): Promise<string | null>;
  /** Constrói a imagem pelo estágio do Dockerfile do repositório. */
  construir(alvo: string, imagem: string, repositorio: string): Promise<void>;
  /** O docker save das imagens, comprimido no destino. */
  salvar(imagens: readonly string[], destino: string): Promise<void>;
}

/**
 * Os argumentos do docker build de um estágio do Dockerfile. O --pull traz as imagens base do
 * registro, e nunca de uma etiqueta que a máquina já tinha (change ci-nos-executores-do-github,
 * design, decisão 8).
 */
export function argumentosDoBuild(alvo: string, imagem: string, repositorio: string): string[] {
  return ['build', '--pull', '--target', alvo, '-t', imagem, repositorio];
}

export const dockerDoSistema: DockerDoEmpacotamento = {
  async idDaImagem(imagem) {
    const { codigo, saida } = await executarProcesso(
      'docker',
      ['image', 'inspect', '--format', '{{.Id}}', imagem],
      { env: process.env },
    );
    return codigo === 0 ? saida.trim() : null;
  },
  async construir(alvo, imagem, repositorio) {
    const { status } = spawnSync('docker', argumentosDoBuild(alvo, imagem, repositorio), {
      stdio: 'inherit',
    });
    if (status !== 0) throw new Error(`O docker build do estágio ${alvo} falhou.`);
  },
  async salvar(imagens, destino) {
    const docker = spawn('docker', ['save', ...imagens], { stdio: ['ignore', 'pipe', 'inherit'] });
    const fim = new Promise<number>((resolver, rejeitar) => {
      docker.on('error', rejeitar);
      docker.on('close', (codigo) => resolver(codigo ?? 1));
    });
    await pipeline(docker.stdout, createGzip(), createWriteStream(destino));
    if ((await fim) !== 0) throw new Error('O docker save das imagens falhou.');
  },
};

export interface PedidoDoPacoteDoLinux {
  repositorio: string;
  versao: string;
  saida: string;
  /** Constrói as cinco imagens antes, pelos estágios do Dockerfile. */
  construir?: boolean;
  docker?: DockerDoEmpacotamento;
  escrever?: (texto: string) => void;
  agora?: () => Date;
}

export async function empacotarLinux({
  repositorio,
  versao,
  saida,
  construir = false,
  docker = dockerDoSistema,
  escrever = (texto) => process.stdout.write(`${texto}\n`),
  agora = () => new Date(),
}: PedidoDoPacoteDoLinux): Promise<{ tar: string; sha256: string; tamanho: number }> {
  const { version: daApi } = JSON.parse(
    await readFile(join(repositorio, 'apps', 'api', 'package.json'), 'utf8'),
  ) as { version: string };
  conferirVersao(versao, daApi);

  const imagens = IMAGENS_DO_PACOTE.map((nome) => ({ nome, imagem: imagemDaVersao(nome, versao) }));
  if (construir) {
    for (const { nome, imagem } of imagens) {
      escrever(`Construindo ${imagem}...`);
      await docker.construir(nome, imagem, repositorio);
    }
  }
  for (const { nome, imagem } of imagens) {
    if ((await docker.idDaImagem(imagem)) === null) {
      throw new Error(
        `Falta a imagem ${imagem} no Docker: construa-a com docker build --target ${nome} -t ${imagem} . ou rode com --construir.`,
      );
    }
  }

  const montagem = join(saida, `montagem-linux-${versao}`);
  await rm(montagem, { recursive: true, force: true });
  await mkdir(montagem, { recursive: true });
  escrever('Salvando as cinco imagens, comprimidas...');
  await docker.salvar(
    imagens.map(({ imagem }) => imagem),
    join(montagem, 'imagens.tar.gz'),
  );
  const descricao: DescricaoDoPacoteDoLinux = {
    versao,
    plataforma: 'linux',
    imagens: [...IMAGENS_DO_PACOTE],
  };
  await writeFile(join(montagem, 'pacote.json'), `${JSON.stringify(descricao, null, 2)}\n`);

  const lancadores = join(repositorio, 'apps', 'operacao', 'lancadores');
  const tar = join(saida, nomeDoPacoteDoLinux(versao));
  await escreverTar(
    tar,
    [
      { nome: 'pacote.json', de: join(montagem, 'pacote.json'), modo: 0o644 },
      { nome: 'imagens.tar.gz', de: join(montagem, 'imagens.tar.gz'), modo: 0o644 },
      { nome: 'instalar.sh', de: join(lancadores, 'instalar.sh'), modo: 0o755 },
      { nome: 'grafite', de: join(lancadores, 'grafite'), modo: 0o755 },
      {
        nome: 'docs/operacao/runbook.md',
        de: join(repositorio, 'docs', 'operacao', 'runbook.md'),
        modo: 0o644,
      },
    ],
    agora(),
  );
  const sha256 = await sha256DoArquivo(tar);
  await writeFile(`${tar}.sha256`, `${sha256}  ${nomeDoPacoteDoLinux(versao)}\n`);
  const roteiro = join(saida, 'instalar.sh');
  await copyFile(join(lancadores, 'instalar.sh'), roteiro);
  await chmod(roteiro, 0o755);
  await rm(montagem, { recursive: true, force: true });
  const { size: tamanho } = await stat(tar);
  escrever(`Pacote ${tar} (${formatarTamanho(tamanho)}).`);
  escrever(`SHA-256: ${sha256}`);
  escrever(`Roteiro de instalação ao lado: ${roteiro}.`);
  return { tar, sha256, tamanho };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      versao: { type: 'string' },
      saida: { type: 'string' },
      construir: { type: 'boolean' },
    },
  });
  const repositorio = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  if (!values.versao || !values.saida) {
    console.error(
      'Uso: node apps/operacao/scripts/empacotar-linux.ts --versao <x.y.z> --saida <pasta> [--construir]',
    );
    process.exit(2);
  }
  try {
    await empacotarLinux({
      repositorio,
      versao: values.versao,
      saida: resolve(values.saida),
      construir: values.construir === true,
    });
  } catch (erro) {
    console.error(erro instanceof Error ? erro.message : String(erro));
    process.exit(1);
  }
}
