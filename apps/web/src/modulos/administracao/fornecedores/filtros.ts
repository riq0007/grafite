// Os filtros da lista dos fornecedores (spec modulo-administracao, "Tela de fornecedores"), na query
// string: voltar da ficha traz a lista como estava. Sem situação, a lista mostra só os ativos.

export type SituacaoDoFiltro = 'ativos' | 'inativos' | 'todos';

export interface FiltrosDosFornecedores {
  /** O nome ou o começo do CNPJ, com ou sem a pontuação. */
  busca?: string;
  situacao?: Exclude<SituacaoDoFiltro, 'ativos'>;
}

export const SITUACOES_DO_FILTRO: Record<SituacaoDoFiltro, string> = {
  ativos: 'Ativos',
  inativos: 'Inativos',
  todos: 'Todos',
};

export function validarFiltrosDosFornecedores(
  busca: Record<string, unknown>,
): FiltrosDosFornecedores {
  const filtros: FiltrosDosFornecedores = {};
  if (typeof busca.busca === 'string' && busca.busca.trim() !== '') filtros.busca = busca.busca;
  if (busca.situacao === 'inativos' || busca.situacao === 'todos') {
    filtros.situacao = busca.situacao;
  }
  return filtros;
}
