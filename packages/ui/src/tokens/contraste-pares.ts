// Contraste por uso real (spec design-tokens, "Contraste verificado automaticamente"):
// cada par é uma cor usada sobre um fundo, com o mínimo WCAG 2.2 AA do uso.
// Fundos translúcidos (material, barra, tintas) são medidos já compostos.
import { comAlfa, compor, contraste } from './contraste.ts';
import { destaqueDoTema, destaques } from './destaques.ts';
import { TINTA_DO_ROTULO_NEUTRO } from './escalas.ts';
import { camadasDeEstado, coresDoCursor, temas } from './temas.ts';

export type Cores = Record<string, string>;
export type Fundo = string | { camada: string; sobre: string };

export interface Par {
  uso: string;
  frente: (c: Cores) => string;
  fundo: (c: Cores) => Fundo;
  minimo: number;
}

export interface Resultado {
  uso: string;
  razao: number;
  minimo: number;
  passou: boolean;
}

const TEXTO = 4.5;
/** O texto de exemplo dos campos, o secundário sobre a afundada: o nível AAA. */
const TEXTO_DE_EXEMPLO = 7;
const COMPONENTE = 3;

const sobre = (camada: string, base: string): Fundo => ({ camada, sobre: base });

const NOMES_DAS_SITUACOES: Record<string, string> = {
  ok: 'de sucesso',
  atencao: 'de atenção',
  critico: 'crítico',
  info: 'de informação',
};

export const PARES: Par[] = [
  {
    uso: 'texto sobre o fundo',
    frente: (c) => c.texto ?? '',
    fundo: (c) => c.fundo ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre a superfície',
    frente: (c) => c.texto ?? '',
    fundo: (c) => c.superficie ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre a superfície 2',
    frente: (c) => c.texto ?? '',
    fundo: (c) => c.superficie2 ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre a superfície afundada',
    frente: (c) => c.texto ?? '',
    fundo: (c) => c.superficieAfundada ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto secundário sobre o fundo',
    frente: (c) => c.texto2 ?? '',
    fundo: (c) => c.fundo ?? '',
    minimo: TEXTO,
  },
  {
    // O texto de exemplo dos campos fica na afundada (change ajustes-dos-tokens, design, decisão 1).
    uso: 'texto secundário sobre a superfície afundada',
    frente: (c) => c.texto2 ?? '',
    fundo: (c) => c.superficieAfundada ?? '',
    minimo: TEXTO_DE_EXEMPLO,
  },
  {
    uso: 'texto secundário sobre a superfície',
    frente: (c) => c.texto2 ?? '',
    fundo: (c) => c.superficie ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto secundário sobre a superfície 2',
    frente: (c) => c.texto2 ?? '',
    fundo: (c) => c.superficie2 ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre o material',
    frente: (c) => c.texto ?? '',
    fundo: (c) => sobre(c.material ?? '', c.fundo ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto secundário sobre o material',
    frente: (c) => c.texto2 ?? '',
    fundo: (c) => sobre(c.material ?? '', c.fundo ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre a barra superior',
    frente: (c) => c.texto ?? '',
    fundo: (c) => sobre(c.barra ?? '', c.fundo ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto secundário sobre a barra superior',
    frente: (c) => c.texto2 ?? '',
    fundo: (c) => sobre(c.barra ?? '', c.fundo ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre linha alternada',
    frente: (c) => c.texto ?? '',
    fundo: (c) => sobre(c.zebra ?? '', c.superficie ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto do destaque sobre o fundo',
    frente: (c) => c.destaqueTexto ?? '',
    fundo: (c) => c.fundo ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto do destaque sobre a superfície',
    frente: (c) => c.destaqueTexto ?? '',
    fundo: (c) => c.superficie ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto do destaque sobre a superfície 2',
    frente: (c) => c.destaqueTexto ?? '',
    fundo: (c) => c.superficie2 ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto do destaque sobre o material',
    frente: (c) => c.destaqueTexto ?? '',
    fundo: (c) => sobre(c.material ?? '', c.fundo ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre o destaque (botão primário)',
    frente: (c) => c.sobreDestaque ?? '',
    fundo: (c) => c.destaque ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre o destaque em hover (botão primário)',
    frente: (c) => c.sobreDestaque ?? '',
    fundo: (c) => c.destaqueHover ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre o destaque pressionado (botão primário)',
    frente: (c) => c.sobreDestaque ?? '',
    fundo: (c) => c.destaquePressionado ?? '',
    minimo: TEXTO,
  },
  // A camada de pressionado é a mais forte: se ela passa, o hover (mais leve) também passa.
  {
    uso: 'texto sobre a superfície 2 pressionada (botão secundário)',
    frente: (c) => c.texto ?? '',
    fundo: (c) => sobre(c.pressionado ?? '', c.superficie2 ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre o fundo pressionado (botão terciário)',
    frente: (c) => c.texto ?? '',
    fundo: (c) => sobre(c.pressionado ?? '', c.fundo ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto crítico sobre a superfície 2 pressionada (botão destrutivo)',
    frente: (c) => c.critico ?? '',
    fundo: (c) => sobre(c.pressionado ?? '', c.superficie2 ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto crítico sobre o fundo pressionado (botão destrutivo)',
    frente: (c) => c.critico ?? '',
    fundo: (c) => sobre(c.pressionado ?? '', c.fundo ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre a linha selecionada',
    frente: (c) => c.texto ?? '',
    fundo: (c) => sobre(comAlfa(c.destaque ?? '', 0.13), c.superficie ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'destaque contra a superfície (seleção)',
    frente: (c) => c.destaque ?? '',
    fundo: (c) => c.superficie ?? '',
    minimo: COMPONENTE,
  },
  {
    uso: 'anel de foco contra o fundo',
    frente: (c) => c.destaque ?? '',
    fundo: (c) => c.fundo ?? '',
    minimo: COMPONENTE,
  },
  {
    uso: 'anel de foco contra a superfície 2',
    frente: (c) => c.destaque ?? '',
    fundo: (c) => c.superficie2 ?? '',
    minimo: COMPONENTE,
  },
  {
    uso: 'borda de controle contra a superfície',
    frente: (c) => c.bordaControle ?? '',
    fundo: (c) => c.superficie ?? '',
    minimo: COMPONENTE,
  },
  // O anel do cursor é translúcido: medido já composto sobre cada fundo por onde o ponteiro passa.
  ...(
    [
      ['fundo', 'o fundo'],
      ['superficie', 'a superfície'],
      ['superficie2', 'a superfície 2'],
    ] as const
  ).map(
    ([fundo, nome]): Par => ({
      uso: `anel do cursor contra ${nome}`,
      frente: (c) => compor(c.cursorAnel ?? '', c[fundo] ?? ''),
      fundo: (c) => c[fundo] ?? '',
      minimo: COMPONENTE,
    }),
  ),
  {
    uso: 'borda de controle contra a superfície 2',
    frente: (c) => c.bordaControle ?? '',
    fundo: (c) => c.superficie2 ?? '',
    minimo: COMPONENTE,
  },
  // O rótulo fica sobre o fundo gerado da situação, com a tinta dela (change ajustes-dos-tokens).
  ...Object.entries(NOMES_DAS_SITUACOES).flatMap(([id, nome]): Par[] => [
    {
      uso: `rótulo ${nome} sobre a superfície tingida`,
      frente: (c) => c[id] ?? '',
      fundo: (c) => sobre(c[`${id}Fundo`] ?? '', c.superficie ?? ''),
      minimo: TEXTO,
    },
    {
      uso: `rótulo ${nome} sobre a superfície 2 tingida`,
      frente: (c) => c[id] ?? '',
      fundo: (c) => sobre(c[`${id}Fundo`] ?? '', c.superficie2 ?? ''),
      minimo: TEXTO,
    },
    {
      // Nome da situação no aviso; o crítico também é o texto do item destrutivo do menu.
      uso: `texto ${nome} sobre o material (aviso e menu)`,
      frente: (c) => c[id] ?? '',
      fundo: (c) => sobre(c.material ?? '', c.fundo ?? ''),
      minimo: TEXTO,
    },
  ]),
  {
    uso: 'rótulo neutro sobre a superfície tingida',
    frente: (c) => c.texto2 ?? '',
    fundo: (c) => sobre(comAlfa(c.texto2 ?? '', TINTA_DO_ROTULO_NEUTRO), c.superficie ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'rótulo neutro sobre a superfície 2 tingida',
    frente: (c) => c.texto2 ?? '',
    fundo: (c) => sobre(comAlfa(c.texto2 ?? '', TINTA_DO_ROTULO_NEUTRO), c.superficie2 ?? ''),
    minimo: TEXTO,
  },
  // As cores da aba dos chamados (spec design-tokens, "Cores da aba").
  {
    uso: 'texto da aba sobre o fundo da aba (faixa, número e escolhido)',
    frente: (c) => c.abaTexto ?? '',
    fundo: (c) => c.abaFundo ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto da aba sobre o fundo da aba pressionado (tipo, cartão e chip escolhidos)',
    frente: (c) => c.abaTexto ?? '',
    fundo: (c) => sobre(c.pressionado ?? '', c.abaFundo ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto da aba sobre o fundo 2 da aba (pílula da trilha)',
    frente: (c) => c.abaTexto ?? '',
    fundo: (c) => c.abaFundo2 ?? '',
    minimo: TEXTO,
  },
  {
    uso: 'texto da aba sobre o bloco da aba (quem pede)',
    frente: (c) => c.abaTexto ?? '',
    fundo: (c) => c.abaBloco ?? '',
    minimo: TEXTO,
  },
  // O "Trocar" fica dentro do bloco de quem pede, e o hover dele escurece ou clareia o bloco.
  {
    uso: 'texto da aba sobre o bloco da aba pressionado (Trocar)',
    frente: (c) => c.abaTexto ?? '',
    fundo: (c) => sobre(c.pressionado ?? '', c.abaBloco ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'texto sobre a atenção da aba (selo)',
    frente: (c) => c.abaSobreAtencao ?? '',
    fundo: (c) => c.abaAtencao ?? '',
    minimo: TEXTO,
  },
  ...(
    [
      ['superficie', 'a superfície'],
      ['superficie2', 'a superfície 2 (ícone do tipo e "Nenhum")'],
      ['superficieElevada', 'a superfície elevada (moldura)'],
    ] as const
  ).map(
    ([fundo, nome]): Par => ({
      uso: `contorno da aba contra ${nome}`,
      frente: (c) => c.abaContorno ?? '',
      fundo: (c) => c[fundo] ?? '',
      minimo: COMPONENTE,
    }),
  ),
];

export function avaliar(cores: Cores, pares: Par[]): Resultado[] {
  return pares.map((par) => {
    const f = par.fundo(cores);
    const fundo = typeof f === 'string' ? f : compor(f.camada, f.sobre);
    const exata = contraste(par.frente(cores), fundo);
    return {
      uso: par.uso,
      razao: Math.floor(exata * 100) / 100,
      minimo: par.minimo,
      passou: exata >= par.minimo,
    };
  });
}

export function coresDaCombinacao(
  idTema: keyof typeof temas,
  idDestaque: keyof typeof destaques,
): Cores {
  const tema = temas[idTema];
  const situacoes = Object.fromEntries(
    Object.entries(tema.situacoes).flatMap(([id, situacao]) => [
      [id, situacao.cor],
      [`${id}Fundo`, situacao.fundo],
    ]),
  );
  const aba = Object.fromEntries(
    Object.entries(tema.aba).map(([nome, cor]) => [
      `aba${nome.charAt(0).toUpperCase()}${nome.slice(1)}`,
      cor,
    ]),
  );
  return {
    ...tema.cores,
    ...camadasDeEstado(tema.cores),
    ...coresDoCursor(tema),
    ...situacoes,
    ...aba,
    ...destaqueDoTema(idTema, idDestaque),
  };
}

export function avaliarTudo(): Array<Resultado & { tema: string; destaque: string }> {
  return (Object.keys(temas) as Array<keyof typeof temas>).flatMap((tema) =>
    (Object.keys(destaques) as Array<keyof typeof destaques>).flatMap((destaque) =>
      avaliar(coresDaCombinacao(tema, destaque), PARES).map((r) => ({ ...r, tema, destaque })),
    ),
  );
}
