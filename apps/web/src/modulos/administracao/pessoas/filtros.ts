// Os filtros da lista de pessoas (spec administracao-de-pessoas), na query string: voltar da ficha
// traz a lista como estava. Sem situação, a lista mostra só as ativas.

export type SituacaoDoFiltro = 'ativas' | 'inativas' | 'todas';
export type ContaDoFiltro = 'com' | 'sem';

export interface FiltrosDePessoas {
  busca?: string;
  situacao?: Exclude<SituacaoDoFiltro, 'ativas'>;
  conta?: ContaDoFiltro;
  /** O id do local de trabalho: a lista traz o local e tudo dentro dele. */
  local?: string;
}

export const SITUACOES_DO_FILTRO: Record<SituacaoDoFiltro, string> = {
  ativas: 'Ativas',
  inativas: 'Inativas',
  todas: 'Todas',
};

export const CONTAS_DO_FILTRO: Record<ContaDoFiltro, string> = {
  com: 'Com conta',
  sem: 'Sem conta',
};

export function validarFiltrosDePessoas(busca: Record<string, unknown>): FiltrosDePessoas {
  const filtros: FiltrosDePessoas = {};
  if (typeof busca.busca === 'string' && busca.busca.trim() !== '') filtros.busca = busca.busca;
  if (busca.situacao === 'inativas' || busca.situacao === 'todas')
    filtros.situacao = busca.situacao;
  if (busca.conta === 'com' || busca.conta === 'sem') filtros.conta = busca.conta;
  if (typeof busca.local === 'string' && /^[\w-]+$/.test(busca.local)) filtros.local = busca.local;
  return filtros;
}
