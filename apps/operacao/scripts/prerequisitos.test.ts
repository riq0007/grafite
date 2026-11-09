// A conferência dos pré-requisitos fixados (change instalador-e-menu-da-operacao, design, decisão
// 4), com o baixador simulado: cada instalador oficial baixado e o SHA-256 comparado com o fixado.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Baixador } from '../src/windows/baixador.ts';
import type { Prerequisitos } from '../src/windows/prerequisitos.ts';
import { conferirPrerequisitos, relatorioDaConferencia } from './prerequisitos.ts';

const PREREQUISITOS: Prerequisitos = {
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

const PASTA = join('C:', 'Temp', 'conferencia');

/** Um baixador que responde, para cada URL, o hash dado, e guarda o que foi pedido. */
function baixadorSimulado(hashes: Record<string, string>) {
  const pedidos: { url: string; arquivo: string }[] = [];
  const baixador: Baixador = {
    baixar: async (url, arquivo) => {
      pedidos.push({ url, arquivo });
      return hashes[url] ?? '';
    },
  };
  return { baixador, pedidos };
}

describe('conferirPrerequisitos', () => {
  it('baixa os dois instaladores oficiais e confere o hash de cada um com o fixado', async () => {
    const { baixador, pedidos } = baixadorSimulado({
      [PREREQUISITOS.node.url]: 'a'.repeat(64),
      [PREREQUISITOS.postgres.url]: 'b'.repeat(64),
    });

    const resultados = await conferirPrerequisitos({
      prerequisitos: PREREQUISITOS,
      baixador,
      pasta: PASTA,
    });

    expect(pedidos).toEqual([
      { url: PREREQUISITOS.node.url, arquivo: join(PASTA, 'node-v24.22.1-x64.msi') },
      {
        url: PREREQUISITOS.postgres.url,
        arquivo: join(PASTA, 'postgresql-18.6-1-windows-x64.exe'),
      },
    ]);
    expect(resultados.every(({ confere }) => confere)).toBe(true);
    expect(relatorioDaConferencia(resultados)).toBe(
      [
        'node-v24.22.1-x64.msi: confere.',
        'postgresql-18.6-1-windows-x64.exe: confere.',
        'Os dois instaladores conferem com o prerequisitos.json.',
      ].join('\n'),
    );
  });

  it('aponta o instalador cujo hash não confere, com o fixado e o baixado', async () => {
    const { baixador } = baixadorSimulado({
      [PREREQUISITOS.node.url]: 'a'.repeat(64),
      [PREREQUISITOS.postgres.url]: 'c'.repeat(64),
    });

    const resultados = await conferirPrerequisitos({
      prerequisitos: PREREQUISITOS,
      baixador,
      pasta: PASTA,
    });

    expect(resultados.map(({ confere }) => confere)).toEqual([true, false]);
    expect(relatorioDaConferencia(resultados)).toBe(
      [
        'node-v24.22.1-x64.msi: confere.',
        `postgresql-18.6-1-windows-x64.exe: não confere. Fixado: ${'b'.repeat(64)}. Baixado: ${'c'.repeat(64)}.`,
        'Um instalador não confere: não suba a versão fixada sem saber por quê.',
      ].join('\n'),
    );
  });
});
