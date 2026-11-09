// Os scripts de uma versão no servidor Linux (change servidor-linux-com-docker, design, decisão 8): as
// migrations e o comando da API rodam num contêiner descartável da imagem da aplicação da versão, na
// rede interna, onde os bancos atendem pelo nome do serviço. As variáveis vão pelo nome, com o valor
// no ambiente do cliente do Docker, como o versao.ts as passa no Windows: nenhuma senha fica na
// linha de comando, que a lista de processos mostra.
import type { ExecutarProcesso } from '@grafite/operacao';
import { REDE_NO_LINUX } from '../layout.ts';
import { ambienteCom, type ScriptsDaVersao } from '../versao.ts';
import { imagemDaVersao } from './pacote.ts';

export function scriptsDoLinux({
  executar,
  versao,
}: {
  executar: ExecutarProcesso;
  versao: string;
}): ScriptsDaVersao {
  const rodar = (variaveis: Record<string, string>, script: string, argumentos: string[] = []) =>
    executar(
      'docker',
      [
        'run',
        '--rm',
        '--pull',
        'never',
        '--network',
        REDE_NO_LINUX.nome,
        ...Object.keys(variaveis).flatMap((nome) => ['-e', nome]),
        imagemDaVersao('aplicacao', versao),
        'node',
        script,
        ...argumentos,
      ],
      { env: ambienteCom(variaveis) },
    );

  return {
    async migrarBanco(urlDono) {
      const { codigo, saida, erro } = await rodar(
        { GRAFITE_DATABASE_URL_MIGRACOES: urlDono },
        'packages/db/src/migrar.ts',
      );
      if (codigo !== 0) {
        throw new Error(`As migrations da versão ${versao} falharam: ${(erro || saida).trim()}`);
      }
    },
    comandoDaApi: (variaveis, argumentos) =>
      rodar(variaveis, 'apps/api/scripts/grafite.ts', argumentos),
  };
}
