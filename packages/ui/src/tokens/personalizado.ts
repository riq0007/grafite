// O tema e o destaque personalizados (change tema-personalizado, design, decisões 2 e 6): as
// entradas em escalas de gente, convertidas para o gerador, as variáveis que a web aplica no <html>,
// o lápis do contraste e a trilha das matizes do controle deslizante.
import {
  coresDaSituacao,
  coresDoDestaque,
  coresDosDados,
  coresDoTema,
  type Declaracoes,
} from './declaracoes.ts';
import { destaques, type IdDoDestaque } from './destaques.ts';
import { type DestaqueGerado, gerarDestaque } from './gerador.ts';
import { oklchParaHex } from './oklch.ts';
import type { Tom } from './papeis.ts';
import { montarTema, type Tema } from './temas.ts';

/** O tom, a matiz da base em graus, o tingimento dos cinzas em % e o contraste, de 0 a 100. */
export interface EntradaDoTemaPersonalizado {
  tom: Tom;
  matiz: number;
  tingimento: number;
  contraste: number;
}

/** A matiz em graus e a intensidade em %, em que 0 é o monocromático. */
export interface EntradaDoDestaquePersonalizado {
  matiz: number;
  intensidade: number;
}

/** O croma da base com 100% de tingimento: o máximo do gerador (0,06). Em inteiros, sem resto. */
const cromaDaBase = (tingimento: number) => (tingimento * 6) / 10000;

/** O croma do destaque com 100% de intensidade: 0,2, acima do azul de fábrica (0,17). */
const cromaDoDestaque = (intensidade: number) => (intensidade * 2) / 1000;

/**
 * Guarda os últimos resultados pela chave: o arraste do controle e cada pintura repetem as mesmas
 * entradas, e a busca do gerador custa alguns milissegundos.
 */
function lembrar<R>(limite: number) {
  const guardados = new Map<string, R>();
  return (chave: string, fazer: () => R): R => {
    const guardado = guardados.get(chave);
    if (guardado) return guardado;
    const feito = fazer();
    guardados.set(chave, feito);
    if (guardados.size > limite) guardados.delete(guardados.keys().next().value as string);
    return feito;
  };
}

const temasGerados = lembrar<Tema>(16);
const destaquesGerados = lembrar<DestaqueGerado>(16);

/** O tema do Personalizado, montado como os de fábrica. */
export function temaPersonalizado(entrada: EntradaDoTemaPersonalizado): Tema {
  const { tom, matiz, tingimento, contraste } = entrada;
  return temasGerados(`${tom}/${matiz}/${tingimento}/${contraste}`, () =>
    montarTema('Personalizado', {
      tom,
      base: { matiz, croma: cromaDaBase(tingimento) },
      contraste,
    }),
  );
}

/** O destaque do Personalizado, gerado para o tema dado, de fábrica ou personalizado. */
export function destaquePersonalizado(
  tema: Tema,
  entrada: EntradaDoDestaquePersonalizado,
): DestaqueGerado {
  const chave = `${JSON.stringify(tema.entrada)}|${entrada.matiz}/${entrada.intensidade}`;
  return destaquesGerados(chave, () =>
    gerarDestaque(tema, { matiz: entrada.matiz, croma: cromaDoDestaque(entrada.intensidade) }),
  );
}

/** Um destaque de fábrica, como o verde, gerado para o tema personalizado. */
export function destaqueDeFabrica(tema: Tema, id: IdDoDestaque): DestaqueGerado {
  return destaquesGerados(`${JSON.stringify(tema.entrada)}|${id}`, () =>
    gerarDestaque(tema, destaques[id]),
  );
}

/**
 * As variáveis de cor e de sombra de um tema e de um destaque, como o tokens.css as escreve, sem o
 * `color-scheme`, que vem do tema de fábrica do mesmo tom.
 */
export function variaveisDeCor(tema: Tema, destaque: DestaqueGerado): Record<string, string> {
  const declaracoes: Declaracoes = [
    ...coresDoTema(tema).filter(([nome]) => nome.startsWith('--')),
    ...coresDaSituacao(tema),
    ...coresDosDados(tema),
    ...coresDoDestaque(destaque),
  ];
  return Object.fromEntries(declaracoes);
}

/** As variáveis só do destaque, para o destaque personalizado sobre um tema de fábrica. */
export function variaveisDoDestaque(destaque: DestaqueGerado): Record<string, string> {
  return Object.fromEntries(coresDoDestaque(destaque));
}

/** A dureza do lápis de cada faixa do contraste, do mais leve ao mais forte (decisão 6). */
const LAPIS: ReadonlyArray<[number, string]> = [
  [85, '4B'],
  [70, '2B'],
  [55, 'B'],
  [35, 'HB'],
  [20, 'H'],
  [0, '2H'],
];

/** A dureza do lápis de grafite para o contraste, de 2H a 4B, com o HB no padrão, 45. */
export function lapisDoContraste(contraste: number): string {
  return LAPIS.find(([desde]) => contraste >= desde)?.[1] ?? '2H';
}

/**
 * A trilha do controle da matiz: a volta das matizes, de 30 em 30 graus, na luminosidade e no croma
 * dados. A cor que não cabe no sRGB perde croma, como no gerador.
 */
export function trilhaDasMatizes(luminosidade: number, croma: number): string {
  const paradas = Array.from({ length: 13 }, (_, indice) => {
    const matiz = indice * 30;
    const cor = oklchParaHex({ l: luminosidade, c: croma, h: matiz });
    return `${cor} ${Math.round((matiz / 360) * 100)}%`;
  });
  return `linear-gradient(to right, ${paradas.join(', ')})`;
}
