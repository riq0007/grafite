// O pacote da versão para Linux no comando de operação (change servidor-linux-com-docker, design,
// decisões 6 e 8; spec operacao-em-linux, "Pacote da versão para Linux"): o hash conferido antes de
// tudo, o pacote.json lido pelo tar e as imagens carregadas uma vez por versão, conferidas pelas
// etiquetas que o docker load diz ter carregado. A marca da versão guarda o identificador que cada
// imagem ganhou no Docker do servidor, que muda de um Docker para outro.
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExecutarProcesso } from '@grafite/operacao';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { carregarVersao, conferirPacoteDoLinux, type DescricaoDoPacoteDoLinux } from './pacote.ts';

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-pacote-linux-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

const id = (letra: string) => `sha256:${letra.repeat(64)}`;

const DESCRICAO: DescricaoDoPacoteDoLinux = {
  versao: '1.4.0',
  plataforma: 'linux',
  imagens: ['aplicacao', 'coletor', 'operacao', 'proxy', 'banco'],
};

/** O identificador de cada imagem no Docker do servidor simulado, depois da carga. */
const NO_DOCKER: Record<string, string> = {
  aplicacao: id('a'),
  coletor: id('c'),
  operacao: id('d'),
  proxy: id('e'),
  banco: id('b'),
};

/** Um pacote no disco, com o .sha256 do conteúdo, como a release os publica. */
async function pacote(conteudo = 'o tar do pacote', hash?: string) {
  const arquivo = join(pasta, 'grafite-1.4.0-linux-x64.tar');
  await writeFile(arquivo, conteudo);
  const doConteudo = createHash('sha256').update(conteudo).digest('hex');
  await writeFile(`${arquivo}.sha256`, `${hash ?? doConteudo}  grafite-1.4.0-linux-x64.tar\n`);
  return arquivo;
}

/** O tar e o Docker simulados: o tar entrega o pacote.json e o Docker guarda as imagens carregadas. */
function sistemaSimulado({
  descricao = DESCRICAO as unknown,
  carregadas = {} as Record<string, string>,
  daCarga = { ...NO_DOCKER } as Record<string, string>,
} = {}) {
  const comandos: string[] = [];
  const executar: ExecutarProcesso = async (arquivo, argumentos) => {
    comandos.push([arquivo, ...argumentos].join(' '));
    if (arquivo === 'tar' && argumentos.includes('-xOf')) {
      return { codigo: 0, saida: JSON.stringify(descricao), erro: '' };
    }
    if (arquivo === 'tar') {
      const destino = argumentos[argumentos.indexOf('-C') + 1] ?? '';
      await writeFile(join(destino, 'imagens.tar.gz'), 'as imagens');
      return { codigo: 0, saida: '', erro: '' };
    }
    if (arquivo === 'docker' && argumentos[0] === 'load') {
      const linhas = Object.entries(daCarga).map(([nome, imagem]) => {
        carregadas[`grafite/${nome}:1.4.0`] = imagem;
        return `Loaded image: grafite/${nome}:1.4.0`;
      });
      return { codigo: 0, saida: `${linhas.join('\n')}\n`, erro: '' };
    }
    if (arquivo === 'docker' && argumentos[0] === 'image') {
      const imagem = carregadas[argumentos.at(-1) ?? ''];
      return imagem === undefined
        ? { codigo: 1, saida: '', erro: 'Error: No such image' }
        : { codigo: 0, saida: `${imagem}\n`, erro: '' };
    }
    return { codigo: 1, saida: '', erro: `comando inesperado: ${arquivo}` };
  };
  return { comandos, executar, carregadas };
}

describe('o pacote para Linux', () => {
  it('confere o hash e lê o pacote.json pelo tar', async () => {
    const arquivo = await pacote();
    const sistema = sistemaSimulado();
    await expect(conferirPacoteDoLinux(arquivo, { executar: sistema.executar })).resolves.toEqual(
      DESCRICAO,
    );
    expect(sistema.comandos).toEqual([`tar -xOf ${arquivo} pacote.json`]);
  });

  it('Pacote alterado: recusa antes de qualquer mudança, sem abrir o pacote', async () => {
    const arquivo = await pacote('o tar do pacote', 'f'.repeat(64));
    const sistema = sistemaSimulado();
    await expect(conferirPacoteDoLinux(arquivo, { executar: sistema.executar })).rejects.toThrow(
      'O pacote grafite-1.4.0-linux-x64.tar não confere com o hash publicado. Nada foi mudado: baixe o pacote e o .sha256 de novo.',
    );
    expect(sistema.comandos).toEqual([]);
  });

  it('recusa o pacote sem o .sha256 ou com a descrição de outra plataforma', async () => {
    const arquivo = await pacote();
    await rm(`${arquivo}.sha256`);
    await expect(
      conferirPacoteDoLinux(arquivo, { executar: sistemaSimulado().executar }),
    ).rejects.toThrow('Falta o grafite-1.4.0-linux-x64.tar.sha256, publicado com o pacote');
    const doWindows = await pacote();
    const sistema = sistemaSimulado({ descricao: { versao: '1.4.0', links: [] } });
    await expect(conferirPacoteDoLinux(doWindows, { executar: sistema.executar })).rejects.toThrow(
      'O pacote.json de grafite-1.4.0-linux-x64.tar não é o de um pacote para Linux.',
    );
  });
});

describe('a carga das imagens da versão', () => {
  it('carrega as imagens, confere as etiquetas da carga e marca a versão com o identificador de cada uma', async () => {
    const arquivo = await pacote();
    const sistema = sistemaSimulado();
    const versoes = join(pasta, 'versoes');
    await expect(
      carregarVersao({
        pacote: arquivo,
        descricao: DESCRICAO,
        pastaDasVersoes: versoes,
        executar: sistema.executar,
      }),
    ).resolves.toEqual({ jaEstava: false });
    const parcial = join(versoes, '1.4.0.parcial');
    expect(sistema.comandos).toEqual([
      `tar -xf ${arquivo} -C ${parcial} imagens.tar.gz`,
      `docker load --input ${join(parcial, 'imagens.tar.gz')}`,
      ...DESCRICAO.imagens.map(
        (nome) => `docker image inspect --format {{.Id}} grafite/${nome}:1.4.0`,
      ),
    ]);
    expect(JSON.parse(await readFile(join(versoes, '1.4.0', 'pacote.json'), 'utf8'))).toEqual({
      ...DESCRICAO,
      noDocker: NO_DOCKER,
    });
    await expect(readFile(join(versoes, '1.4.0.parcial', 'imagens.tar.gz'))).rejects.toThrow();
  });

  it('a versão já carregada, com as mesmas imagens no Docker, não é carregada de novo', async () => {
    const arquivo = await pacote();
    const sistema = sistemaSimulado();
    const versoes = join(pasta, 'versoes');
    const dados = { pacote: arquivo, descricao: DESCRICAO, pastaDasVersoes: versoes };
    await carregarVersao({ ...dados, executar: sistema.executar });
    sistema.comandos.length = 0;
    await expect(carregarVersao({ ...dados, executar: sistema.executar })).resolves.toEqual({
      jaEstava: true,
    });
    expect(sistema.comandos.every((comando) => comando.startsWith('docker image inspect'))).toBe(
      true,
    );

    // Uma imagem trocada no Docker depois da carga, como pela etiqueta de outro pacote, faz a
    // versão ser carregada de novo.
    sistema.carregadas['grafite/proxy:1.4.0'] = id('f');
    sistema.comandos.length = 0;
    await expect(carregarVersao({ ...dados, executar: sistema.executar })).resolves.toEqual({
      jaEstava: false,
    });
    expect(sistema.comandos).toContain(
      `docker load --input ${join(versoes, '1.4.0.parcial', 'imagens.tar.gz')}`,
    );
  });

  it('recusa a carga que não trouxe todas as imagens do pacote', async () => {
    const arquivo = await pacote();
    const { proxy: _, ...semProxy } = NO_DOCKER;
    const sistema = sistemaSimulado({ daCarga: semProxy });
    await expect(
      carregarVersao({
        pacote: arquivo,
        descricao: DESCRICAO,
        pastaDasVersoes: join(pasta, 'versoes'),
        executar: sistema.executar,
      }),
    ).rejects.toThrow(
      'O docker load não trouxe a imagem grafite/proxy:1.4.0, que o pacote diz levar.',
    );
  });
});
