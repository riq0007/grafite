// As junções `atual` e `anterior` de cada ambiente (design do F2d, decisão 2): apontam para uma
// pasta de `versoes\`. Uma junção não pede a conta de administrador para ser criada e é seguida pelo
// Node e pelo WinSW como uma pasta. Trocar o alvo tira só a junção, nunca o conteúdo da versão.
import { lstat, readlink, rmdir, symlink, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface Juncoes {
  apontar(juncao: string, alvo: string): Promise<void>;
  /** O alvo da junção, ou `null` quando ela não existe. */
  ler(juncao: string): Promise<string | null>;
}

export function juncoesDoSistema(): Juncoes {
  return {
    async apontar(juncao, alvo) {
      const existente = await lstat(juncao).catch(() => null);
      if (existente) {
        if (!existente.isSymbolicLink()) {
          throw new Error(`${juncao} existe e não é uma junção; nada foi trocado.`);
        }
        // No Windows, a junção sai como pasta vazia; nos outros sistemas, como link.
        await (process.platform === 'win32' ? rmdir(juncao) : unlink(juncao));
      }
      await symlink(resolve(alvo), juncao, 'junction');
    },

    async ler(juncao) {
      const alvo = await readlink(juncao).catch(() => null);
      return alvo === null ? null : resolve(alvo.replace(/^\\\\\?\\/, ''));
    },
  };
}
