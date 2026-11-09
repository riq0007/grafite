// O PostgreSQL em contêiner no servidor Linux (change servidor-linux-com-docker, design, decisão 5):
// cada ambiente tem o próprio contêiner do PostgreSQL 18, com a senha do superusuário gerada na
// instalação e lida pelo PostgreSQL só na primeira vez, do banco.env. O comando de operação chega a
// ele pelo nome do serviço na rede interna, espera o banco responder e cria os papéis e o banco do
// Grafite com o mesmo SQL do Windows, que pode rodar de novo na retomada.
import type { FerramentasDoPostgres } from '@grafite/operacao';
import { rodarSql, type SenhasDoBanco, type Superusuario, sqlDoBanco } from '../banco.ts';
import type { AmbienteInstalado } from '../estado.ts';
import { enderecosDoAmbiente } from '../layout.ts';

/** O superusuário do banco de um ambiente, pelo nome do serviço na rede interna. */
export function superusuarioNoLinux(ambiente: AmbienteInstalado, senha: string): Superusuario {
  const { host, porta } = enderecosDoAmbiente('linux', ambiente).banco;
  return { host, porta, senha };
}

/** O banco.env de um ambiente: a senha do superusuário, que o PostgreSQL lê ao criar a instância. */
export function variaveisDoBanco(senhaDoSuperusuario: string): Record<string, string> {
  return { POSTGRES_PASSWORD: senhaDoSuperusuario };
}

/** Espera o PostgreSQL do contêiner aceitar o superusuário, a 1 s por tentativa. */
export async function esperarBanco(
  ferramentas: FerramentasDoPostgres,
  { host = '127.0.0.1', porta, senha }: Superusuario,
  {
    esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
    tentativas = 60,
  }: { esperar?: (ms: number) => Promise<void>; tentativas?: number } = {},
): Promise<void> {
  let motivo = '';
  for (let tentativa = 0; tentativa < tentativas; tentativa += 1) {
    const { codigo, saida, erro } = await ferramentas.executar(
      'psql',
      [
        '--no-psqlrc',
        '--quiet',
        `--dbname=postgres://postgres@${host}:${porta}/postgres`,
        '--command=select 1',
      ],
      { senha },
    );
    if (codigo === 0) return;
    motivo = (erro || saida).trim();
    await esperar(1000);
  }
  throw new Error(
    `O PostgreSQL de ${host}:${porta} não respondeu a tempo: ${motivo}. Veja o log dele: docker compose --project-name grafite logs ${host}`,
  );
}

/** Espera o banco do ambiente e cria, ou acerta, os papéis e o banco do Grafite nele. */
export async function prepararBancoNoLinux({
  ferramentas,
  superusuario,
  banco,
  senhas,
  esperar,
  tentativas,
}: {
  ferramentas: FerramentasDoPostgres;
  superusuario: Superusuario;
  banco: string;
  senhas: SenhasDoBanco;
  esperar?: (ms: number) => Promise<void>;
  tentativas?: number;
}): Promise<void> {
  await esperarBanco(ferramentas, superusuario, { esperar, tentativas });
  await rodarSql(ferramentas, superusuario, sqlDoBanco(banco, senhas));
}
