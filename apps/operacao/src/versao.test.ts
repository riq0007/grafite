import { join } from 'node:path';
import type { ExecutarProcesso } from '@grafite/operacao';
import { afterEach, describe, expect, it } from 'vitest';
import { comandoDaApi, migrarBanco } from './versao.ts';

function executorSimulado(resultado = { codigo: 0, saida: '', erro: '' }) {
  const chamadas: { arquivo: string; argumentos: string[]; env: Record<string, unknown> }[] = [];
  const executar: ExecutarProcesso = async (arquivo, argumentos, { env }) => {
    chamadas.push({ arquivo, argumentos, env });
    return resultado;
  };
  return { chamadas, executar };
}

const NODE = 'C:\\Program Files\\nodejs\\node.exe';
const VERSAO = join('C:', 'Grafite', 'versoes', '0.5.0');

afterEach(() => {
  delete process.env.GRAFITE_DATABASE_URL;
  delete process.env.GRAFITE_AMBIENTE;
});

describe('migrarBanco', () => {
  it('roda as migrations da própria versão com a conexão do dono, sem as variáveis do Grafite de fora', async () => {
    process.env.GRAFITE_AMBIENTE = 'desenvolvimento';
    const { chamadas, executar } = executorSimulado({
      codigo: 0,
      saida: 'Migrations aplicadas.\n',
      erro: '',
    });
    await migrarBanco({
      executar,
      node: NODE,
      pastaDaVersao: VERSAO,
      urlDono: 'postgres://grafite_owner:s@127.0.0.1:5433/grafite_teste',
    });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]?.arquivo).toBe(NODE);
    expect(chamadas[0]?.argumentos).toEqual([join(VERSAO, 'packages', 'db', 'src', 'migrar.ts')]);
    expect(chamadas[0]?.env.GRAFITE_DATABASE_URL_MIGRACOES).toBe(
      'postgres://grafite_owner:s@127.0.0.1:5433/grafite_teste',
    );
    expect(chamadas[0]?.env.GRAFITE_AMBIENTE).toBeUndefined();
    expect(chamadas[0]?.env.PATH ?? chamadas[0]?.env.Path).toBeDefined();
  });

  it('a migration que falha para com o erro dela', async () => {
    const { executar } = executorSimulado({
      codigo: 1,
      saida: '',
      erro: 'error: column "x" does not exist\n',
    });
    await expect(
      migrarBanco({ executar, node: NODE, pastaDaVersao: VERSAO, urlDono: 'postgres://x' }),
    ).rejects.toThrow('As migrations da versão 0.5.0 falharam: error: column "x" does not exist');
  });
});

describe('comandoDaApi', () => {
  it('roda o comando da API da versão com o config.env do ambiente, sem as variáveis de fora', async () => {
    process.env.GRAFITE_DATABASE_URL = 'postgres://de-fora';
    const { chamadas, executar } = executorSimulado({ codigo: 0, saida: 'pronto\n', erro: '' });
    await expect(
      comandoDaApi({
        executar,
        node: NODE,
        pastaDaVersao: VERSAO,
        variaveis: { GRAFITE_DATABASE_URL: 'postgres://do-ambiente' },
        argumentos: ['conta', 'criar', '--usuario', 'bruno'],
      }),
    ).resolves.toEqual({ codigo: 0, saida: 'pronto\n', erro: '' });
    expect(chamadas[0]?.argumentos).toEqual([
      join(VERSAO, 'apps', 'api', 'scripts', 'grafite.ts'),
      'conta',
      'criar',
      '--usuario',
      'bruno',
    ]);
    expect(chamadas[0]?.env.GRAFITE_DATABASE_URL).toBe('postgres://do-ambiente');
  });
});
