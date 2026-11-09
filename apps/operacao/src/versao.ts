// Os scripts de uma versão instalada (design do F2d, decisões 4 e 7), cada um num processo do Node à
// parte: as migrations do packages/db e o comando da API (organizacao e conta). Cada versão roda com
// o próprio código, então o comando de operação de uma versão migra o banco para outra. O processo
// recebe só as variáveis dadas, sem as do Grafite que estiverem no terminal de quem opera.
import { basename, join } from 'node:path';
import type { ExecutarProcesso, ResultadoDaFerramenta } from '@grafite/operacao';

interface Processo {
  executar: ExecutarProcesso;
  /** O node.exe que roda a versão. */
  node: string;
  /** A pasta da versão, como `versoes\0.5.0`. */
  pastaDaVersao: string;
}

/** O ambiente do terminal sem as variáveis do Grafite, mais as dadas. */
export function ambienteCom(variaveis: Record<string, string>): Record<string, string | undefined> {
  const limpo = Object.fromEntries(
    Object.entries(process.env).filter(([nome]) => !nome.startsWith('GRAFITE_')),
  );
  return { ...limpo, ...variaveis };
}

/** Aplica as migrations da versão no banco da conexão do dono das tabelas. */
export async function migrarBanco({
  executar,
  node,
  pastaDaVersao,
  urlDono,
}: Processo & { urlDono: string }): Promise<void> {
  const { codigo, saida, erro } = await executar(
    node,
    [join(pastaDaVersao, 'packages', 'db', 'src', 'migrar.ts')],
    { env: ambienteCom({ GRAFITE_DATABASE_URL_MIGRACOES: urlDono }) },
  );
  if (codigo !== 0) {
    throw new Error(
      `As migrations da versão ${basename(pastaDaVersao)} falharam: ${(erro || saida).trim()}`,
    );
  }
}

/** Roda o comando da API da versão (`organizacao`, `conta`) com as variáveis do ambiente. */
export function comandoDaApi({
  executar,
  node,
  pastaDaVersao,
  variaveis,
  argumentos,
}: Processo & {
  variaveis: Record<string, string>;
  argumentos: string[];
}): Promise<ResultadoDaFerramenta> {
  return executar(
    node,
    [join(pastaDaVersao, 'apps', 'api', 'scripts', 'grafite.ts'), ...argumentos],
    {
      env: ambienteCom(variaveis),
    },
  );
}

/**
 * Os scripts de uma versão, nas duas plataformas (change servidor-linux-com-docker, design, decisão
 * 8): no Windows, pelo Node do servidor na pasta da versão; no Linux, pela imagem da aplicação.
 */
export interface ScriptsDaVersao {
  /** Aplica as migrations da versão no banco da conexão do dono das tabelas. */
  migrarBanco(urlDono: string): Promise<void>;
  /** Roda o comando da API da versão com as variáveis dadas. */
  comandoDaApi(
    variaveis: Record<string, string>,
    argumentos: string[],
  ): Promise<ResultadoDaFerramenta>;
}

/** Os scripts da versão desempacotada no Windows. */
export const scriptsDoWindows = (processo: Processo): ScriptsDaVersao => ({
  migrarBanco: (urlDono) => migrarBanco({ ...processo, urlDono }),
  comandoDaApi: (variaveis, argumentos) => comandoDaApi({ ...processo, variaveis, argumentos }),
});
