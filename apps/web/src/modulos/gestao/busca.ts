// A Gestão de ativos na busca (spec modulo-gestao-de-ativos, "Catálogo na busca"): os modelos e as
// ações de cadastro do catálogo e da importação, cada uma para quem pode fazê-la.
import { FileSpreadsheet, PackagePlus, Shapes, TextCursorInput } from 'lucide-react';
import { CADASTRAR, NA_BUSCA } from '../ativos/busca.ts';
import { PERMISSOES_DO_CATALOGO } from '../ativos/secoes.ts';
import type { ProvedorDeBusca } from '../tipos.ts';

/** Os modelos, ativos e inativos, pelo fabricante e pelo nome, com o tipo de cada um. */
export const provedorDeModelos: ProvedorDeBusca = {
  grupo: 'Modelos',
  permissoes: PERMISSOES_DO_CATALOGO,
  buscar: async (termo, sinal, api) => {
    const { data, error } = await api.GET('/modelos', {
      params: { query: { busca: termo, situacao: 'todos', limite: NA_BUSCA } },
      signal: sinal,
    });
    if (error || !data) throw new Error('A busca de modelos falhou.');
    const itens = data.itens.map((modelo) => ({
      id: modelo.id,
      rotulo: `${modelo.fabricante} ${modelo.nome}`,
      caminho: modelo.situacao === 'inativo' ? `${modelo.tipo.nome} · Inativo` : modelo.tipo.nome,
      destino: `/gestao/catalogo/modelos/${modelo.id}`,
    }));
    return { itens, total: data.total };
  },
  verTodos: (termo) => `/gestao/catalogo/modelos?busca=${encodeURIComponent(termo)}&situacao=todos`,
};

/** As ações de cadastro do catálogo e da importação, cada uma com a permissão dela. */
export const ENTRADAS_DA_GESTAO = [
  {
    id: 'novo-tipo',
    rotulo: 'Novo tipo de ativo',
    grupo: 'acoes',
    caminho: 'Gestão de ativos › Catálogo › Tipos',
    palavrasChave: CADASTRAR,
    icone: Shapes,
    destino: '/gestao/catalogo/tipos/novo',
    permissoes: ['catalogo.administrar'],
  },
  {
    id: 'novo-campo',
    rotulo: 'Novo campo',
    grupo: 'acoes',
    caminho: 'Gestão de ativos › Catálogo › Campos',
    palavrasChave: CADASTRAR,
    icone: TextCursorInput,
    destino: '/gestao/catalogo/campos/novo',
    permissoes: ['catalogo.administrar'],
  },
  {
    id: 'importar-planilha',
    rotulo: 'Importar planilha',
    grupo: 'acoes',
    caminho: 'Gestão de ativos › Importações',
    palavrasChave: ['importar', 'importação', 'planilha', 'xlsx', 'csv', 'excel'],
    icone: FileSpreadsheet,
    destino: '/gestao/importacoes/nova',
    permissoes: ['ativos.editar'],
  },
  {
    id: 'novo-modelo',
    rotulo: 'Novo modelo',
    grupo: 'acoes',
    caminho: 'Gestão de ativos › Catálogo › Modelos',
    palavrasChave: CADASTRAR,
    icone: PackagePlus,
    destino: '/gestao/catalogo/modelos/novo',
    permissoes: ['modelos.editar'],
  },
] as const;
