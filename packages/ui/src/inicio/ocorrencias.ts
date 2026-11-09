// "O que resolver agora" (F1c): as ocorrências abertas que a tela inicial reúne dos módulos.
import type { DirecaoDaOrdenacao } from '../componentes/tabela/Tabela.tsx';

/** Colunas pelas quais o usuário ordena as ocorrências da tela inicial. */
export const COLUNAS_DAS_OCORRENCIAS = ['severidade', 'ha', 'ativo', 'ocorrencia'] as const;

export type ColunaDasOcorrencias = (typeof COLUNAS_DAS_OCORRENCIAS)[number];

export interface OrdenacaoDasOcorrencias {
  coluna: ColunaDasOcorrencias;
  direcao: DirecaoDaOrdenacao;
}

export type SeveridadeDaOcorrencia = 'critico' | 'atencao' | 'info';

/** O ativo de que a ocorrência fala, com as imagens da miniatura, se houver. */
export interface AtivoDaOcorrencia {
  nome: string;
  /** Define a imagem genérica da miniatura. */
  tipo: string;
  imagemDoAtivo?: string;
  imagemDoModelo?: string;
}

/** Uma ocorrência aberta, como uma fonte de um módulo a entrega à tela inicial. */
export interface OcorrenciaAberta {
  /** Único dentro da fonte que a trouxe. */
  id: string;
  severidade: SeveridadeDaOcorrencia;
  /** O que aconteceu, como "Toner preto em 8%". */
  texto: string;
  ativo: AtivoDaOcorrencia;
  /** Quando abriu. */
  desde: Date;
  /** O endereço do registro, que o clique e o Enter na linha abrem. */
  destino: string;
}

const PESO_DA_SEVERIDADE: Record<SeveridadeDaOcorrencia, number> = {
  critico: 3,
  atencao: 2,
  info: 1,
};

type Comparacao = (a: OcorrenciaAberta, b: OcorrenciaAberta) => number;

/** A ordem de fábrica: Crítico, Atenção e Informação e, na mesma severidade, a mais antiga. */
const deFabrica: Comparacao = (a, b) =>
  PESO_DA_SEVERIDADE[b.severidade] - PESO_DA_SEVERIDADE[a.severidade] ||
  a.desde.getTime() - b.desde.getTime();

const textos = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/** Cada coluna em ordem crescente. "Há" crescente é a mais nova primeiro. */
const CRESCENTE: Record<ColunaDasOcorrencias, Comparacao> = {
  severidade: (a, b) => PESO_DA_SEVERIDADE[a.severidade] - PESO_DA_SEVERIDADE[b.severidade],
  ha: (a, b) => b.desde.getTime() - a.desde.getTime(),
  ativo: (a, b) => textos.compare(a.ativo.nome, b.ativo.nome),
  ocorrencia: (a, b) => textos.compare(a.texto, b.texto),
};

/**
 * As ocorrências na ordem pedida, numa lista nova. O empate numa coluna segue a ordem de fábrica,
 * em qualquer direção: pela severidade, a mais antiga continua primeiro.
 */
export function ordenarOcorrencias(
  lista: readonly OcorrenciaAberta[],
  { coluna, direcao }: OrdenacaoDasOcorrencias,
): OcorrenciaAberta[] {
  const sentido = direcao === 'crescente' ? 1 : -1;
  return [...lista].sort((a, b) => sentido * CRESCENTE[coluna](a, b) || deFabrica(a, b));
}

const UM_MINUTO = 60_000;

/** Há quanto tempo está aberta: "agora", "32 min", "1 h" ou "2 d", sempre para baixo. */
export function idadeRelativa(desde: Date, agora: Date): string {
  const minutos = Math.floor((agora.getTime() - desde.getTime()) / UM_MINUTO);
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas} h`;
  return `${Math.floor(horas / 24)} d`;
}

/**
 * Há quanto tempo, numa escrita só para as tabelas (change tabelas-consistentes, design, decisão 3):
 * "Agora", "Há 32 min", "Há 1 h" ou "Há 2 d".
 */
export function haQuantoTempo(desde: Date, agora: Date): string {
  const idade = idadeRelativa(desde, agora);
  return idade === 'agora' ? 'Agora' : `Há ${idade}`;
}

/** Onde está a busca de uma fonte: carregando, com as ocorrências, ou com falha. */
export type EstadoDaFonteDeOcorrencias =
  | { tipo: 'carregando' }
  | { tipo: 'pronta'; ocorrencias: OcorrenciaAberta[] }
  | { tipo: 'erro' };

/** Uma fonte na tela inicial: o id e o nome do módulo que a registrou, e o que ela trouxe. */
export interface FonteDeOcorrenciasNaTela {
  id: string;
  modulo: string;
  estado: EstadoDaFonteDeOcorrencias;
}
