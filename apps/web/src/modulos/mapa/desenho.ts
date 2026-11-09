// O desenho do mapa (spec mapa-da-planta, "Mapa navegável"; change p7-mapa-da-planta, design,
// decisão 5): a vista em pixels por metro e o deslocamento, a planta inteira na tela, a conversão
// entre a planta e a tela, o zoom em torno de um ponto, o marcador sob o ponteiro e os textos que
// cabem sem se sobrepor. Funções puras: o canvas só desenha o que elas dizem.

export interface Vista {
  /** Pixels por metro. */
  escala: number;
  /** Onde fica o ponto (0, 0) da planta, em pixels da tela. */
  dx: number;
  dy: number;
}

export interface Ponto {
  x: number;
  y: number;
}

/** A menor e a maior escala do zoom, em pixels por metro. */
export const LIMITES_DO_ZOOM = { minima: 0.2, maxima: 200 } as const;

/** A partir de quantos pixels por metro os textos do desenho aparecem. */
export const ESCALA_DOS_TEXTOS = 5;

/** A vista com a planta inteira no centro da área, com uma margem de 5%. */
export function vistaDaPlantaInteira(
  planta: { largura: number; profundidade: number },
  area: { largura: number; altura: number },
): Vista {
  const escala = Math.max(
    LIMITES_DO_ZOOM.minima,
    Math.min(
      area.largura / Math.max(planta.largura, 1),
      area.altura / Math.max(planta.profundidade, 1),
    ) * 0.95,
  );
  return {
    escala,
    dx: (area.largura - planta.largura * escala) / 2,
    dy: (area.altura - planta.profundidade * escala) / 2,
  };
}

/** O ponto da planta, em metros, na tela. */
export const naTela = (vista: Vista, x: number, z: number): Ponto => ({
  x: vista.dx + x * vista.escala,
  y: vista.dy + z * vista.escala,
});

/** O ponto da tela na planta, em metros. */
export const naPlanta = (vista: Vista, ponto: Ponto) => ({
  x: (ponto.x - vista.dx) / vista.escala,
  z: (ponto.y - vista.dy) / vista.escala,
});

/** O zoom pelo fator, mantendo parado o ponto da tela dado, como o do ponteiro. */
export function zoomEm(vista: Vista, fator: number, ponto: Ponto): Vista {
  const escala = Math.min(
    LIMITES_DO_ZOOM.maxima,
    Math.max(LIMITES_DO_ZOOM.minima, vista.escala * fator),
  );
  const real = escala / vista.escala;
  return {
    escala,
    dx: ponto.x - (ponto.x - vista.dx) * real,
    dy: ponto.y - (ponto.y - vista.dy) * real,
  };
}

/** A vista com o ponto da planta no centro da área, na escala dada. */
export function centrarEm(
  x: number,
  z: number,
  escala: number,
  area: { largura: number; altura: number },
): Vista {
  return { escala, dx: area.largura / 2 - x * escala, dy: area.altura / 2 - z * escala };
}

/** O marcador mais perto do ponto da tela, dentro do raio em pixels, ou `null`. */
export function marcadorNoPonto<M extends { x: number; z: number }>(
  marcadores: readonly M[],
  vista: Vista,
  ponto: Ponto,
  raio = 12,
): M | null {
  let melhor: M | null = null;
  let menor = raio;
  for (const marcador of marcadores) {
    const { x, y } = naTela(vista, marcador.x, marcador.z);
    const distancia = Math.hypot(x - ponto.x, y - ponto.y);
    if (distancia <= menor) {
      menor = distancia;
      melhor = marcador;
    }
  }
  return melhor;
}

/**
 * Os textos do desenho que entram na tela sem se sobrepor: a área é dividida em faixas do tamanho de
 * um texto, e cada faixa recebe um só. Abaixo da escala dos textos, nenhum.
 */
export function rotulosVisiveis<R extends { texto: string; x: number; z: number }>(
  rotulos: readonly R[],
  vista: Vista,
  area: { largura: number; altura: number },
  celula = { largura: 96, altura: 18 },
): (R & Ponto)[] {
  if (vista.escala < ESCALA_DOS_TEXTOS) return [];
  const ocupadas = new Set<string>();
  const visiveis: (R & Ponto)[] = [];
  for (const rotulo of rotulos) {
    const { x, y } = naTela(vista, rotulo.x, rotulo.z);
    if (x < 0 || y < 0 || x > area.largura || y > area.altura) continue;
    const chave = `${Math.floor(x / celula.largura)}:${Math.floor(y / celula.altura)}`;
    if (ocupadas.has(chave)) continue;
    ocupadas.add(chave);
    visiveis.push({ ...rotulo, x, y });
  }
  return visiveis;
}
