// Os filtros das movimentações (spec modulo-operacao, "Movimentações"; change p4c-estoque, design,
// decisão 7), na query string: o período, o tipo, o local, o consumível, o fornecedor e o ativo. O
// período guarda as datas, e a consulta as converte no começo e no fim do dia, no fuso escolhido.
import { TIPOS_DE_MOVIMENTO, type TipoDeMovimento } from '@grafite/domain';
import type { DataHora } from '@grafite/ui';

export interface FiltrosDasMovimentacoes {
  /** As datas do período, `aaaa-mm-dd`, no fuso escolhido; as duas incluídas. */
  de?: string;
  ate?: string;
  tipo?: TipoDeMovimento;
  /** O local, com os de dentro, na origem ou no destino. */
  local?: string;
  consumivel?: string;
  fornecedor?: string;
  ativo?: string;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[\w-]{1,64}$/;
const id = (valor: unknown) => (typeof valor === 'string' && ID.test(valor) ? valor : undefined);

export function validarFiltrosDasMovimentacoes(
  busca: Record<string, unknown>,
): FiltrosDasMovimentacoes {
  const filtros: FiltrosDasMovimentacoes = {};
  if (typeof busca.de === 'string' && DIA.test(busca.de)) filtros.de = busca.de;
  if (typeof busca.ate === 'string' && DIA.test(busca.ate)) filtros.ate = busca.ate;
  if ((TIPOS_DE_MOVIMENTO as readonly unknown[]).includes(busca.tipo)) {
    filtros.tipo = busca.tipo as TipoDeMovimento;
  }
  for (const chave of ['local', 'consumivel', 'fornecedor', 'ativo'] as const) {
    const valor = id(busca[chave]);
    if (valor) filtros[chave] = valor;
  }
  return filtros;
}

/** O período como instantes para a API: o começo do primeiro dia e o fim do último, no fuso. */
export function periodoParaAApi(
  { de, ate }: Pick<FiltrosDasMovimentacoes, 'de' | 'ate'>,
  dataHora: Pick<DataHora, 'inicioDoDia' | 'fimDoDia'>,
): { de?: string; ate?: string } {
  return {
    ...(de && { de: dataHora.inicioDoDia(de).toISOString() }),
    ...(ate && { ate: dataHora.fimDoDia(ate).toISOString() }),
  };
}

/** "01/10/2026", de `aaaa-mm-dd`. */
const comoData = (dia: string) => dia.split('-').reverse().join('/');

/** O período em texto, para o filtro ativo. */
export function periodoEmTexto({
  de,
  ate,
}: Pick<FiltrosDasMovimentacoes, 'de' | 'ate'>): string | null {
  if (de && ate) return `${comoData(de)} a ${comoData(ate)}`;
  if (de) return `A partir de ${comoData(de)}`;
  if (ate) return `Até ${comoData(ate)}`;
  return null;
}
