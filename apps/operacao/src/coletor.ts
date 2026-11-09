// O coletor da produção ligado à organização que opera o servidor (spec operacao-servicos,
// "Instalação do zero" e "Atualização pelo teste antes da produção"; design do P2a, decisão 9): o
// "Servidor", sem faixas, com o token que a configuração do coletor já tem, passado pelo ambiente
// do processo, nunca pela linha de comando, que aparece na lista de processos. O --se-nao-existir
// acha o coletor pelo token, e a segunda vez não muda nada. A produção de antes do coletor ganha no
// coletor.env o endereço da organização e a pasta da fila em disco, restrita como os segredos.
import { access, mkdir, writeFile } from 'node:fs/promises';
import type { ExecutarProcesso } from '@grafite/operacao';
import { gerarConfigEnv, lerConfigEnv } from './configuracao.ts';
import type { PastasDaInstalacao } from './layout.ts';
import type { ScriptsDaVersao } from './versao.ts';
import { restringirAcesso, restringirPasta } from './windows/acl.ts';

export const NOME_DO_COLETOR_DO_SERVIDOR = 'Servidor';

/** O fim da instalação: sem faixas, o coletor não recebe nada para coletar. */
export const CADASTRE_AS_FAIXAS = `  O coletor "${NOME_DO_COLETOR_DO_SERVIDOR}" só coleta depois que as faixas de rede dele forem cadastradas em Administração › Coletores.`;

const existe = (caminho: string) =>
  access(caminho).then(
    () => true,
    () => false,
  );

/** Cria a pasta da fila em disco do coletor, só para os administradores e para os serviços. */
export async function prepararFilaDoColetor(
  executar: ExecutarProcesso,
  pastas: Pick<PastasDaInstalacao, 'filaDoColetor'>,
): Promise<void> {
  await mkdir(pastas.filaDoColetor, { recursive: true });
  await restringirPasta(executar, pastas.filaDoColetor);
}

/**
 * Liga o coletor do servidor à organização do endereço, com as variáveis da produção e o token do
 * coletor no ambiente do comando; devolve o que o comando disse, linha a linha.
 */
export async function ligarColetor({
  scripts,
  variaveisDaProducao,
  token,
  endereco,
}: {
  scripts: ScriptsDaVersao;
  variaveisDaProducao: Record<string, string>;
  token: string;
  endereco: string;
}): Promise<string[]> {
  const { codigo, saida, erro } = await scripts.comandoDaApi(
    { ...variaveisDaProducao, GRAFITE_COLETOR_TOKEN: token },
    [
      'coletor',
      'criar',
      '--endereco',
      endereco,
      '--nome',
      NOME_DO_COLETOR_DO_SERVIDOR,
      '--token-do-ambiente',
      '--se-nao-existir',
    ],
  );
  if (codigo !== 0) {
    throw new Error(
      `O coletor não foi ligado à organização de ${endereco}: ${(erro || saida).trim()}`,
    );
  }
  return saida
    .trim()
    .split('\n')
    .filter((linha) => linha !== '');
}

/**
 * Na atualização, o coletor.env de uma produção de antes do coletor ganha o endereço da organização
 * e a pasta da fila, e a pasta é criada, restrita; o token continua o mesmo. Devolve o token.
 */
export async function completarConfiguracaoDoColetor({
  executar,
  pastas,
  endereco,
}: {
  executar: ExecutarProcesso;
  pastas: Pick<PastasDaInstalacao, 'coletorEnv' | 'filaDoColetor'>;
  endereco: string;
}): Promise<string> {
  const atual = await lerConfigEnv(pastas.coletorEnv);
  const token = atual.GRAFITE_COLETOR_TOKEN;
  if (!token) throw new Error(`Falta GRAFITE_COLETOR_TOKEN em ${pastas.coletorEnv}.`);
  if (atual.GRAFITE_COLETOR_ENDERECO === undefined || atual.GRAFITE_COLETOR_PASTA === undefined) {
    await writeFile(
      pastas.coletorEnv,
      gerarConfigEnv({
        ...atual,
        GRAFITE_COLETOR_ENDERECO: atual.GRAFITE_COLETOR_ENDERECO ?? endereco,
        GRAFITE_COLETOR_PASTA: atual.GRAFITE_COLETOR_PASTA ?? pastas.filaDoColetor,
      }),
    );
    await restringirAcesso(executar, pastas.coletorEnv);
  }
  if (!(await existe(pastas.filaDoColetor))) await prepararFilaDoColetor(executar, pastas);
  return token;
}
