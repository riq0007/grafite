// O bash dos testes que rodam scripts do Linux (change servidor-linux-com-docker): no Windows, o do
// Git, porque o do caminho pode ser o do WSL; o de usr\bin, que usa o caminho dado, sem pôr as
// pastas do Git na frente dos simulados.
import { rmSync } from 'node:fs';
import { access, mkdtemp, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const BASH =
  process.env.GRAFITE_BASH ??
  (process.platform === 'win32'
    ? join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'usr', 'bin', 'bash.exe')
    : 'bash');

/**
 * No Linux, as ferramentas de /usr/bin e /bin numa pasta só de links, sem o Docker, que fica ao lado
 * delas, como nos executores do GitHub (change ci-nos-executores-do-github). Uma pasta por
 * processo, apagada na saída dele.
 */
async function ferramentasSemODocker(pastas: readonly string[]): Promise<string> {
  const destino = await mkdtemp(join(tmpdir(), 'grafite-ferramentas-'));
  process.once('exit', () => rmSync(destino, { recursive: true, force: true }));
  for (const pasta of pastas) {
    const nomes = await readdir(pasta).catch(() => [] as string[]);
    // O mesmo nome nas duas pastas, como no /bin que aponta para o /usr/bin, fica com o da primeira.
    await Promise.all(
      nomes
        .filter((nome) => !nome.startsWith('docker'))
        .map((nome) => symlink(join(pasta, nome), join(destino, nome)).catch(() => undefined)),
    );
  }
  return destino;
}

/** As ferramentas do sistema que os scripts usam, como o tar e o sha256sum, sem o Docker. */
export const FERRAMENTAS_DO_SISTEMA =
  process.platform === 'win32'
    ? [dirname(BASH)]
    : [await ferramentasSemODocker(['/usr/bin', '/bin'])];

/** O caminho como o bash o vê: no Windows, C:\pasta vira /c/pasta, que o tar não toma por um host. */
export const noBash = (caminho: string) =>
  caminho
    .replace(/^([A-Za-z]):[\\/]/, (_, letra: string) => `/${letra.toLowerCase()}/`)
    .replaceAll('\\', '/');

/** Se o bash está na máquina: no Windows, o do Git. */
export const temBash = await access(BASH).then(
  () => true,
  () => process.platform !== 'win32',
);
