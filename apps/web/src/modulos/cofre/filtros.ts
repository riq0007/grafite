// Os filtros da lista do cofre (spec modulo-cofre, "Lista dos segredos"), na query string: voltar da
// ficha traz a lista como estava. Sem situação, a lista mostra só os ativos; só quem administra o
// cofre escolhe outra.
import {
  CLASSIFICACOES_DE_SEGREDO,
  type ClassificacaoDeSegredo,
  classificacaoDeSegredo,
  TIPOS_DE_SEGREDO,
  type TipoDeSegredo,
  tipoDeSegredo,
} from '@grafite/domain';

export type SituacaoDoFiltro = 'ativos' | 'inativos' | 'todos';

export interface FiltrosDoCofre {
  busca?: string;
  tipo?: TipoDeSegredo;
  classificacao?: ClassificacaoDeSegredo;
  situacao?: Exclude<SituacaoDoFiltro, 'ativos'>;
}

export const SITUACOES_DO_FILTRO: Record<SituacaoDoFiltro, string> = {
  ativos: 'Ativos',
  inativos: 'Inativos',
  todos: 'Todos',
};

export const OPCOES_DE_TIPO = TIPOS_DE_SEGREDO.map(({ id, rotulo }) => ({ id, rotulo }));
export const OPCOES_DE_CLASSIFICACAO = CLASSIFICACOES_DE_SEGREDO.map(({ id, rotulo }) => ({
  id,
  rotulo,
}));

export function validarFiltrosDoCofre(busca: Record<string, unknown>): FiltrosDoCofre {
  const filtros: FiltrosDoCofre = {};
  if (typeof busca.busca === 'string' && busca.busca.trim() !== '') filtros.busca = busca.busca;
  if (tipoDeSegredo(busca.tipo)) filtros.tipo = busca.tipo;
  if (classificacaoDeSegredo(busca.classificacao)) filtros.classificacao = busca.classificacao;
  if (busca.situacao === 'inativos' || busca.situacao === 'todos') {
    filtros.situacao = busca.situacao;
  }
  return filtros;
}
