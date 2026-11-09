// Contraste por uso real (spec design-tokens, "Contraste verificado automaticamente"):
// cada par é uma cor usada sobre um fundo, com o mínimo WCAG 2.2 AA do uso.
// Fundos translúcidos (material, barra, tintas) são medidos já compostos.
import { comAlfa, compor, contraste } from './contraste.ts';
import { destaqueDoTema, destaques } from './destaques.ts';
import { TINTA_DO_ROTULO } from './escalas.ts';
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
    uso: 'texto secundário sobre o fundo',
    frente: (c) => c.texto2 ?? '',
    fundo: (c) => c.fundo ?? '',
    minimo: TEXTO,
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
  ...Object.entries(NOMES_DAS_SITUACOES).flatMap(([id, nome]): Par[] => [
    {
      uso: `rótulo ${nome} sobre a superfície tingida`,
      frente: (c) => c[id] ?? '',
      fundo: (c) => sobre(comAlfa(c[id] ?? '', TINTA_DO_ROTULO.situacao), c.superficie ?? ''),
      minimo: TEXTO,
    },
    {
      uso: `rótulo ${nome} sobre a superfície 2 tingida`,
      frente: (c) => c[id] ?? '',
      fundo: (c) => sobre(comAlfa(c[id] ?? '', TINTA_DO_ROTULO.situacao), c.superficie2 ?? ''),
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
    fundo: (c) => sobre(comAlfa(c.texto2 ?? '', TINTA_DO_ROTULO.neutra), c.superficie ?? ''),
    minimo: TEXTO,
  },
  {
    uso: 'rótulo neutro sobre a superfície 2 tingida',
    frente: (c) => c.texto2 ?? '',
    fundo: (c) => sobre(comAlfa(c.texto2 ?? '', TINTA_DO_ROTULO.neutra), c.superficie2 ?? ''),
    minimo: TEXTO,
  },
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
    Object.entries(tema.situacoes).map(([id, situacao]) => [id, situacao.cor]),
  );
  return {
    ...tema.cores,
    ...camadasDeEstado(tema.cores),
    ...coresDoCursor(tema),
    ...situacoes,
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
