// Contraste WCAG 2.2 (luminância relativa sRGB) e composição de cores translúcidas.

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/;
const RGBA =
  /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/;

function lerCor(cor: string): Rgba {
  const texto = cor.trim().toLowerCase();
  const hex = HEX.exec(texto)?.[1];
  if (hex) {
    const cheio = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    return {
      r: Number.parseInt(cheio.slice(0, 2), 16),
      g: Number.parseInt(cheio.slice(2, 4), 16),
      b: Number.parseInt(cheio.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgba = RGBA.exec(texto);
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  throw new Error(`Cor não reconhecida: ${cor}`);
}

const doisDigitos = (v: number) => Math.round(v).toString(16).padStart(2, '0');

export function paraHex(cor: string): string {
  const { r, g, b } = lerCor(cor);
  return `#${doisDigitos(r)}${doisDigitos(g)}${doisDigitos(b)}`;
}

/** A mesma cor com outra opacidade, em rgba(). */
export function comAlfa(cor: string, alfa: number): string {
  const { r, g, b } = lerCor(cor);
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

/** Cor (possivelmente translúcida) já composta sobre um fundo opaco. */
export function compor(frente: string, fundo: string): string {
  const f = lerCor(frente);
  const b = lerCor(fundo);
  const mistura = (x: number, y: number) => f.a * x + (1 - f.a) * y;
  return `#${doisDigitos(mistura(f.r, b.r))}${doisDigitos(mistura(f.g, b.g))}${doisDigitos(mistura(f.b, b.b))}`;
}

function canal(valor: number): number {
  const s = valor / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminancia(cor: string): number {
  const { r, g, b } = lerCor(cor);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Razão de contraste entre duas cores; a da frente pode ser translúcida. */
export function contraste(frente: string, fundo: string): number {
  const l1 = luminancia(compor(frente, fundo));
  const l2 = luminancia(fundo);
  const [claro, escuro] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (claro + 0.05) / (escuro + 0.05);
}
