// Os filtros do estoque (spec modulo-operacao, "Tela do estoque" e "Lançamento das movimentações";
// change p4c-estoque, design, decisão 7), na query string: a busca, o local, o consumível, o tipo e
// a situação, e o lançamento aberto, com o ativo da saída, para a busca e a ficha do ativo abrirem
// a gaveta pelo endereço. O consumível e o local também vêm para o lançamento.
import {
  ROTULOS_DOS_TIPOS_DE_CONSUMIVEL,
  TIPOS_DE_CONSUMIVEL,
  TIPOS_DE_MOVIMENTO,
  type TipoDeConsumivel,
  type TipoDeMovimento,
} from '@grafite/domain';

/** A situação do filtro: "Abaixo do mínimo" traz também os sem estoque com o mínimo. */
export type SituacaoDoFiltroDoEstoque = 'abaixo-do-minimo' | 'sem-estoque' | 'em-estoque';

export const SITUACOES_DO_FILTRO: Record<SituacaoDoFiltroDoEstoque, string> = {
  'abaixo-do-minimo': 'Abaixo do mínimo',
  'sem-estoque': 'Sem estoque',
  'em-estoque': 'Em estoque',
};

export interface FiltrosDoEstoque {
  /** O código, sem diferenciar maiúsculas, espaços e hífens, ou o nome do consumível. */
  busca?: string;
  /** O local, com os de dentro. */
  local?: string;
  consumivel?: string;
  tipo?: TipoDeConsumivel;
  situacao?: SituacaoDoFiltroDoEstoque;
  /** O lançamento aberto na gaveta. */
  lancar?: TipoDeMovimento;
  /** O ativo da saída aberta. */
  ativo?: string;
}

export const OPCOES_DE_TIPO = TIPOS_DE_CONSUMIVEL.map((id) => ({
  id,
  rotulo: ROTULOS_DOS_TIPOS_DE_CONSUMIVEL[id],
}));

/** Um id do endereço: as letras, os números e o hífen dos ids, e nada mais. */
const ID = /^[\w-]{1,64}$/;

const id = (valor: unknown) => (typeof valor === 'string' && ID.test(valor) ? valor : undefined);

const conhecido = <T extends string>(lista: readonly T[], valor: unknown): valor is T =>
  (lista as readonly unknown[]).includes(valor);

export function validarFiltrosDoEstoque(busca: Record<string, unknown>): FiltrosDoEstoque {
  const filtros: FiltrosDoEstoque = {};
  if (typeof busca.busca === 'string' && busca.busca.trim() !== '') filtros.busca = busca.busca;
  const local = id(busca.local);
  if (local) filtros.local = local;
  const consumivel = id(busca.consumivel);
  if (consumivel) filtros.consumivel = consumivel;
  if (conhecido(TIPOS_DE_CONSUMIVEL, busca.tipo)) filtros.tipo = busca.tipo;
  if (conhecido(Object.keys(SITUACOES_DO_FILTRO) as SituacaoDoFiltroDoEstoque[], busca.situacao)) {
    filtros.situacao = busca.situacao;
  }
  if (conhecido(TIPOS_DE_MOVIMENTO, busca.lancar)) filtros.lancar = busca.lancar;
  const ativo = id(busca.ativo);
  if (ativo) filtros.ativo = ativo;
  return filtros;
}
