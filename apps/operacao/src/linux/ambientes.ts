// A configuração dos ambientes no servidor Linux (change servidor-linux-com-docker, design, decisões
// 3, 5 e 10): os arquivos do Windows, com os caminhos e os endereços do Linux, mais o banco.env de
// cada ambiente, com a senha do superusuário do PostgreSQL dele, e o projeto do Compose. Os arquivos
// com segredos ficam só para o root, que é quem os lê: o Compose os passa aos contêineres. A senha do
// superusuário vem do banco.env de antes, com que o PostgreSQL já criou a instância.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  lerSegredos,
  type Segredos,
  type SegredosDeAntes,
  variaveisDaProducao,
  variaveisDoColetor,
  variaveisDoProxy,
  variaveisDoTeste,
} from '../ambientes.ts';
import { gerarConfigEnv, lerConfigEnv } from '../configuracao.ts';
import type { PastasDaInstalacaoNoLinux } from '../layout.ts';
import type { RespostasDaInstalacao } from '../respostas.ts';
import { variaveisDoBanco } from './banco.ts';
import { gerarCompose, gerarEnvDoCompose } from './compose.ts';

/** Os segredos de uma instalação interrompida, com a senha do superusuário de cada banco. */
export async function lerSegredosNoLinux(
  pastas: PastasDaInstalacaoNoLinux,
): Promise<SegredosDeAntes> {
  const antes = await lerSegredos(pastas);
  const superusuario = async (caminho: string) => {
    const { POSTGRES_PASSWORD } = await lerConfigEnv(caminho).catch(
      () => ({}) as Record<string, string>,
    );
    return POSTGRES_PASSWORD ? { superusuario: POSTGRES_PASSWORD } : {};
  };
  return {
    ...antes,
    producao: { ...antes.producao, ...(await superusuario(pastas.producao.bancoEnv)) },
    teste: { ...antes.teste, ...(await superusuario(pastas.teste.bancoEnv)) },
  };
}

/** O modo dos arquivos com segredos: só o root lê e grava. */
const SO_DO_ROOT = 0o600;

/**
 * Grava a configuração de cada ambiente, o banco.env de cada um e o projeto do Compose, com a
 * versão de cada ambiente e o fuso do servidor.
 */
export async function gravarConfiguracoesNoLinux({
  pastas,
  respostas,
  segredos,
  versoes,
  modo,
}: {
  pastas: PastasDaInstalacaoNoLinux;
  respostas: RespostasDaInstalacao;
  segredos: Segredos;
  versoes: { producao: string; teste: string };
  /** Acerta o modo de um arquivo que já existia, como na retomada. */
  modo: (caminho: string, modo: number) => Promise<void>;
}): Promise<void> {
  const { superusuario } = segredos.producao;
  if (superusuario === undefined) {
    throw new Error('O banco da produção no Linux precisa da senha do superusuário.');
  }
  const gravar = async (caminho: string, conteudo: string, permissao = SO_DO_ROOT) => {
    await mkdir(dirname(caminho), { recursive: true });
    await writeFile(caminho, conteudo, { mode: permissao });
    await modo(caminho, permissao);
  };
  await gravar(pastas.producao.configEnv, gerarConfigEnv(variaveisDaProducao(respostas, segredos)));
  await gravar(pastas.teste.configEnv, gerarConfigEnv(variaveisDoTeste(respostas, segredos)));
  await gravar(pastas.coletorEnv, gerarConfigEnv(variaveisDoColetor(respostas, segredos)));
  await gravar(pastas.caddyEnv, gerarConfigEnv(variaveisDoProxy(respostas, segredos)));
  await gravar(pastas.producao.bancoEnv, gerarConfigEnv(variaveisDoBanco(superusuario)));
  await gravar(
    pastas.teste.bancoEnv,
    gerarConfigEnv(variaveisDoBanco(segredos.teste.superusuario)),
  );
  await gravar(
    pastas.compose,
    gerarCompose({
      raiz: pastas.raiz,
      certificado: respostas.certificado,
      destinosDoBackup: respostas.backup.destinos,
    }),
    0o644,
  );
  await gravar(
    pastas.composeEnv,
    gerarEnvDoCompose({ versoes, fuso: respostas.fuso ?? 'Etc/UTC' }),
    0o644,
  );
}
