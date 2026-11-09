// O pacote da versão (spec operacao-servicos, "Pacote da versão"; design do F2d, decisão 5), com uma
// pasta de exemplo no lugar do repositório e da montagem: a lista dos arquivos, a dos links do
// workspace, a versão e o zip, que o comando de operação confere e desempacota de volta.
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lerDoZip, sha256DoArquivo } from '@grafite/operacao';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { conferirPacote, desempacotarVersao } from '../src/pacote.ts';
import { juncoesDoSistema } from '../src/windows/juncoes.ts';
import {
  arquivosDoRepositorio,
  conferirVersao,
  copiarParaOPacote,
  montarZip,
  nomeDoPacote,
  percorrerMontagem,
  podarLockfile,
} from './empacotar.ts';

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-empacotar-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

async function escrever(raiz: string, arquivos: string[]) {
  for (const arquivo of arquivos) {
    const caminho = join(raiz, ...arquivo.split('/'));
    await mkdir(join(caminho, '..'), { recursive: true });
    await writeFile(caminho, `// ${arquivo}`);
  }
}

describe('arquivosDoRepositorio', () => {
  it('leva o código dos apps e dos pacotes, as migrations, a web compilada, o runbook e os lançadores, sem os testes', async () => {
    await escrever(pasta, [
      'package.json',
      'apps/api/package.json',
      'apps/api/src/servidor.ts',
      'apps/api/src/config.ts',
      'apps/api/src/config.test.ts',
      'apps/api/src/rotas/saude.int.test.ts',
      'apps/api/scripts/grafite.ts',
      'apps/api/scripts/contrato.ts',
      'apps/api/test/integracao.ts',
      'apps/collector/package.json',
      'apps/collector/src/servidor.ts',
      'apps/operacao/package.json',
      'apps/operacao/prerequisitos.json',
      'apps/operacao/src/grafite.ts',
      'apps/operacao/src/comando.test.ts',
      'apps/operacao/lancadores/grafite.ps1',
      'apps/operacao/lancadores/instalar.ps1',
      'apps/operacao/lancadores/preparar-servidor.ps1',
      'apps/operacao/lancadores/Instalar-Grafite.cmd',
      'apps/operacao/lancadores/Grafite.cmd',
      'apps/web/package.json',
      'apps/web/public/favicon.ico',
      'apps/web/src/main.tsx',
      'apps/web/dist/index.html',
      'apps/web/dist/assets/app.js',
      'apps/painel/package.json',
      'apps/painel/src/main.tsx',
      'apps/painel/dist/index.html',
      'apps/painel/dist/assets/painel.js',
      'packages/db/package.json',
      'packages/db/src/migrar.ts',
      'packages/db/src/isolamento.int.test.ts',
      'packages/db/migrations/0000_fundacao.sql',
      'packages/db/migrations/meta/_journal.json',
      'packages/db/test/banco-de-teste.ts',
      'packages/domain/package.json',
      'packages/domain/src/index.ts',
      'packages/operacao/package.json',
      'packages/operacao/src/index.ts',
      'packages/operacao/src/zip.test.ts',
      'packages/ui/package.json',
      'packages/ui/src/tokens/index.ts',
      'docs/operacao/runbook.md',
      'docs/ANTISLOP.md',
    ]);
    await escrever(join(pasta, 'apps', 'api', 'node_modules', 'fastify'), ['index.js']);

    const lista = await arquivosDoRepositorio(pasta);
    expect(lista.map(({ para }) => para)).toEqual([
      // O atalho do menu e o de instalação, na raiz (change instalador-e-menu-da-operacao).
      'Grafite.cmd',
      'Instalar-Grafite.cmd',
      'apps/api/package.json',
      'apps/api/scripts/grafite.ts',
      'apps/api/src/config.ts',
      'apps/api/src/servidor.ts',
      'apps/collector/package.json',
      'apps/collector/src/servidor.ts',
      'apps/operacao/package.json',
      'apps/operacao/prerequisitos.json',
      'apps/operacao/src/grafite.ts',
      'docs/operacao/runbook.md',
      'grafite.ico',
      'grafite.ps1',
      'instalar.ps1',
      'packages/db/migrations/0000_fundacao.sql',
      'packages/db/migrations/meta/_journal.json',
      'packages/db/package.json',
      'packages/db/src/migrar.ts',
      'packages/domain/package.json',
      'packages/domain/src/index.ts',
      'packages/operacao/package.json',
      'packages/operacao/src/index.ts',
      // A página do painel da operação, compilada (change painel-da-operacao).
      'painel/assets/painel.js',
      'painel/index.html',
      'preparar-servidor.ps1',
      'web/assets/app.js',
      'web/index.html',
    ]);
    expect(lista.find(({ para }) => para === 'grafite.ico')?.de).toBe(
      join(pasta, 'apps', 'web', 'public', 'favicon.ico'),
    );
    expect(lista.find(({ para }) => para === 'grafite.ps1')?.de).toBe(
      join(pasta, 'apps', 'operacao', 'lancadores', 'grafite.ps1'),
    );
  });

  it('sem a web compilada, recusa e diz como compilar', async () => {
    await escrever(pasta, ['apps/api/package.json', 'docs/operacao/runbook.md']);
    await expect(arquivosDoRepositorio(pasta)).rejects.toThrow(
      'Falta a web compilada em apps/web/dist: rode pnpm --filter @grafite/web build antes.',
    );
  });

  it('sem o painel compilado, recusa e diz como compilar', async () => {
    await escrever(pasta, [
      'apps/api/package.json',
      'apps/web/dist/index.html',
      'docs/operacao/runbook.md',
    ]);
    await expect(arquivosDoRepositorio(pasta)).rejects.toThrow(
      'Falta o painel compilado em apps/painel/dist: rode pnpm --filter @grafite/painel build antes.',
    );
  });
});

describe('percorrerMontagem', () => {
  it('lista os arquivos e os links do workspace, sem entrar nos links', async () => {
    const montagem = join(pasta, 'montagem');
    await escrever(montagem, [
      'packages/db/src/index.ts',
      'apps/api/src/servidor.ts',
      'node_modules/fastify/index.js',
    ]);
    await mkdir(join(montagem, 'node_modules', '@grafite'), { recursive: true });
    await symlink(
      join(montagem, 'packages', 'db'),
      join(montagem, 'node_modules', '@grafite', 'db'),
      'junction',
    );
    await mkdir(join(montagem, 'apps', 'api', 'node_modules', '@grafite'), { recursive: true });
    await symlink(
      join(montagem, 'packages', 'db'),
      join(montagem, 'apps', 'api', 'node_modules', '@grafite', 'db'),
      'junction',
    );

    await expect(percorrerMontagem(montagem)).resolves.toEqual({
      arquivos: [
        'apps/api/src/servidor.ts',
        'node_modules/fastify/index.js',
        'packages/db/src/index.ts',
      ],
      links: [
        { caminho: 'apps/api/node_modules/@grafite/db', alvo: 'packages/db' },
        { caminho: 'node_modules/@grafite/db', alvo: 'packages/db' },
      ],
    });
  });

  it('recusa o link que aponta para fora do pacote', async () => {
    const montagem = join(pasta, 'montagem');
    await escrever(montagem, ['apps/api/src/servidor.ts']);
    await escrever(pasta, ['fora/index.js']);
    await mkdir(join(montagem, 'node_modules'), { recursive: true });
    await symlink(join(pasta, 'fora'), join(montagem, 'node_modules', 'fora'), 'junction');
    await expect(percorrerMontagem(montagem)).rejects.toThrow(
      `O link node_modules/fora aponta para fora do pacote: ${join(pasta, 'fora')}.`,
    );
  });

  it('recusa o link para um projeto que não está no pacote', async () => {
    const montagem = join(pasta, 'montagem');
    await escrever(montagem, ['apps/api/src/servidor.ts']);
    await mkdir(join(montagem, 'packages', 'ui'), { recursive: true });
    await mkdir(join(montagem, 'node_modules', '@grafite'), { recursive: true });
    await symlink(
      join(montagem, 'packages', 'ui'),
      join(montagem, 'node_modules', '@grafite', 'ui'),
      'junction',
    );
    await rm(join(montagem, 'packages', 'ui'), { recursive: true });
    await expect(percorrerMontagem(montagem)).rejects.toThrow(
      'O link node_modules/@grafite/ui aponta para packages/ui, que não está no pacote.',
    );
  });
});

describe('podarLockfile', () => {
  it('deixa no lockfile da montagem só os projetos que vão no pacote, para a web não ser instalada', () => {
    const lockfile = [
      '---',
      "lockfileVersion: '9.0'",
      '',
      'importers:',
      '',
      '  .:',
      '    configDependencies: {}',
      '',
      'packages:',
      '',
      "  '@pnpm/exe@12.6.0':",
      '    resolution: {integrity: sha512-x}',
      '',
      '---',
      'importers:',
      '',
      '  .:',
      '    devDependencies:',
      '      vitest:',
      '        specifier: ^4.1.11',
      '',
      '  apps/api:',
      '    dependencies:',
      '      fastify:',
      '        specifier: ^5.12.5',
      '',
      '  apps/web:',
      '    dependencies:',
      '      react:',
      '        specifier: ^19.2.0',
      '',
      '  packages/ui:',
      '    dependencies:',
      '      react:',
      '        specifier: ^19.2.0',
      '',
      'packages:',
      '',
      '  apps/web@1.0.0:',
      '    resolution: {directory: apps/web}',
      '',
      '  react@19.2.0:',
      '    resolution: {integrity: sha512-y}',
      '',
    ].join('\n');
    const podado = podarLockfile(lockfile, new Set(['.', 'apps/api']));
    expect(podado).not.toContain('  apps/web:');
    expect(podado).not.toContain('  packages/ui:');
    expect(podado).toContain('  apps/api:\n    dependencies:\n      fastify:');
    // As seções dos pacotes ficam como estavam: só os projetos saem.
    expect(podado).toContain('  apps/web@1.0.0:\n    resolution: {directory: apps/web}');
    expect(podado).toContain('  react@19.2.0:');
    expect(podado).toContain("  '@pnpm/exe@12.6.0':");
  });
});

describe('a versão e o zip', () => {
  it('recusa a versão pedida que não é a da API', () => {
    expect(() => conferirVersao('0.5.0', '0.4.0')).toThrow(
      'A versão pedida, 0.5.0, não é a da API, 0.4.0: mude a versão em apps/api/package.json ou peça a 0.4.0.',
    );
    expect(() => conferirVersao('v0.4.0', '0.4.0')).toThrow(
      'A versão pedida, v0.4.0, não é uma versão x.y.z.',
    );
    expect(() => conferirVersao('0.4.0', '0.4.0')).not.toThrow();
    expect(nomeDoPacote('0.4.0')).toBe('grafite-0.4.0-windows-x64.zip');
  });

  it('o zip leva os arquivos e o pacote.json com os links, e o .sha256; o comando o confere e desempacota com as junções', async () => {
    const montagem = join(pasta, 'montagem');
    await escrever(montagem, [
      'packages/db/src/index.ts',
      'grafite.ps1',
      'apps/api/src/servidor.ts',
    ]);
    await mkdir(join(montagem, 'node_modules', '@grafite'), { recursive: true });
    await symlink(
      join(montagem, 'packages', 'db'),
      join(montagem, 'node_modules', '@grafite', 'db'),
      'junction',
    );
    const saida = join(pasta, 'saida');

    const { zip, sha256 } = await montarZip({ montagem, versao: '0.4.0', saida });

    expect(zip).toBe(join(saida, 'grafite-0.4.0-windows-x64.zip'));
    expect(await readFile(`${zip}.sha256`, 'utf8')).toBe(
      `${sha256}  grafite-0.4.0-windows-x64.zip\n`,
    );
    expect(sha256).toBe(await sha256DoArquivo(zip));
    const descricao = await conferirPacote(zip);
    expect(descricao).toEqual({
      versao: '0.4.0',
      links: [{ caminho: 'node_modules/@grafite/db', alvo: 'packages/db' }],
    });
    const versoes = join(pasta, 'Grafite', 'versoes');
    await desempacotarVersao({
      zip,
      descricao,
      pastaDasVersoes: versoes,
      juncoes: juncoesDoSistema(),
    });
    expect(
      await readFile(
        join(versoes, '0.4.0', 'node_modules', '@grafite', 'db', 'src', 'index.ts'),
        'utf8',
      ),
    ).toBe('// packages/db/src/index.ts');
  });
});

// Os atalhos no pacote (change instalador-e-menu-da-operacao, design, decisão 7).
describe('os atalhos no pacote', () => {
  it('os .cmd vão com CRLF, que o cmd.exe exige, e o resto, como está', async () => {
    await escrever(pasta, []);
    const origem = join(pasta, 'Instalar-Grafite.cmd');
    const roteiro = join(pasta, 'preparar-servidor.ps1');
    await writeFile(origem, '@echo off\nrem a\r\nexit /b\n');
    await writeFile(roteiro, "$ErrorActionPreference = 'Stop'\n");

    await copiarParaOPacote(origem, join(pasta, 'montagem', 'Instalar-Grafite.cmd'));
    await copiarParaOPacote(roteiro, join(pasta, 'montagem', 'preparar-servidor.ps1'));

    expect(await readFile(join(pasta, 'montagem', 'Instalar-Grafite.cmd'), 'utf8')).toBe(
      '@echo off\r\nrem a\r\nexit /b\r\n',
    );
    expect(await readFile(join(pasta, 'montagem', 'preparar-servidor.ps1'), 'utf8')).toBe(
      "$ErrorActionPreference = 'Stop'\n",
    );
  });

  it('o atalho de instalação vai também ao lado do zip, igual ao de dentro', async () => {
    const montagem = join(pasta, 'montagem');
    await escrever(montagem, ['grafite.ps1']);
    await writeFile(join(montagem, 'Instalar-Grafite.cmd'), '@echo off\r\nrem o atalho\r\n');
    const saida = join(pasta, 'saida');

    const { zip } = await montarZip({ montagem, versao: '0.4.0', saida });

    const fora = await readFile(join(saida, 'Instalar-Grafite.cmd'));
    expect(fora.toString('utf8')).toBe('@echo off\r\nrem o atalho\r\n');
    expect((await lerDoZip(zip, 'Instalar-Grafite.cmd'))?.equals(fora)).toBe(true);
  });
});
