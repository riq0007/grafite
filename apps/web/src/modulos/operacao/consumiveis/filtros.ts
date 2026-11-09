// Os filtros da lista dos consumíveis (spec modulo-operacao, "Lista dos consumíveis"), na query
// string: voltar da ficha traz a lista como estava. Sem situação, a lista mostra só os ativos.
import {
  CORES_DE_CONSUMIVEL,
  type CorDeConsumivel,
  ROTULOS_DAS_CORES_DE_CONSUMIVEL,
  ROTULOS_DOS_TIPOS_DE_CONSUMIVEL,
  TIPOS_DE_CONSUMIVEL,
  type TipoDeConsumivel,
} from '@grafite/domain';

export type SituacaoDoFiltro = 'ativos' | 'inativos' | 'todos';

export interface FiltrosDosConsumiveis {
  /** O código, sem diferenciar maiúsculas, espaços e hífens, ou o nome. */
  busca?: string;
  tipo?: TipoDeConsumivel;
  cor?: CorDeConsumivel;
  situacao?: Exclude<SituacaoDoFiltro, 'ativos'>;
}

export const SITUACOES_DO_FILTRO: Record<SituacaoDoFiltro, string> = {
  ativos: 'Ativos',
  inativos: 'Inativos',
  todos: 'Todos',
};

export const OPCOES_DE_TIPO = TIPOS_DE_CONSUMIVEL.map((id) => ({
  id,
  rotulo: ROTULOS_DOS_TIPOS_DE_CONSUMIVEL[id],
}));

export const OPCOES_DE_COR = CORES_DE_CONSUMIVEL.map((id) => ({
  id,
  rotulo: ROTULOS_DAS_CORES_DE_CONSUMIVEL[id],
}));

const tipoConhecido = (valor: unknown): valor is TipoDeConsumivel =>
  (TIPOS_DE_CONSUMIVEL as readonly unknown[]).includes(valor);

const corConhecida = (valor: unknown): valor is CorDeConsumivel =>
  (CORES_DE_CONSUMIVEL as readonly unknown[]).includes(valor);

export function validarFiltrosDosConsumiveis(
  busca: Record<string, unknown>,
): FiltrosDosConsumiveis {
  const filtros: FiltrosDosConsumiveis = {};
  if (typeof busca.busca === 'string' && busca.busca.trim() !== '') filtros.busca = busca.busca;
  if (tipoConhecido(busca.tipo)) filtros.tipo = busca.tipo;
  if (corConhecida(busca.cor)) filtros.cor = busca.cor;
  if (busca.situacao === 'inativos' || busca.situacao === 'todos') {
    filtros.situacao = busca.situacao;
  }
  return filtros;
}
