// Camada 2: os temas, gerados a partir das entradas da spec mestre (Apêndice A.1) pelo gerador em
// OKLCH (design da fundamentos-v3). Os componentes só usam os papéis que o gerador produz.
import { comAlfa } from './contraste.ts';
import {
  type CoresDaSituacaoGerada,
  type CoresGeradas,
  type DadosGerados,
  type EntradaDoTema,
  gerarDados,
  gerarSituacoes,
  gerarTema,
  type IdDaSituacao,
} from './gerador.ts';
import { OPACIDADE_DAS_CAMADAS, OPACIDADE_DO_ANEL, type Tom } from './papeis.ts';

export {
  type CoresDoTema,
  camadasDeEstado,
  OPACIDADE_DAS_CAMADAS,
  OPACIDADE_DO_ANEL,
  type Tom,
} from './papeis.ts';

export interface Tema {
  nome: string;
  tom: Tom;
  entrada: EntradaDoTema;
  cores: CoresGeradas;
  /** Sombra das camadas sobrepostas: menus, avisos, diálogos e a busca. */
  sombraMaterial: string;
  /** Sombra da superfície elevada. */
  sombraElevada: string;
  situacoes: Record<IdDaSituacao, CoresDaSituacaoGerada>;
  dados: DadosGerados;
}

/** As entradas dos seis temas (spec mestre, Apêndice A.1). */
export const ENTRADAS_DOS_TEMAS = {
  grafite: { nome: 'Grafite', tom: 'escuro', base: { matiz: 265, croma: 0.006 }, contraste: 45 },
  'meia-noite': {
    nome: 'Meia-noite',
    tom: 'escuro',
    base: { matiz: 262, croma: 0.03 },
    contraste: 45,
  },
  oled: {
    nome: 'OLED',
    tom: 'escuro',
    base: { matiz: 0, croma: 0 },
    contraste: 70,
    oled: true,
  },
  nevoa: { nome: 'Névoa', tom: 'claro', base: { matiz: 260, croma: 0.006 }, contraste: 45 },
  papel: { nome: 'Papel', tom: 'claro', base: { matiz: 80, croma: 0.016 }, contraste: 45 },
  'alto-contraste': {
    nome: 'Alto contraste',
    tom: 'claro',
    base: { matiz: 0, croma: 0 },
    contraste: 100,
  },
} as const satisfies Record<string, EntradaDoTema & { nome: string }>;

export type IdDoTema = keyof typeof ENTRADAS_DOS_TEMAS;

/** O tema completo de uma entrada: as cores, as sombras, as situações e os dados. */
export function montarTema(nome: string, entrada: EntradaDoTema): Tema {
  const gerado = gerarTema(entrada);
  return {
    nome,
    tom: entrada.tom,
    entrada,
    cores: gerado.cores,
    sombraMaterial: gerado.sombraSobreposta,
    sombraElevada: gerado.sombraElevada,
    situacoes: gerarSituacoes(gerado),
    dados: gerarDados(gerado),
  };
}

export const temas = Object.fromEntries(
  Object.entries(ENTRADAS_DOS_TEMAS).map(([id, { nome, ...entrada }]) => [
    id,
    montarTema(nome, entrada),
  ]),
) as Record<IdDoTema, Tema>;

/**
 * Cores do cursor suavizado, feitas da cor do texto: o ponto é o próprio texto, o anel é o texto
 * translúcido, e o abraço preenche o elemento com a camada de pressionado.
 */
export function coresDoCursor(tema: Pick<Tema, 'tom' | 'cores'>): {
  cursorPonto: string;
  cursorAnel: string;
  cursorAbraco: string;
} {
  return {
    cursorPonto: tema.cores.texto,
    cursorAnel: comAlfa(tema.cores.texto, OPACIDADE_DO_ANEL[tema.tom]),
    cursorAbraco: comAlfa(tema.cores.texto, OPACIDADE_DAS_CAMADAS.pressionado),
  };
}

/** Sombra curta que separa o ponto e o anel do conteúdo da mesma cor, em qualquer tema. */
export const SOMBRA_DO_CURSOR = '0 1px 3px rgba(0, 0, 0, 0.35)';
