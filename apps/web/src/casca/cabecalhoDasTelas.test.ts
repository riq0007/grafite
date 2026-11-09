import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// O teste-guarda do cabeçalho da página (spec componentes-base, "Cabeçalho da página"; change
// cabecalho-em-toda-tela, design, decisão 2): toda tela da web mostra o título no CabecalhoDaPagina,
// em todos os estados. O Início, feito de blocos que a conta ordena, fica de fora: o título da
// janela dele é o do bloco "O que resolver agora".

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DE_FORA = new Set(['modulos/inicio/Inicio.tsx']);

/** Os .tsx da web, fora dos testes e das histórias. */
function telas(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return telas(caminho);
    return /\.tsx$/.test(nome) && !/\.(test|stories)\.tsx$/.test(nome) ? [caminho] : [];
  });
}

describe('o cabeçalho da página nas telas', () => {
  it('Título solto numa tela nova: nenhuma tela usa o TituloDaJanela fora do cabeçalho', () => {
    const soltos = telas(RAIZ).flatMap((caminho) => {
      const arquivo = relative(RAIZ, caminho).replaceAll('\\', '/');
      if (DE_FORA.has(arquivo)) return [];
      return readFileSync(caminho, 'utf8')
        .split('\n')
        .flatMap((linha, indice) =>
          /<TituloDaJanela\b/.test(linha) ? [`${arquivo}:${indice + 1}`] : [],
        );
    });
    expect(soltos).toEqual([]);
  });
});
