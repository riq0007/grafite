// Os logs de cada serviço pela peça da plataforma (change painel-da-operacao, design, decisão 9):
// no Windows, os arquivos do WinSW na pasta de logs de cada ambiente, as últimas linhas e a busca;
// no Linux, o docker compose logs do serviço. Os arquivos e o Docker são os simulados.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instalacaoDeExemplo } from '../test/instalacao-de-exemplo.ts';
import { instalacaoNoLinuxDeExemplo } from '../test/instalacao-no-linux.ts';
import { lerInstalacao } from './instalacao.ts';
import { plataformaDoLinux } from './linux/plataforma.ts';
import { plataformaDoWindows } from './windows/plataforma.ts';

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-logs-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

const linhas = (quantas: number, texto: (i: number) => string) =>
  `${Array.from({ length: quantas }, (_, i) => texto(i + 1)).join('\n')}\n`;

describe('os logs no Windows', () => {
  async function noWindows() {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { servidor } = instalacao;
    const plataforma = plataformaDoWindows({
      executar: servidor.executar,
      node: servidor.node,
      juncoes: servidor.juncoes,
      ferramentas: servidor.ferramentas,
      atalhoDoMenu: servidor.atalhoDoMenu,
    });
    return { ...instalacao, plataforma, lida: await lerInstalacao(instalacao.raiz) };
  }

  it('as últimas linhas de cada arquivo do WinSW do serviço, na pasta de logs do ambiente', async () => {
    const { pastas, plataforma, lida } = await noWindows();
    await mkdir(pastas.producao.logs, { recursive: true });
    await writeFile(
      join(pastas.producao.logs, 'grafite.out.log'),
      linhas(300, (i) => `linha ${i}`),
    );
    await writeFile(
      join(pastas.producao.logs, 'grafite.err.log'),
      linhas(2, (i) => `erro ${i}`),
    );
    await writeFile(join(pastas.producao.logs, 'grafite-coletor.out.log'), 'do coletor\n');

    const logs = await plataforma.logs(lida, 'grafite', { linhas: 100 });
    expect(logs.map(({ origem, linhas: lidas }) => [origem, lidas.length, lidas.at(-1)])).toEqual([
      [join(pastas.producao.logs, 'grafite.out.log'), 100, 'linha 300'],
      [join(pastas.producao.logs, 'grafite.err.log'), 2, 'erro 2'],
    ]);
    expect(logs[0]?.linhas[0]).toBe('linha 201');
  });

  it('a busca acha o texto sem diferença de maiúsculas, e as últimas linhas são as que o têm', async () => {
    const { pastas, plataforma, lida } = await noWindows();
    await mkdir(pastas.teste.logs, { recursive: true });
    await writeFile(
      join(pastas.teste.logs, 'grafite-teste.out.log'),
      linhas(50, (i) => (i % 10 === 0 ? `FALHA ${i}` : `ok ${i}`)),
    );
    const [log] = await plataforma.logs(lida, 'grafite-teste', { linhas: 3, busca: 'falha' });
    expect(log?.linhas).toEqual(['FALHA 30', 'FALHA 40', 'FALHA 50']);
  });

  it('o PostgreSQL da produção, pela pasta dos dados que o serviço dele diz', async () => {
    const { pgBin, plataforma, lida } = await noWindows();
    const pastaDoLog = join(pgBin, '..', 'data', 'log');
    await mkdir(pastaDoLog, { recursive: true });
    await writeFile(join(pastaDoLog, 'postgresql-2026-10-27.log'), 'de ontem\n');
    await writeFile(join(pastaDoLog, 'postgresql-2026-10-28.log'), 'de hoje\n');
    const logs = await plataforma.logs(lida, 'postgresql-x64-18', { linhas: 10 });
    expect(logs.map(({ linhas: lidas }) => lidas)).toEqual([['de ontem'], ['de hoje']]);
  });

  it('o serviço sem log ainda volta sem linhas, e o que não é do Grafite é recusado', async () => {
    const { plataforma, lida } = await noWindows();
    expect(await plataforma.logs(lida, 'grafite-proxy', { linhas: 10 })).toEqual([]);
    await expect(plataforma.logs(lida, 'spooler', { linhas: 10 })).rejects.toThrow(
      'O serviço spooler não é um serviço do Grafite.',
    );
  });
});

describe('os logs no Linux', () => {
  it('o docker compose logs do serviço, com as últimas linhas e a busca', async () => {
    const raiz = join(pasta, 'grafite');
    const fora = join(pasta, 'fora');
    await mkdir(raiz);
    await mkdir(fora);
    const { servidor } = await instalacaoNoLinuxDeExemplo({ raiz, fora });
    servidor.controle.logs = {
      coletor: linhas(20, (i) => (i % 5 === 0 ? `coletor  | aviso ${i}` : `coletor  | ok ${i}`)),
    };
    const chamadas: string[][] = [];
    const plataforma = plataformaDoLinux({
      executar: (arquivo, argumentos, opcoes) => {
        chamadas.push(argumentos);
        return servidor.executar(arquivo, argumentos, opcoes);
      },
      permissoes: { dono: async () => {}, modo: async () => {} },
    });
    const lida = await lerInstalacao(raiz, 'linux');

    const [log] = await plataforma.logs(lida, 'grafite-coletor', { linhas: 2, busca: 'AVISO' });
    expect(log).toEqual({
      origem: 'coletor',
      linhas: ['coletor  | aviso 15', 'coletor  | aviso 20'],
    });
    expect(chamadas.at(-1)).toEqual(
      expect.arrayContaining(['logs', '--no-color', '--tail', '5000', 'coletor']),
    );
  });
});
