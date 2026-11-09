import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { sha256DoArquivo, zipar } from '@grafite/operacao';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { conferirPacote, type DescricaoDoPacote, desempacotarVersao } from './pacote.ts';
import { juncoesDoSistema } from './windows/juncoes.ts';

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-pacote-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

const DESCRICAO: DescricaoDoPacote = {
  versao: '0.4.0',
  links: [
    { caminho: 'node_modules/@grafite/db', alvo: 'packages/db' },
    { caminho: 'apps/api/node_modules/@grafite/domain', alvo: 'packages/domain' },
  ],
};

/**
 * Um pacote de exemplo: o zip, com o pacote.json (nenhum com `null`), e o .sha256 ao lado, como a
 * release publica.
 */
async function pacoteDeExemplo(
  descricao: unknown = DESCRICAO,
  nome = 'grafite-0.4.0-windows-x64.zip',
): Promise<string> {
  const origem = join(pasta, 'montagem');
  await mkdir(join(origem, 'packages', 'db', 'src'), { recursive: true });
  await mkdir(join(origem, 'packages', 'domain', 'src'), { recursive: true });
  await mkdir(join(origem, 'apps', 'api', 'src'), { recursive: true });
  await writeFile(join(origem, 'packages', 'db', 'src', 'index.ts'), 'export const db = 1;');
  await writeFile(join(origem, 'packages', 'domain', 'src', 'index.ts'), 'export const d = 1;');
  await writeFile(join(origem, 'apps', 'api', 'src', 'servidor.ts'), '// a API');
  if (descricao !== null) {
    await writeFile(join(origem, 'pacote.json'), JSON.stringify(descricao));
  }
  const zip = join(pasta, nome);
  await zipar(origem, zip);
  await writeFile(`${zip}.sha256`, `${await sha256DoArquivo(zip)}  ${nome}\n`);
  return zip;
}

describe('conferirPacote', () => {
  it('confere o zip com o hash publicado e devolve a descrição de dentro dele', async () => {
    const zip = await pacoteDeExemplo();
    await expect(conferirPacote(zip)).resolves.toEqual(DESCRICAO);
  });

  it('aceita o .sha256 só com o hash, em maiúsculas', async () => {
    const zip = await pacoteDeExemplo();
    await writeFile(`${zip}.sha256`, (await sha256DoArquivo(zip)).toUpperCase());
    await expect(conferirPacote(zip)).resolves.toEqual(DESCRICAO);
  });

  it('recusa o pacote que não confere com o hash, sem mexer em nada', async () => {
    const zip = await pacoteDeExemplo();
    await writeFile(`${zip}.sha256`, `${'0'.repeat(64)}  ${basename(zip)}\n`);
    await expect(conferirPacote(zip)).rejects.toThrow(
      'O pacote grafite-0.4.0-windows-x64.zip não confere com o hash publicado. Nada foi mudado: baixe o pacote e o .sha256 de novo.',
    );
  });

  it('recusa o pacote sem o .sha256 ao lado, ou que não existe', async () => {
    const zip = await pacoteDeExemplo();
    await rm(`${zip}.sha256`);
    await expect(conferirPacote(zip)).rejects.toThrow(
      'Falta o grafite-0.4.0-windows-x64.zip.sha256, publicado com o pacote: ponha os dois na mesma pasta.',
    );
    await expect(conferirPacote(join(pasta, 'outro.zip'))).rejects.toThrow(
      `O pacote ${join(pasta, 'outro.zip')} não existe.`,
    );
  });

  it('recusa o zip sem o pacote.json ou com uma descrição inválida', async () => {
    const semDescricao = await pacoteDeExemplo(null, 'sem.zip');
    await expect(conferirPacote(semDescricao)).rejects.toThrow(
      'O sem.zip não é um pacote do Grafite: falta o pacote.json.',
    );
    await rm(join(pasta, 'montagem'), { recursive: true });
    const invalida = await pacoteDeExemplo({ versao: '0.4' }, 'invalida.zip');
    await expect(conferirPacote(invalida)).rejects.toThrow(
      'O pacote.json de invalida.zip não é válido.',
    );
  });

  it('recusa os links que saem da pasta do pacote', async () => {
    for (const link of [
      { caminho: '../fora', alvo: 'packages/db' },
      { caminho: 'node_modules/x', alvo: '../../Windows' },
      { caminho: 'C:/Windows', alvo: 'packages/db' },
      { caminho: '/etc', alvo: 'packages/db' },
    ]) {
      await rm(join(pasta, 'montagem'), { recursive: true, force: true });
      const zip = await pacoteDeExemplo({ versao: '0.4.0', links: [link] }, 'fora.zip');
      await expect(conferirPacote(zip)).rejects.toThrow('O pacote.json de fora.zip não é válido.');
    }
  });
});

describe('desempacotarVersao', () => {
  it('desempacota em versoes\\<versão> e recria os links do workspace como junções', async () => {
    const zip = await pacoteDeExemplo();
    const versoes = join(pasta, 'Grafite', 'versoes');
    const resultado = await desempacotarVersao({
      zip,
      descricao: DESCRICAO,
      pastaDasVersoes: versoes,
      juncoes: juncoesDoSistema(),
    });
    const destino = join(versoes, '0.4.0');
    expect(resultado).toEqual({ pasta: destino, jaEstava: false });
    expect(await readdir(versoes)).toEqual(['0.4.0']);
    expect(
      await readFile(join(destino, 'node_modules', '@grafite', 'db', 'src', 'index.ts'), 'utf8'),
    ).toBe('export const db = 1;');
    expect(
      await readFile(
        join(destino, 'apps', 'api', 'node_modules', '@grafite', 'domain', 'src', 'index.ts'),
        'utf8',
      ),
    ).toBe('export const d = 1;');
    await expect(
      juncoesDoSistema().ler(join(destino, 'node_modules', '@grafite', 'db')),
    ).resolves.toBe(join(destino, 'packages', 'db'));
  });

  it('a mesma versão já desempacotada não desempacota de novo, mas os links são conferidos', async () => {
    const zip = await pacoteDeExemplo();
    const versoes = join(pasta, 'versoes');
    const dep = {
      zip,
      descricao: DESCRICAO,
      pastaDasVersoes: versoes,
      juncoes: juncoesDoSistema(),
    };
    await desempacotarVersao(dep);
    const servidor = join(versoes, '0.4.0', 'apps', 'api', 'src', 'servidor.ts');
    await writeFile(servidor, '// mexido depois');
    await rm(join(versoes, '0.4.0', 'node_modules', '@grafite', 'db'), { recursive: true });

    await expect(desempacotarVersao(dep)).resolves.toEqual({
      pasta: join(versoes, '0.4.0'),
      jaEstava: true,
    });
    expect(await readFile(servidor, 'utf8')).toBe('// mexido depois');
    expect(
      await readFile(
        join(versoes, '0.4.0', 'node_modules', '@grafite', 'db', 'src', 'index.ts'),
        'utf8',
      ),
    ).toBe('export const db = 1;');
  });

  it('a .parcial de um desempacotamento interrompido é refeita', async () => {
    const zip = await pacoteDeExemplo();
    const versoes = join(pasta, 'versoes');
    await mkdir(join(versoes, '0.4.0.parcial', 'apps'), { recursive: true });
    await writeFile(join(versoes, '0.4.0.parcial', 'sobra.txt'), 'de antes');
    await desempacotarVersao({
      zip,
      descricao: DESCRICAO,
      pastaDasVersoes: versoes,
      juncoes: juncoesDoSistema(),
    });
    expect(await readdir(versoes)).toEqual(['0.4.0']);
    expect(await readdir(join(versoes, '0.4.0'))).not.toContain('sobra.txt');
  });
});
