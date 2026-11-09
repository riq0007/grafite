// Os tipos de campo dos ativos (spec campos-personalizados; design do P1a, decisão 2, e do P1d,
// decisão 5): os da seção 5.3 da spec mestre. O arquivo e a imagem são enviados pela ficha do ativo,
// e não gravados como um valor comum.

export const TIPOS_DE_CAMPO = [
  'texto',
  'texto-longo',
  'inteiro',
  'decimal',
  'moeda',
  'data',
  'lista',
  'lista-multipla',
  'pessoa',
  'local',
  'ativo',
  'fornecedor',
  'licenca',
  'url',
  'ip',
  'mac',
  'arquivo',
  'imagem',
] as const;

export type TipoDeCampo = (typeof TIPOS_DE_CAMPO)[number];

export const ROTULOS_DOS_TIPOS_DE_CAMPO = {
  texto: 'Texto',
  'texto-longo': 'Texto longo',
  inteiro: 'Número inteiro',
  decimal: 'Número decimal',
  moeda: 'Moeda',
  data: 'Data',
  lista: 'Lista',
  'lista-multipla': 'Lista múltipla',
  pessoa: 'Pessoa',
  local: 'Local',
  ativo: 'Ativo',
  fornecedor: 'Fornecedor',
  licenca: 'Licença',
  url: 'URL',
  ip: 'IP',
  mac: 'MAC',
  arquivo: 'Arquivo',
  imagem: 'Imagem',
} as const satisfies Record<TipoDeCampo, string>;

/** Os tipos cujo valor é um arquivo enviado pela ficha do ativo, e não digitado nem importado. */
export const TIPOS_DE_ARQUIVO = ['arquivo', 'imagem'] as const satisfies readonly TipoDeCampo[];

export const campoDeArquivo = (tipo: TipoDeCampo): boolean =>
  (TIPOS_DE_ARQUIVO as readonly TipoDeCampo[]).includes(tipo);

/** A recusa do arquivo ou da imagem gravados como um valor comum. */
export const ENVIE_PELA_FICHA = 'Envie o arquivo pela ficha do ativo.';

export const SITUACOES_DA_OPCAO = ['ativa', 'inativa'] as const;
export type SituacaoDaOpcao = (typeof SITUACOES_DA_OPCAO)[number];

/** Uma opção de lista: o id não muda, e é ele que os ativos guardam. */
export interface OpcaoDaLista {
  id: string;
  rotulo: string;
  situacao: SituacaoDaOpcao;
}

/** A configuração de um campo, conforme o tipo dele (spec campos-personalizados). */
export interface ConfiguracaoDoCampo {
  /** Números inteiros e decimais. */
  minimo?: number;
  maximo?: number;
  /** Números decimais: de 0 a 6, e 2 sem configuração. */
  casas?: number;
  /** Listas. */
  opcoes?: OpcaoDaLista[];
  /** Ativo: os ids dos tipos aceitos; sem eles, o campo aceita ativos de qualquer tipo. */
  tipos?: string[];
  /** Ativo: o nome do grupo na ficha do ativo escolhido, como "Monitores" (spec ligacoes-de-ativos). */
  ladoDeLa?: string;
}

export interface DefinicaoDeCampo {
  tipo: TipoDeCampo;
  configuracao?: ConfiguracaoDoCampo;
}

/** O valor guardado de um campo: texto, número ou os ids das opções de uma lista múltipla. */
export type ValorDeCampo = string | number | string[];

/** O valor lido na forma em que é guardado, `null` quando vazio, ou a recusa em pt-BR. */
export type Leitura<T = ValorDeCampo> = { ok: true; valor: T | null } | { ok: false; erro: string };

export const aceito = <T>(valor: T | null): Leitura<T> => ({ ok: true, valor });
export const recusado = (erro: string): Leitura<never> => ({ ok: false, erro });

/** A entrada vazia: nada, o texto em branco ou a lista sem itens. É a falta do valor. */
export function vazio(entrada: unknown): boolean {
  if (entrada === null || entrada === undefined) return true;
  if (typeof entrada === 'string') return entrada.trim() === '';
  return Array.isArray(entrada) && entrada.length === 0;
}
