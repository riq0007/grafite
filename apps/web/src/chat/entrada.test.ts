// A entrada do app do chat fica longe da casca (change chat-com-chamados, design, decisão 12): o
// pacote dela passa de 2 MiB, com os módulos, e o colaborador abre o chat no celular.
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** As importações que entram no pacote: as de valor, as reexportações e as dinâmicas. */
const ESTATICAS = /^(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?'([^']+)'/gm;
const DINAMICAS = /import\(\s*'([^']+)'\s*\)/g;

/** Os arquivos do app que a entrada importa, direta ou indiretamente, a partir de src/. */
function alcancados(entrada: string): string[] {
  const vistos = new Set<string>();
  const pendentes = [resolve(SRC, entrada)];
  for (let arquivo = pendentes.pop(); arquivo !== undefined; arquivo = pendentes.pop()) {
    if (vistos.has(arquivo)) continue;
    vistos.add(arquivo);
    const codigo = readFileSync(arquivo, 'utf8');
    const caminhos = [
      ...[...codigo.matchAll(ESTATICAS)]
        .filter(([, tipo]) => !tipo)
        .map(([, , caminho]) => caminho),
      ...[...codigo.matchAll(DINAMICAS)].map(([, caminho]) => caminho),
    ];
    for (const caminho of caminhos) {
      if (caminho?.startsWith('.') && /\.tsx?$/.test(caminho)) {
        pendentes.push(resolve(dirname(arquivo), caminho));
      }
    }
  }
  return [...vistos].map((arquivo) => relative(SRC, arquivo).replaceAll('\\', '/')).sort();
}

describe('a entrada do app do chat', () => {
  const arquivos = alcancados('chat/main.tsx');

  it('chega ao app do chat, com a sessão e as preferências', () => {
    expect(arquivos).toEqual(
      expect.arrayContaining([
        'chat/AppDoChat.tsx',
        'chat/rotas.tsx',
        'sessao/Porta.tsx',
        'preferencias/usePreferencias.tsx',
      ]),
    );
  });

  it('não chega ao roteador da casca, à casca nem ao registro dos módulos', () => {
    expect(arquivos).not.toContain('rotas/arvore.ts');
    expect(arquivos).not.toContain('modulos/registro.ts');
    expect(arquivos.filter((arquivo) => arquivo.startsWith('casca/'))).toEqual([]);
  });
});
