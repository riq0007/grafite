// Os pré-requisitos do servidor Windows com a versão e o hash fixados (change
// instalador-e-menu-da-operacao, design, decisão 4): o Node 24 e o PostgreSQL 18, pelos instaladores
// oficiais, que o atalho de instalação só roda com o SHA-256 conferido.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lerPrerequisitos, type Prerequisitos } from './prerequisitos.ts';

describe('o prerequisitos.json do comando de operação', () => {
  it('fixa o Node 24 e o PostgreSQL 18 pelos instaladores oficiais, com o SHA-256 de cada um', async () => {
    const { node, postgres } = await lerPrerequisitos();

    expect(node.versao).toMatch(/^24\.\d+\.\d+$/);
    expect(node.arquivo).toBe(`node-v${node.versao}-x64.msi`);
    expect(node.url).toBe(`https://nodejs.org/dist/v${node.versao}/${node.arquivo}`);
    expect(postgres.versao).toMatch(/^18\.\d+$/);
    expect(postgres.arquivo).toMatch(/^postgresql-18\.\d+-\d+-windows-x64\.exe$/);
    expect(postgres.arquivo.startsWith(`postgresql-${postgres.versao}-`)).toBe(true);
    expect(postgres.url).toBe(`https://get.enterprisedb.com/postgresql/${postgres.arquivo}`);
    for (const { sha256 } of [node, postgres]) expect(sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('lerPrerequisitos', () => {
  let pasta: string;

  beforeEach(async () => {
    pasta = await mkdtemp(join(tmpdir(), 'grafite-prerequisitos-'));
  });

  afterEach(async () => {
    await rm(pasta, { recursive: true, force: true });
  });

  const valido: Prerequisitos = {
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
      sha256: 'b'.repeat(64),
    },
  };

  async function gravar(conteudo: unknown): Promise<string> {
    const arquivo = join(pasta, 'prerequisitos.json');
    await writeFile(arquivo, JSON.stringify(conteudo));
    return arquivo;
  }

  it('lê o arquivo que confere', async () => {
    await expect(lerPrerequisitos(await gravar(valido))).resolves.toEqual(valido);
  });

  it('recusa o Node de outra versão maior, dizendo o campo', async () => {
    const node = {
      versao: '22.20.0',
      arquivo: 'node-v22.20.0-x64.msi',
      url: 'https://nodejs.org/dist/v22.20.0/node-v22.20.0-x64.msi',
      sha256: 'a'.repeat(64),
    };
    await expect(lerPrerequisitos(await gravar({ ...valido, node }))).rejects.toThrow(
      'O prerequisitos.json não confere: node.versao: a produção usa o Node 24.',
    );
  });

  it('recusa o hash que não tem 64 caracteres hexadecimais', async () => {
    const postgres = { ...valido.postgres, sha256: 'B'.repeat(64) };
    await expect(lerPrerequisitos(await gravar({ ...valido, postgres }))).rejects.toThrow(
      'postgres.sha256: o SHA-256 tem 64 caracteres hexadecimais, em minúsculas.',
    );
  });

  it('recusa o instalador baixado de outro lugar que não a fonte oficial', async () => {
    const postgres = {
      ...valido.postgres,
      url: 'https://exemplo.com.br/postgresql-18.6-1-windows-x64.exe',
    };
    await expect(lerPrerequisitos(await gravar({ ...valido, postgres }))).rejects.toThrow(
      'postgres.url: o instalador vem de https://get.enterprisedb.com/postgresql/, com o nome do arquivo.',
    );
  });

  it('recusa o arquivo de uma versão que não é a fixada', async () => {
    const node = { ...valido.node, arquivo: 'node-v24.21.0-x64.msi' };
    await expect(lerPrerequisitos(await gravar({ ...valido, node }))).rejects.toThrow(
      'node.arquivo: o instalador é o node-v24.22.1-x64.msi.',
    );
  });
});
