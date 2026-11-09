// As ferramentas do PostgreSQL (design do F2d, decisão 4): no servidor, os binários da instalação
// (`GRAFITE_PG_BIN`); nos testes de integração e no desenvolvimento, as do contêiner do banco, na
// mesma versão dele. A senha vai sempre pelo PGPASSWORD, nunca nos argumentos, que aparecem na
// lista de processos do sistema.
import { spawn } from 'node:child_process';
import { posix, win32 } from 'node:path';

export type FerramentaDoPostgres = 'pg_dump' | 'pg_restore' | 'psql' | 'initdb' | 'pg_ctl';

export interface ResultadoDaFerramenta {
  codigo: number;
  saida: string;
  erro: string;
}

export interface OpcoesDaFerramenta {
  /** A senha do papel da conexão, passada pelo PGPASSWORD. */
  senha?: string;
  /** O que a ferramenta lê do stdin, como os comandos do psql. */
  entrada?: string;
}

export interface FerramentasDoPostgres {
  executar(
    ferramenta: FerramentaDoPostgres,
    argumentos: string[],
    opcoes?: OpcoesDaFerramenta,
  ): Promise<ResultadoDaFerramenta>;
}

export type ExecutarProcesso = (
  arquivo: string,
  argumentos: string[],
  opcoes: { env: Record<string, string | undefined>; entrada?: string },
) => Promise<ResultadoDaFerramenta>;

/** Roda um programa sem shell, com o stdin dado, e devolve o código, a saída e o erro. */
export const executarProcesso: ExecutarProcesso = (arquivo, argumentos, { env, entrada }) =>
  new Promise((resolver, recusar) => {
    const filho = spawn(arquivo, argumentos, {
      env,
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const saida: Buffer[] = [];
    const erro: Buffer[] = [];
    filho.stdout.on('data', (parte: Buffer) => saida.push(parte));
    filho.stderr.on('data', (parte: Buffer) => erro.push(parte));
    filho.on('error', (motivo) =>
      recusar(new Error(`Não foi possível executar ${arquivo}: ${motivo.message}`)),
    );
    filho.on('close', (codigo) =>
      resolver({
        codigo: codigo ?? 1,
        saida: Buffer.concat(saida).toString('utf8'),
        erro: Buffer.concat(erro).toString('utf8'),
      }),
    );
    filho.stdin.on('error', () => {
      // O programa pode sair sem ler a entrada; o código dele diz o que houve.
    });
    filho.stdin.end(entrada ?? '');
  });

/** As ferramentas da pasta `bin` de uma instalação do PostgreSQL. */
export function ferramentasLocais(
  pastaBin: string,
  {
    executar = executarProcesso,
    plataforma = process.platform,
  }: { executar?: ExecutarProcesso; plataforma?: NodeJS.Platform } = {},
): FerramentasDoPostgres {
  const caminhos = plataforma === 'win32' ? win32 : posix;
  return {
    executar: (ferramenta, argumentos, { senha, entrada } = {}) => {
      const env: Record<string, string | undefined> = { ...process.env };
      delete env.PGPASSWORD;
      if (senha !== undefined) env.PGPASSWORD = senha;
      const arquivo = caminhos.join(
        pastaBin,
        plataforma === 'win32' ? `${ferramenta}.exe` : ferramenta,
      );
      return executar(arquivo, argumentos, { env, entrada });
    },
  };
}

/** Roda um comando no contêiner do banco, como o `executarNoConteiner` do banco de teste. */
export type ExecutarNoConteiner = (
  comando: string[],
  opcoes?: { env?: Record<string, string> },
) => Promise<ResultadoDaFerramenta>;

/**
 * O que muda de fora para dentro do contêiner: a pasta do host montada nele e o endereço do banco,
 * que o host alcança por uma porta mapeada e o contêiner, pela dele.
 */
export interface TraducaoDoConteiner {
  pasta?: { noHost: string; noConteiner: string };
  endereco?: { doHost: string; doConteiner: string };
}

function traduzir(argumento: string, { pasta, endereco }: TraducaoDoConteiner): string {
  let traduzido = endereco
    ? argumento.replaceAll(endereco.doHost, endereco.doConteiner)
    : argumento;
  const inicio = pasta ? traduzido.indexOf(pasta.noHost) : -1;
  if (pasta && inicio >= 0) {
    const resto = traduzido.slice(inicio + pasta.noHost.length).replaceAll('\\', '/');
    traduzido = `${traduzido.slice(0, inicio)}${pasta.noConteiner}${resto}`;
  }
  return traduzido;
}

/**
 * As ferramentas do contêiner do banco. O `exec` do contêiner não tem stdin: a entrada vai por uma
 * variável de ambiente e o shell a entrega à ferramenta.
 */
export function ferramentasNoConteiner(
  executarNoConteiner: ExecutarNoConteiner,
  traducao: TraducaoDoConteiner = {},
): FerramentasDoPostgres {
  return {
    executar: (ferramenta, argumentosDoHost, { senha, entrada } = {}) => {
      const argumentos = argumentosDoHost.map((argumento) => traduzir(argumento, traducao));
      const env: Record<string, string> = {};
      if (senha !== undefined) env.PGPASSWORD = senha;
      if (entrada === undefined) return executarNoConteiner([ferramenta, ...argumentos], { env });
      env.GRAFITE_ENTRADA = entrada;
      return executarNoConteiner(
        ['sh', '-c', 'printf "%s" "$GRAFITE_ENTRADA" | "$@"', 'sh', ferramenta, ...argumentos],
        { env },
      );
    },
  };
}

/** A versão do pg_dump, que tem de ser a do servidor para o backup. */
export async function versaoDoPgDump(
  ferramentas: FerramentasDoPostgres,
): Promise<{ maior: number; completa: string }> {
  const { codigo, saida, erro } = await ferramentas.executar('pg_dump', ['--version']);
  const versao = /^pg_dump \(PostgreSQL\) ((\d+)(?:\.\d+)*)/.exec(saida.trim());
  if (codigo !== 0 || !versao?.[1] || !versao[2]) {
    throw new Error(`O pg_dump não respondeu a versão: ${(erro || saida).trim()}`);
  }
  return { maior: Number(versao[2]), completa: versao[1] };
}

/** A conexão sem a senha, para os argumentos, e a senha decodificada, para o PGPASSWORD. */
export function separarSenha(url: string): { url: string; senha: string } {
  const conexao = new URL(url);
  const senha = decodeURIComponent(conexao.password);
  conexao.password = '';
  return { url: conexao.toString(), senha };
}
