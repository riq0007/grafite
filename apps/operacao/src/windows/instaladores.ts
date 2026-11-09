// A escolha do instalador de um pré-requisito (change instalador-e-menu-da-operacao, design, decisão
// 3; spec operacao-servicos, "Atalho de instalação"): o da pasta do zip, para o servidor sem
// internet, ou o baixado da fonte oficial para essa pasta. Nos dois casos, só é usado o instalador
// cujo SHA-256 confere com o fixado no pacote. O baixado que não confere é apagado; o que quem opera
// pôs na pasta fica, para ele ver o que trouxe.
import { access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256DoArquivo } from '@grafite/operacao';
import type { Baixador } from './baixador.ts';
import type { Console } from './console.ts';
import type { Prerequisito } from './prerequisitos.ts';

const existe = (caminho: string) =>
  access(caminho).then(
    () => true,
    () => false,
  );

/** O caminho do instalador conferido, na pasta do zip. */
export async function instaladorConferido({
  prerequisito: { arquivo, url, sha256 },
  pastaDoZip,
  baixador,
  console,
}: {
  prerequisito: Prerequisito;
  pastaDoZip: string;
  baixador: Baixador;
  console: Pick<Console, 'escrever'>;
}): Promise<string> {
  const instalador = join(pastaDoZip, arquivo);
  if (await existe(instalador)) {
    if ((await sha256DoArquivo(instalador)) !== sha256) {
      throw new Error(
        `O ${arquivo} da pasta do zip não confere com o hash fixado no pacote: troque-o pelo instalador oficial, de ${url}, ou apague-o para o atalho baixá-lo.`,
      );
    }
    console.escrever(`${arquivo} conferido, da pasta do zip.`);
    return instalador;
  }

  console.escrever(`Baixando o ${arquivo} de ${url}...`);
  let baixado: string;
  try {
    baixado = await baixador.baixar(url, instalador);
  } catch (erro) {
    await rm(instalador, { force: true });
    const motivo = erro instanceof Error ? erro.message : String(erro);
    throw new Error(
      `Falta o ${arquivo} na pasta do zip (${pastaDoZip}), e o download falhou: ${motivo}. Baixe-o de ${url}, ponha-o nessa pasta e rode o atalho de novo.`,
      { cause: erro },
    );
  }
  if (baixado !== sha256) {
    await rm(instalador, { force: true });
    throw new Error(
      `O ${arquivo} baixado de ${url} não confere com o hash fixado no pacote e foi apagado. Nada foi instalado.`,
    );
  }
  console.escrever(`${arquivo} baixado e conferido.`);
  return instalador;
}
