import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  apagarSobras,
  backupsProntosNoDestino,
  distribuirBackup,
  MARCA_DO_DESTINO,
  nomeLivre,
  pastasNoDestino,
} from './distribuicao.ts';
import { type Manifesto, sha256DoArquivo } from './manifesto.ts';

let raiz: string;

beforeEach(async () => {
  raiz = await mkdtemp(join(tmpdir(), 'grafite-distribuicao-'));
});

afterEach(async () => {
  await rm(raiz, { recursive: true, force: true });
});

const RETENCAO = { diarios: 7, semanais: 4, mensais: 12 };
const FUSO = 'America/Sao_Paulo';

/** Um backup pronto (`nome`) na pasta dos backups de um destino, com o manifesto que bate. */
async function backupPronto(destino: string, nome: string): Promise<void> {
  const pasta = join(destino, 'grafite-producao', nome);
  await mkdir(pasta, { recursive: true });
  await writeFile(join(pasta, 'banco.dump'), `dump de ${nome}`);
  await writeFile(join(pasta, 'arquivos.zip'), `zip de ${nome}`);
  const partes = {} as Manifesto['partes'];
  for (const parte of ['banco.dump', 'arquivos.zip'] as const) {
    const caminho = join(pasta, parte);
    partes[parte] = {
      tamanho: Buffer.byteLength(`${parte === 'banco.dump' ? 'dump' : 'zip'} de ${nome}`),
      sha256: await sha256DoArquivo(caminho),
    };
  }
  const manifesto: Manifesto = {
    versao: '0.4.0',
    migracoes: ['0000_fundacao'],
    criadoEm: '2026-10-07T05:00:00.000Z',
    linhas: {},
    partes,
  };
  await writeFile(join(pasta, 'manifesto.json'), JSON.stringify(manifesto));
}

const prontos = async (destino: string) =>
  (await readdir(join(destino, 'grafite-producao'))).sort();

/** Os dias de setembro de 2026, às 05:00 UTC (02:00 em São Paulo), como nomes de backup. */
const setembro = (de: number, ate: number) =>
  Array.from(
    { length: ate - de + 1 },
    (_, i) => `2026-09-${String(de + i).padStart(2, '0')}T0500Z`,
  );

describe('distribuirBackup', () => {
  it('copia o backup para os destinos com espaço e acento e roda a retenção em cada um', async () => {
    const primeiro = join(raiz, 'Backups Grafite', 'Produção');
    const segundo = join(raiz, 'Cópia de segurança', 'Grafite Produção');
    for (const nome of setembro(1, 9)) {
      await backupPronto(primeiro, nome);
      await backupPronto(segundo, nome);
    }
    await backupPronto(primeiro, '2026-09-10T0500Z');

    const resultado = await distribuirBackup('2026-09-10T0500Z', {
      destinos: [primeiro, segundo],
      retencao: RETENCAO,
      fuso: FUSO,
    });

    expect(resultado.destinos).toEqual([
      { destino: primeiro, situacao: 'gravado' },
      { destino: segundo, situacao: 'gravado' },
    ]);
    const ficam = [...setembro(4, 10), '2026-09-06T0500Z'].sort();
    const unicos = [...new Set(ficam)];
    expect(await prontos(primeiro)).toEqual(unicos);
    expect(await prontos(segundo)).toEqual(unicos);
    expect(resultado.removidos).toEqual([
      '2026-09-01T0500Z',
      '2026-09-02T0500Z',
      '2026-09-03T0500Z',
    ]);
  });

  it('o disco cheio no segundo destino deixa a .parcial lá e não roda a retenção em nenhum', async () => {
    const primeiro = join(raiz, 'primeiro');
    const segundo = join(raiz, 'segundo');
    for (const nome of setembro(1, 9)) await backupPronto(primeiro, nome);
    await backupPronto(primeiro, '2026-09-10T0500Z');
    await mkdir(segundo);

    const resultado = await distribuirBackup('2026-09-10T0500Z', {
      destinos: [primeiro, segundo],
      retencao: RETENCAO,
      fuso: FUSO,
      copiarArquivo: async (origem, destino) => {
        if (destino.startsWith(segundo) && destino.endsWith('arquivos.zip')) {
          await writeFile(destino, 'metade');
          throw Object.assign(new Error('ENOSPC: no space left on device, copyfile'), {
            code: 'ENOSPC',
          });
        }
        await copyFile(origem, destino);
      },
    });

    expect(resultado).toEqual({
      destinos: [
        { destino: primeiro, situacao: 'gravado' },
        { destino: segundo, situacao: 'falhou', erro: 'O disco ficou sem espaço.' },
      ],
      removidos: [],
    });
    expect(await prontos(segundo)).toEqual(['2026-09-10T0500Z.parcial']);
    expect(await prontos(primeiro)).toEqual([...setembro(1, 9), '2026-09-10T0500Z']);
  });

  it('uma cópia que não confere com o manifesto falha e fica como .parcial', async () => {
    const primeiro = join(raiz, 'primeiro');
    const segundo = join(raiz, 'segundo');
    await backupPronto(primeiro, '2026-09-10T0500Z');
    await mkdir(segundo);

    const resultado = await distribuirBackup('2026-09-10T0500Z', {
      destinos: [primeiro, segundo],
      retencao: RETENCAO,
      fuso: FUSO,
      copiarArquivo: async (origem, destino) => {
        await copyFile(origem, destino);
        if (destino.endsWith('banco.dump')) await writeFile(destino, 'dump de 2026-09-10T0500X');
      },
    });

    expect(resultado.destinos[1]).toEqual({
      destino: segundo,
      situacao: 'falhou',
      erro: 'A parte banco.dump não confere com o hash do manifesto.',
    });
    expect(await prontos(segundo)).toEqual(['2026-09-10T0500Z.parcial']);
  });

  it('o destino que não existe e não pode ser criado falha com o motivo, e os outros continuam', async () => {
    const primeiro = join(raiz, 'primeiro');
    const arquivo = join(raiz, 'um-arquivo');
    await writeFile(arquivo, 'não é uma pasta');
    await backupPronto(primeiro, '2026-09-10T0500Z');

    const resultado = await distribuirBackup('2026-09-10T0500Z', {
      destinos: [primeiro, arquivo],
      retencao: RETENCAO,
      fuso: FUSO,
    });

    expect(resultado.destinos[0]).toEqual({ destino: primeiro, situacao: 'gravado' });
    expect(resultado.destinos[1]).toMatchObject({ destino: arquivo, situacao: 'falhou' });
    expect(resultado.destinos[1]?.erro).toMatch(/\S/);
    expect(resultado.removidos).toEqual([]);
  });
});

describe('a marca do destino, no Linux (change servidor-linux-com-docker)', () => {
  it('Compartilhamento desmontado: o destino sem a marca falha com o motivo, sem gravar nada nele', async () => {
    const primeiro = join(raiz, 'primeiro');
    // O ponto de montagem vazio, com o compartilhamento desmontado: sem a marca da instalação.
    const montagem = join(raiz, 'mnt', 'nas');
    await mkdir(montagem, { recursive: true });
    await mkdir(primeiro, { recursive: true });
    await writeFile(join(primeiro, MARCA_DO_DESTINO), 'marca');
    await backupPronto(primeiro, '2026-09-10T0500Z');

    const resultado = await distribuirBackup('2026-09-10T0500Z', {
      destinos: [primeiro, montagem],
      retencao: RETENCAO,
      fuso: FUSO,
      exigirMarca: true,
    });

    expect(resultado.destinos[1]).toEqual({
      destino: montagem,
      situacao: 'falhou',
      erro: `O destino ${montagem} não tem a marca do Grafite (.grafite-destino): ele pode ser um compartilhamento que não está montado, e o backup não grava no disco do servidor no lugar dele.`,
    });
    expect(await readdir(montagem)).toEqual([]);
    expect(resultado.removidos).toEqual([]);
  });

  it('Backup no compartilhamento: o destino marcado recebe a cópia; sem a marca exigida, nada muda', async () => {
    const primeiro = join(raiz, 'primeiro');
    const nas = join(raiz, 'mnt', 'nas');
    for (const destino of [primeiro, nas]) {
      await mkdir(destino, { recursive: true });
      await writeFile(join(destino, MARCA_DO_DESTINO), 'marca');
    }
    await backupPronto(primeiro, '2026-09-10T0500Z');
    const marcado = await distribuirBackup('2026-09-10T0500Z', {
      destinos: [primeiro, nas],
      retencao: RETENCAO,
      fuso: FUSO,
      exigirMarca: true,
    });
    expect(marcado.destinos.map(({ situacao }) => situacao)).toEqual(['gravado', 'gravado']);
    expect(await prontos(nas)).toEqual(['2026-09-10T0500Z']);

    // No Windows, a configuração não exige a marca, e o destino sem ela recebe a cópia.
    const semMarca = join(raiz, 'windows');
    const windows = await distribuirBackup('2026-09-10T0500Z', {
      destinos: [primeiro, semMarca],
      retencao: RETENCAO,
      fuso: FUSO,
    });
    expect(windows.destinos.map(({ situacao }) => situacao)).toEqual(['gravado', 'gravado']);
  });
});

describe('apagarSobras', () => {
  it('apaga a .parcial de ontem em cada destino e deixa os backups prontos', async () => {
    const primeiro = join(raiz, 'Backups Grafite', 'Produção');
    const segundo = join(raiz, 'segundo');
    await backupPronto(primeiro, '2026-10-05T0500Z');
    await mkdir(join(primeiro, 'grafite-producao', '2026-10-06T0500Z.parcial', 'sub'), {
      recursive: true,
    });
    await writeFile(
      join(primeiro, 'grafite-producao', '2026-10-06T0500Z.parcial', 'banco.dump'),
      'x',
    );
    await mkdir(join(segundo, 'grafite-producao', '2026-10-06T0500Z.parcial'), { recursive: true });

    await apagarSobras([primeiro, segundo, join(raiz, 'nao-existe')]);

    expect(await prontos(primeiro)).toEqual(['2026-10-05T0500Z']);
    expect(await prontos(segundo)).toEqual([]);
  });
});

describe('dois backups no mesmo minuto', () => {
  it('a lista reconhece o sufixo e põe o sem sufixo, o -2, o -9 e o -10 nessa ordem', async () => {
    const destino = join(raiz, 'Backups');
    for (const nome of [
      '2026-10-14T0606Z',
      '2026-10-14T0605Z-10',
      '2026-10-14T0605Z-2',
      '2026-10-14T0605Z',
      '2026-10-14T0605Z-9',
    ]) {
      await backupPronto(destino, nome);
    }
    await mkdir(join(destino, 'grafite-producao', '2026-10-14T0605Z-x'));

    expect(await backupsProntosNoDestino(destino)).toEqual([
      '2026-10-14T0605Z',
      '2026-10-14T0605Z-2',
      '2026-10-14T0605Z-9',
      '2026-10-14T0605Z-10',
      '2026-10-14T0606Z',
    ]);
  });

  it('o nome do minuto livre continua o de sempre', async () => {
    const destino = join(raiz, 'Backups');
    await backupPronto(destino, '2026-10-14T0604Z');

    expect(await nomeLivre([destino], '2026-10-14T0605Z')).toBe('2026-10-14T0605Z');
  });

  it('o nome ocupado só no segundo destino dá o -2, e o -2 ocupado dá o -3', async () => {
    const primeiro = join(raiz, 'Backups');
    const segundo = join(raiz, 'Cópia');
    await backupPronto(segundo, '2026-10-14T0605Z');
    expect(await nomeLivre([primeiro, segundo], '2026-10-14T0605Z')).toBe('2026-10-14T0605Z-2');

    await backupPronto(primeiro, '2026-10-14T0605Z-2');
    expect(await nomeLivre([primeiro, segundo], '2026-10-14T0605Z')).toBe('2026-10-14T0605Z-3');
  });

  it('a retenção guarda o -2 recém-feito como o mais novo do dia', async () => {
    const destino = join(raiz, 'Backups');
    await backupPronto(destino, '2026-10-14T0605Z');
    await backupPronto(destino, '2026-10-14T0605Z-2');

    const { removidos } = await distribuirBackup('2026-10-14T0605Z-2', {
      destinos: [destino],
      retencao: { diarios: 1, semanais: 1, mensais: 1 },
      fuso: FUSO,
    });

    expect(removidos).toEqual(['2026-10-14T0605Z']);
    expect(await prontos(destino)).toEqual(['2026-10-14T0605Z-2']);
  });
});

describe('pastasNoDestino', () => {
  it.runIf(process.platform === 'win32')(
    'monta as pastas de um caminho de rede com espaço e acento',
    () => {
      expect(pastasNoDestino('\\\\nas\\Backups Grafite\\Produção', '2026-10-07T0500Z')).toEqual({
        base: '\\\\nas\\Backups Grafite\\Produção\\grafite-producao',
        parcial: '\\\\nas\\Backups Grafite\\Produção\\grafite-producao\\2026-10-07T0500Z.parcial',
        pronta: '\\\\nas\\Backups Grafite\\Produção\\grafite-producao\\2026-10-07T0500Z',
      });
    },
  );
});
