// Os filtros das listas do catálogo, na query string: voltar da ficha traz a lista como estava. Sem
// filtro de situação, a lista mostra só os ativos. Os da tabela dos ativos estão no endereço dela.
export type SituacaoDoFiltro = 'ativos' | 'inativos' | 'todos';

export interface FiltroDeSituacao {
  situacao?: Exclude<SituacaoDoFiltro, 'ativos'>;
}

export const SITUACOES_DO_FILTRO: Record<SituacaoDoFiltro, string> = {
  ativos: 'Ativos',
  inativos: 'Inativos',
  todos: 'Todos',
};

export function validarFiltroDeSituacao(busca: Record<string, unknown>): FiltroDeSituacao {
  return busca.situacao === 'inativos' || busca.situacao === 'todos'
    ? { situacao: busca.situacao }
    : {};
}

/** O filtro escolhido no endereço: só o que não é o padrão. */
export const buscaDaSituacao = (escolhida: string): FiltroDeSituacao =>
  escolhida === 'inativos' || escolhida === 'todos' ? { situacao: escolhida } : {};

/** Se o registro aparece com o filtro escolhido. */
export const naSituacao = (situacao: SituacaoDoFiltro, doRegistro: 'ativo' | 'inativo') =>
  situacao === 'todos' || doRegistro === (situacao === 'ativos' ? 'ativo' : 'inativo');

/** Os filtros da lista de modelos: a busca, o tipo e a situação, só o que não é o padrão. */
export interface FiltrosDeModelos extends FiltroDeSituacao {
  busca?: string;
  /** O id do tipo de ativo. */
  tipo?: string;
}

export function validarFiltrosDeModelos(busca: Record<string, unknown>): FiltrosDeModelos {
  const filtros: FiltrosDeModelos = validarFiltroDeSituacao(busca);
  if (typeof busca.busca === 'string' && busca.busca.trim() !== '') filtros.busca = busca.busca;
  if (typeof busca.tipo === 'string' && /^[\w-]+$/.test(busca.tipo)) filtros.tipo = busca.tipo;
  return filtros;
}
