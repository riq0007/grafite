// A escolha do instalador de um pré-requisito (change instalador-e-menu-da-operacao, design, decisão
// 3; spec operacao-servicos, "Atalho de instalação"): o da pasta do zip, conferido, ou o baixado para
// ela, que só fica se o hash conferir. A rede é simulada.
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Baixador } from './baixador.ts';
import { instaladorConferido } from './instaladores.ts';
import type { Prerequisito } from './prerequisitos.ts';

const OFICIAL = 'o instalador oficial do PostgreSQL 18.6';
const sha256 = (texto: string) => createHash('sha256').update(texto).digest('hex');

const POSTGRES: Prerequisito = {
  versao: '18.6',
  arquivo: 'postgresql-18.6-1-windows-x64.exe',
  url: 'https://get.enterprisedb.com/postgresql/postgresql-18.6-1-windows-x64.exe',
  sha256: sha256(OFICIAL),
};

let pasta: string;
let escrito: string[];
const console = { escrever: (texto: string) => escrito.push(texto) };

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-instaladores-'));
  escrito = [];
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

const existe = (caminho: string) =>
  access(caminho).then(
    () => true,
    () => false,
  );

/** Uma rede que grava o conteúdo dado no arquivo pedido, ou que não responde. */
function redeSimulada(conteudo: string | Error) {
  const pedidos: string[] = [];
  const baixador: Baixador = {
    baixar: async (url, arquivo) => {
      pedidos.push(url);
      if (conteudo instanceof Error) throw conteudo;
      await writeFile(arquivo, conteudo);
      return sha256(conteudo);
    },
  };
  return { baixador, pedidos };
}

describe('instaladorConferido', () => {
  it('usa o instalador da pasta do zip, conferido, sem tentar baixar (Servidor sem internet)', async () => {
    const local = join(pasta, POSTGRES.arquivo);
    await writeFile(local, OFICIAL);
    const { baixador, pedidos } = redeSimulada(new Error('getaddrinfo ENOTFOUND'));

    await expect(
      instaladorConferido({ prerequisito: POSTGRES, pastaDoZip: pasta, baixador, console }),
    ).resolves.toBe(local);
    expect(pedidos).toEqual([]);
    expect(escrito).toEqual([`${POSTGRES.arquivo} conferido, da pasta do zip.`]);
  });

  it('recusa o instalador da pasta do zip que não confere, sem apagá-lo nem baixar outro', async () => {
    const local = join(pasta, POSTGRES.arquivo);
    await writeFile(local, 'outro instalador');
    const { baixador, pedidos } = redeSimulada(OFICIAL);

    await expect(
      instaladorConferido({ prerequisito: POSTGRES, pastaDoZip: pasta, baixador, console }),
    ).rejects.toThrow(
      `O ${POSTGRES.arquivo} da pasta do zip não confere com o hash fixado no pacote: troque-o pelo instalador oficial, de ${POSTGRES.url}, ou apague-o para o atalho baixá-lo.`,
    );
    expect(await readFile(local, 'utf8')).toBe('outro instalador');
    expect(pedidos).toEqual([]);
  });

  it('baixa o instalador que falta para a pasta do zip e o usa, conferido', async () => {
    const { baixador, pedidos } = redeSimulada(OFICIAL);

    const instalador = await instaladorConferido({
      prerequisito: POSTGRES,
      pastaDoZip: pasta,
      baixador,
      console,
    });

    expect(instalador).toBe(join(pasta, POSTGRES.arquivo));
    expect(pedidos).toEqual([POSTGRES.url]);
    expect(escrito).toEqual([
      `Baixando o ${POSTGRES.arquivo} de ${POSTGRES.url}...`,
      `${POSTGRES.arquivo} baixado e conferido.`,
    ]);
  });

  it('apaga o instalador baixado que não confere e para (Instalador alterado)', async () => {
    const { baixador } = redeSimulada('um instalador trocado no caminho');

    await expect(
      instaladorConferido({ prerequisito: POSTGRES, pastaDoZip: pasta, baixador, console }),
    ).rejects.toThrow(
      `O ${POSTGRES.arquivo} baixado de ${POSTGRES.url} não confere com o hash fixado no pacote e foi apagado. Nada foi instalado.`,
    );
    expect(await existe(join(pasta, POSTGRES.arquivo))).toBe(false);
  });

  it('diz o arquivo que falta e de onde baixá-lo, sem a rede (Instalador que falta sem internet)', async () => {
    const { baixador } = redeSimulada(new Error('getaddrinfo ENOTFOUND get.enterprisedb.com'));

    await expect(
      instaladorConferido({ prerequisito: POSTGRES, pastaDoZip: pasta, baixador, console }),
    ).rejects.toThrow(
      `Falta o ${POSTGRES.arquivo} na pasta do zip (${pasta}), e o download falhou: getaddrinfo ENOTFOUND get.enterprisedb.com. Baixe-o de ${POSTGRES.url}, ponha-o nessa pasta e rode o atalho de novo.`,
    );
    expect(await existe(join(pasta, POSTGRES.arquivo))).toBe(false);
  });
});
