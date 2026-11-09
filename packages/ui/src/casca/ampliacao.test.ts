import { describe, expect, it } from 'vitest';
import { ampliar } from './ampliacao.ts';

// Cinco itens de 48 px com 4 px de espaço: centros a cada 52 px. Os valores esperados foram
// calculados à mão: σ = 1,3 × 48 = 62,4; escala = 1 + 0,55 × e^(−d² / 2σ²).
const CENTROS = [24, 76, 128, 180, 232];

/** Elemento da lista, falhando o teste se o índice não existir. */
function em(lista: readonly number[], indice: number): number {
  const valor = lista[indice];
  if (valor === undefined) throw new Error(`sem o índice ${indice}`);
  return valor;
}

describe('ampliar', () => {
  it('o item sob o ponteiro, de 48 px, chega a cerca de 74 px; os vizinhos crescem menos', () => {
    const { escalas } = ampliar(CENTROS, 48, 128);
    expect(em(escalas, 2) * 48).toBeCloseTo(74.4, 1);
    expect(em(escalas, 1)).toBeCloseTo(1.3887, 3);
    expect(em(escalas, 3)).toBeCloseTo(1.3887, 3);
    expect(em(escalas, 0)).toBeCloseTo(1.1371, 3);
    expect(em(escalas, 4)).toBeCloseTo(1.1371, 3);
  });

  it('afasta os vizinhos para os itens ampliados não se sobreporem', () => {
    const { deslocamentos } = ampliar(CENTROS, 48, 128);
    expect(em(deslocamentos, 2)).toBeCloseTo(0, 5);
    expect(em(deslocamentos, 3)).toBeCloseTo(22.53, 1);
    expect(em(deslocamentos, 1)).toBeCloseTo(-22.53, 1);
    expect(em(deslocamentos, 4)).toBeCloseTo(35.15, 1);
    expect(em(deslocamentos, 0)).toBeCloseTo(-35.15, 1);
  });

  it('mantém o espaço de repouso entre cada par, inclusive o do separador', () => {
    // O último item vem depois de um separador: 16 px de espaço em vez de 4.
    const centros = [24, 76, 128, 192];
    const { escalas, deslocamentos } = ampliar(centros, 48, 100);
    const bordas = centros.map((centro, i) => {
      const novoCentro = centro + em(deslocamentos, i);
      const metade = (em(escalas, i) * 48) / 2;
      return [novoCentro - metade, novoCentro + metade] as const;
    });
    const espaco = (i: number) =>
      (bordas[i + 1]?.[0] ?? Number.NaN) - (bordas[i]?.[1] ?? Number.NaN);
    expect(espaco(0)).toBeCloseTo(4, 5);
    expect(espaco(1)).toBeCloseTo(4, 5);
    expect(espaco(2)).toBeCloseTo(16, 5);
  });

  it('o ponto sob o ponteiro continua sob o ponteiro', () => {
    const { escalas, deslocamentos } = ampliar(CENTROS, 48, 140);
    const novoCentro = em(CENTROS, 2) + em(deslocamentos, 2);
    // 12 px à direita do centro em repouso viram 12 × escala à direita do centro ampliado.
    expect(novoCentro + 12 * em(escalas, 2)).toBeCloseTo(140, 5);
  });

  it('sem ponteiro, nada muda', () => {
    expect(ampliar(CENTROS, 48, null)).toEqual({
      escalas: [1, 1, 1, 1, 1],
      deslocamentos: [0, 0, 0, 0, 0],
    });
  });
});
