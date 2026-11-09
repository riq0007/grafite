// A pasta do armazenamento em disco (spec plataforma-base; design do F2c, decisão 17): conferida na
// partida, antes de a API atender. A pasta que falta é criada, e a gravação é provada com um arquivo
// que é apagado em seguida.
import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ErroDeConfiguracao } from '../config.ts';

export async function prepararPastaDosArquivos(pasta: string): Promise<void> {
  const prova = join(pasta, `.prova-de-gravacao-${randomBytes(6).toString('hex')}`);
  try {
    await mkdir(pasta, { recursive: true });
    await writeFile(prova, '');
    await rm(prova);
  } catch (erro) {
    const codigo = (erro as NodeJS.ErrnoException).code ?? 'erro desconhecido';
    throw new ErroDeConfiguracao(
      ['GRAFITE_ARQUIVOS_PASTA'],
      [`GRAFITE_ARQUIVOS_PASTA: a pasta ${pasta} não aceita gravação (${codigo}).`],
    );
  }
}
