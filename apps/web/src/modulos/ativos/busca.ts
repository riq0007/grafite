// O módulo Ativos na busca (spec modulo-ativos; design do P1a, decisão 9, do P1b, decisão 13, e do
// P1c, decisão 10): os ativos que a conta vê e as visões da tabela, cada um no seu grupo, e o
// cadastro do ativo. Os modelos e as ações do catálogo ficam na Gestão de ativos.
import { normalizarTexto, tabelaComVisoes, VISAO_DE_FABRICA } from '@grafite/domain';
import { SquarePlus } from 'lucide-react';
import type { ProvedorDeBusca } from '../tipos.ts';

/** Quantos registros cada grupo da busca mostra: o resto fica na tela da lista. */
export const NA_BUSCA = 8;

/**
 * Os ativos que a conta vê, ativos e inativos, pelo nome, pelo patrimônio, pela série, pelo
 * hostname e pelo modelo, com o patrimônio, o tipo e o local de cada um.
 */
export const provedorDeAtivos: ProvedorDeBusca = {
  grupo: 'Ativos',
  permissoes: ['ativos.ver'],
  buscar: async (termo, sinal, api) => {
    const { data, error } = await api.GET('/ativos', {
      params: { query: { busca: termo, situacao: 'todos', limite: NA_BUSCA } },
      signal: sinal,
    });
    if (error || !data) throw new Error('A busca de ativos falhou.');
    const itens = data.itens.map((ativo) => ({
      id: ativo.id,
      rotulo: ativo.rotulo,
      caminho:
        [
          ativo.patrimonio,
          ativo.tipo.nome,
          ativo.local?.caminho,
          ativo.situacao === 'inativo' ? 'Inativo' : null,
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
      destino: `/ativos/${ativo.id}`,
    }));
    return { itens, total: data.total };
  },
  verTodos: (termo) => `/ativos?busca=${encodeURIComponent(termo)}`,
};

/**
 * As visões da tabela dos ativos que a conta pode usar, com a de fábrica, pelo nome, sem diferenciar
 * acento e maiúsculas. O destino abre a tabela na visão.
 */
export const provedorDeVisoes: ProvedorDeBusca = {
  grupo: 'Visões',
  permissoes: ['ativos.ver'],
  buscar: async (termo, sinal, api) => {
    const { data, error } = await api.GET('/visoes', {
      params: { query: { tabela: 'ativos' } },
      signal: sinal,
    });
    if (error || !data) throw new Error('A busca de visões falhou.');
    const palavras = normalizarTexto(termo).split(' ').filter(Boolean);
    const fabrica = tabelaComVisoes('ativos')?.fabrica.nome ?? 'Todos os ativos';
    return [{ id: VISAO_DE_FABRICA, nome: fabrica }, ...data.visoes]
      .filter((visao) => {
        const nome = normalizarTexto(visao.nome);
        return palavras.every((palavra) => nome.includes(palavra));
      })
      .slice(0, NA_BUSCA)
      .map((visao) => ({
        id: visao.id,
        rotulo: visao.nome,
        caminho: 'Ativos › Visões',
        destino: `/ativos?visao=${visao.id}`,
      }));
  },
};

/** As palavras que acham as ações de cadastro. */
export const CADASTRAR = ['cadastrar', 'novo', 'nova', 'criar'];

/** O cadastro do ativo, para quem edita ativos. */
export const ENTRADAS_DOS_ATIVOS = [
  {
    id: 'novo-ativo',
    rotulo: 'Novo ativo',
    grupo: 'acoes',
    caminho: 'Ativos',
    palavrasChave: CADASTRAR,
    icone: SquarePlus,
    destino: '/ativos/novo',
    permissoes: ['ativos.editar'],
  },
] as const;
