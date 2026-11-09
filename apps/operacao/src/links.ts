// Os links do workspace numa cópia do pacote (design do F2d, decisão 5): um zip não carrega links, e
// a cópia desempacotada à mão, de onde roda o instalar.ps1, não os tem. Antes de carregar o comando,
// que usa os pacotes do workspace, os links que faltam são criados como junções, pelo pacote.json.
// Este arquivo só usa o que vem com o Node: ele roda antes de os pacotes poderem ser carregados.
import { lstat, mkdir, readFile, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Cria os links do pacote que faltam; devolve quantos criou. Fora de um pacote, nenhum. */
export async function garantirLinksDoPacote(pasta: string): Promise<number> {
  let texto: string;
  try {
    texto = await readFile(join(pasta, 'pacote.json'), 'utf8');
  } catch {
    // No repositório, o pnpm já criou os links.
    return 0;
  }
  const { links = [] } = JSON.parse(texto) as { links?: { caminho: string; alvo: string }[] };
  const naPasta = (caminho: string) => join(pasta, ...caminho.split('/'));
  let criados = 0;
  for (const { caminho, alvo } of links) {
    const link = naPasta(caminho);
    const existe = await lstat(link).then(
      () => true,
      () => false,
    );
    if (existe) continue;
    await mkdir(dirname(link), { recursive: true });
    await symlink(naPasta(alvo), link, 'junction');
    criados += 1;
  }
  return criados;
}
