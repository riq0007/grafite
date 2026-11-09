// O dono e o modo das pastas no servidor Linux (change servidor-linux-com-docker, design, decisão 4):
// os contêineres da aplicação e do coletor rodam como o usuário `node` das imagens, e o comando de
// operação, como o root. O que o comando grava numa pasta que um app usa, como os arquivos
// restaurados ou um backup feito pelo comando, passa ao usuário dos contêineres, que depois o muda.
import { chmod, chown, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { USUARIO_DOS_CONTEINERES } from '../layout.ts';

/** O dono e o modo das pastas, que os testes simulam. */
export interface Permissoes {
  dono(caminho: string, uid: number, gid: number): Promise<void>;
  modo(caminho: string, modo: number): Promise<void>;
}

export const PERMISSOES_DO_SISTEMA: Permissoes = { dono: chown, modo: chmod };

/** Passa a pasta, com tudo dentro dela, ao usuário dos contêineres. */
export async function acertarDonoDosConteineres(
  pasta: string,
  permissoes: Permissoes,
): Promise<void> {
  const { uid, gid } = USUARIO_DOS_CONTEINERES;
  await permissoes.dono(pasta, uid, gid);
  for (const item of await readdir(pasta, { withFileTypes: true })) {
    const caminho = join(pasta, item.name);
    if (item.isDirectory()) await acertarDonoDosConteineres(caminho, permissoes);
    else await permissoes.dono(caminho, uid, gid);
  }
}
