// Conversão entre o OKLCH, onde o gerador de temas trabalha (design da fundamentos-v3, decisão 1),
// e o sRGB em hexadecimal, que vai para o CSS e para a verificação de contraste. A cor fora do
// sRGB perde croma até caber, com a mesma luminosidade e a mesma matiz.

export interface Oklch {
  /** Luminosidade, de 0 a 1. */
  l: number;
  /** Croma, de 0 a ~0,37. */
  c: number;
  /** Matiz, em graus. */
  h: number;
}

type Rgb = [number, number, number];

const FOLGA = 1e-5;

function paraRgbLinear({ l, c, h }: Oklch): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1,
    -1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1,
    -0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1,
  ];
}

const limitar = (valor: number, minimo: number, maximo: number) =>
  Math.min(maximo, Math.max(minimo, valor));

export function dentroDoGamute(cor: Oklch): boolean {
  return paraRgbLinear(cor).every((canal) => canal >= -FOLGA && canal <= 1 + FOLGA);
}

/** A mesma cor com o maior croma que cabe no sRGB, por busca binária. */
function noGamute(cor: Oklch): Oklch {
  const l = limitar(cor.l, 0, 1);
  const pedido = { ...cor, l, c: Math.max(0, cor.c) };
  if (dentroDoGamute(pedido)) return pedido;
  let cabe = 0;
  let naoCabe = pedido.c;
  for (let passo = 0; passo < 24; passo++) {
    const meio = (cabe + naoCabe) / 2;
    if (dentroDoGamute({ ...pedido, c: meio })) cabe = meio;
    else naoCabe = meio;
  }
  return { ...pedido, c: cabe };
}

const codificar = (linear: number) => {
  const v = limitar(linear, 0, 1);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
};

const decodificar = (canal: number) =>
  canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;

const doisDigitos = (canal: number) =>
  Math.round(codificar(canal) * 255)
    .toString(16)
    .padStart(2, '0');

export function oklchParaHex(cor: Oklch): string {
  return `#${paraRgbLinear(noGamute(cor)).map(doisDigitos).join('')}`;
}

export function paraOklch(hex: string): Oklch {
  const texto = hex.replace('#', '');
  const canal = (inicio: number) =>
    decodificar(Number.parseInt(texto.slice(inicio, inicio + 2), 16) / 255);
  const r = canal(0);
  const g = canal(2);
  const b = canal(4);
  const l1 = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m1 = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s1 = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const l = 0.2104542553 * l1 + 0.793617785 * m1 - 0.0040720468 * s1;
  const a = 1.9779984951 * l1 - 2.428592205 * m1 + 0.4505937099 * s1;
  const bb = 0.0259040371 * l1 + 0.7827717662 * m1 - 0.808675766 * s1;
  const h = (Math.atan2(bb, a) * 180) / Math.PI;
  return { l, c: Math.hypot(a, bb), h: h < 0 ? h + 360 : h };
}
