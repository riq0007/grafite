// O PostgreSQL em contêiner no servidor Linux (change servidor-linux-com-docker, design, decisão 5):
// o superusuário de cada ambiente pelo nome do serviço do banco na rede interna, a espera pelo
// banco, os papéis e o banco pelo mesmo SQL do Windows e o banco.env com a senha do superusuário.
import type { FerramentasDoPostgres } from '@grafite/operacao';
import { describe, expect, it } from 'vitest';
import { conexaoDoPostgres, rodarSql, sqlDoBanco } from '../banco.ts';
import {
  esperarBanco,
  prepararBancoNoLinux,
  superusuarioNoLinux,
  variaveisDoBanco,
} from './banco.ts';

/** O psql simulado: guarda o banco de cada chamada e responde o código da vez. */
function psqlSimulado(codigos: number[] = []) {
  const chamadas: { argumentos: string[]; senha?: string; entrada?: string }[] = [];
  const ferramentas: FerramentasDoPostgres = {
    executar: async (_ferramenta, argumentos, opcoes) => {
      chamadas.push({ argumentos, senha: opcoes?.senha, entrada: opcoes?.entrada });
      const codigo = codigos.shift() ?? 0;
      return { codigo, saida: '', erro: codigo === 0 ? '' : 'connection refused' };
    },
  };
  return { chamadas, ferramentas };
}

describe('o superusuário de cada ambiente no Linux', () => {
  it('chega ao banco pelo nome do serviço, na porta do contêiner', () => {
    expect(superusuarioNoLinux('producao', 'senha-p')).toEqual({
      host: 'banco-producao',
      porta: 5432,
      senha: 'senha-p',
    });
    expect(superusuarioNoLinux('teste', 'senha-t')).toEqual({
      host: 'banco-teste',
      porta: 5432,
      senha: 'senha-t',
    });
    expect(conexaoDoPostgres(5432, 'postgres', 'banco-producao')).toBe(
      'postgres://postgres@banco-producao:5432/postgres',
    );
  });

  it('o psql usa o host do superusuário e o diz na falha; sem host, continua o 127.0.0.1', async () => {
    const psql = psqlSimulado([0, 1]);
    await rodarSql(psql.ferramentas, superusuarioNoLinux('teste', 's'), 'select 1');
    expect(psql.chamadas[0]?.argumentos).toContain(
      '--dbname=postgres://postgres@banco-teste:5432/postgres',
    );
    await expect(
      rodarSql(psql.ferramentas, superusuarioNoLinux('producao', 's'), 'select 1'),
    ).rejects.toThrow('O psql falhou na instância de banco-producao:5432: connection refused');
    const doWindows = psqlSimulado();
    await rodarSql(doWindows.ferramentas, { porta: 5433, senha: 's' }, 'select 1');
    expect(doWindows.chamadas[0]?.argumentos).toContain(
      '--dbname=postgres://postgres@127.0.0.1:5433/postgres',
    );
  });
});

describe('a espera pelo banco', () => {
  it('pergunta até o banco responder', async () => {
    const psql = psqlSimulado([2, 2, 0]);
    await esperarBanco(psql.ferramentas, superusuarioNoLinux('producao', 's'), {
      esperar: async () => {},
      tentativas: 5,
    });
    expect(psql.chamadas).toHaveLength(3);
    expect(psql.chamadas[0]?.argumentos).toContain('--command=select 1');
  });

  it('desiste depois das tentativas e diz o banco e o motivo', async () => {
    const psql = psqlSimulado([2, 2, 2]);
    await expect(
      esperarBanco(psql.ferramentas, superusuarioNoLinux('teste', 's'), {
        esperar: async () => {},
        tentativas: 3,
      }),
    ).rejects.toThrow(
      'O PostgreSQL de banco-teste:5432 não respondeu a tempo: connection refused. Veja o log dele: docker compose --project-name grafite logs banco-teste',
    );
  });
});

describe('o banco do Grafite em cada contêiner', () => {
  it('espera o banco e roda o SQL dos papéis e do banco, como no Windows', async () => {
    const psql = psqlSimulado();
    const senhas = { dono: 'd', app: 'a', backup: 'b' };
    await prepararBancoNoLinux({
      ferramentas: psql.ferramentas,
      superusuario: superusuarioNoLinux('producao', 'senha-p'),
      banco: 'grafite',
      senhas,
      esperar: async () => {},
    });
    expect(psql.chamadas.map(({ argumentos }) => argumentos.at(-1))).toEqual([
      '--command=select 1',
      '--file=-',
    ]);
    expect(psql.chamadas[1]?.entrada).toBe(sqlDoBanco('grafite', senhas));
    expect(psql.chamadas.every(({ senha }) => senha === 'senha-p')).toBe(true);
  });

  it('o banco.env leva a senha do superusuário, que o PostgreSQL lê na primeira vez', () => {
    expect(variaveisDoBanco('senha-p')).toEqual({ POSTGRES_PASSWORD: 'senha-p' });
  });
});
