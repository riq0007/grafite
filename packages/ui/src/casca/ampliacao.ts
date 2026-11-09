// Ampliação do dock sob o ponteiro (design, decisão 7): função pura, chamada a cada quadro.
import { ampliacaoDoDock } from '../tokens/escalas.ts';

export interface Ampliacao {
  escalas: number[];
  /** Quanto cada item se desloca no eixo do dock, em px, para os ampliados não se sobreporem. */
  deslocamentos: number[];
}

interface ItemAmpliado {
  centro: number;
  escala: number;
  largura: number;
  /** Centro no arranjo ampliado, antes do ajuste que devolve o ponteiro ao lugar. */
  novo: number;
}

/**
 * Escala e deslocamento de cada item para a posição do ponteiro ao longo do dock.
 *
 * `centros` são os centros dos itens em repouso, no eixo do dock, e `tamanho` é o lado do item.
 * Os itens crescem numa gaussiana (até +55%, σ = 1,3 × tamanho) e se afastam mantendo o espaço
 * de repouso entre cada par (o do separador inclusive). O ponto sob o ponteiro continua sob ele.
 */
export function ampliar(
  centros: readonly number[],
  tamanho: number,
  ponteiro: number | null,
): Ampliacao {
  if (ponteiro === null) {
    return { escalas: centros.map(() => 1), deslocamentos: centros.map(() => 0) };
  }
  const sigma = ampliacaoDoDock.sigma * tamanho;
  const metade = tamanho / 2;

  // Centros ampliados, contíguos a partir de 0, com o espaço de repouso entre cada par.
  let anterior: ItemAmpliado | undefined;
  const itens = centros.map((centro): ItemAmpliado => {
    const distancia = ponteiro - centro;
    const escala = 1 + ampliacaoDoDock.maxima * Math.exp(-(distancia ** 2) / (2 * sigma ** 2));
    const largura = escala * tamanho;
    const novo =
      anterior === undefined
        ? 0
        : anterior.novo + anterior.largura / 2 + (centro - anterior.centro - tamanho) + largura / 2;
    anterior = { centro, escala, largura, novo };
    return anterior;
  });

  const ajuste = ponteiro - mapear(itens, metade, ponteiro);
  return {
    escalas: itens.map((item) => item.escala),
    deslocamentos: itens.map((item) => item.novo + ajuste - item.centro),
  };
}

/**
 * Onde um ponto em repouso cai no arranjo ampliado: dentro de um item, a distância ao centro
 * cresce com a escala do item; nos espaços e fora do dock, a distância não muda.
 */
function mapear(itens: readonly ItemAmpliado[], metade: number, x: number): number {
  const primeiro = itens[0];
  const ultimo = itens.at(-1);
  if (primeiro === undefined || ultimo === undefined) return x;
  if (x < primeiro.centro - metade) {
    return primeiro.novo - primeiro.largura / 2 + (x - (primeiro.centro - metade));
  }
  let anterior: ItemAmpliado | undefined;
  for (const item of itens) {
    if (x <= item.centro + metade) {
      if (x >= item.centro - metade || anterior === undefined) {
        return item.novo + (x - item.centro) * item.escala;
      }
      return anterior.novo + anterior.largura / 2 + (x - (anterior.centro + metade));
    }
    anterior = item;
  }
  return ultimo.novo + ultimo.largura / 2 + (x - (ultimo.centro + metade));
}
