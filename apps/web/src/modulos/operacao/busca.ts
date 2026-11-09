// O Operação na busca (spec modulo-operacao, "Operação no dock"): os itens do menu entram sozinhos,
// no caminho "Operação"; quem edita os consumíveis tem a ação de cadastrar um; quem movimenta o
// estoque, as de lançar cada movimentação, que abrem o Estoque com a gaveta dela; e quem atende as
// solicitações, as de registrar cada tipo, que abrem as Solicitações com o formulário dele. Os
// consumíveis entram pelo código e pelo nome, para quem os vê (change p4c-estoque, design, decisão
// 7; change p4d-solicitacoes, design, decisão 8).
import {
  ROTULOS_DAS_CORES_DE_CONSUMIVEL,
  ROTULOS_DOS_TIPOS_DE_CONSUMIVEL,
  type TipoDeMovimento,
  type TipoDeSolicitacao,
} from '@grafite/domain';
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  ClipboardList,
  Laptop,
  PackagePlus,
  Printer,
  Scale,
  Wrench,
} from 'lucide-react';
import type { ContextoDaAcao } from '../../busca/tipos.ts';
import type { ProvedorDeBusca } from '../tipos.ts';

/** Quantos consumíveis a busca mostra. */
const NA_BUSCA = 8;

/** A ação de lançar uma movimentação: o Estoque com a gaveta dela aberta. */
const lancar = (
  tipo: TipoDeMovimento,
  rotulo: string,
  icone: typeof PackagePlus,
  palavrasChave: readonly string[],
) =>
  ({
    id: `lancar-${tipo}`,
    rotulo,
    grupo: 'acoes',
    caminho: 'Operação › Estoque',
    palavrasChave: ['estoque', 'lancar', 'toner', ...palavrasChave],
    icone,
    executar: ({ navegar }: ContextoDaAcao) => navegar(`/operacao/estoque?lancar=${tipo}`),
    permissoes: ['estoque.movimentar'],
  }) as const;

/** A ação de registrar uma solicitação: as Solicitações com o formulário do tipo aberto. */
const registrar = (
  tipo: TipoDeSolicitacao,
  rotulo: string,
  icone: typeof PackagePlus,
  palavrasChave: readonly string[],
) =>
  ({
    id: `nova-solicitacao-${tipo}`,
    rotulo,
    grupo: 'acoes',
    caminho: 'Operação › Solicitações',
    palavrasChave: ['solicitacao', 'pedido', 'registrar', ...palavrasChave],
    icone,
    executar: ({ navegar }: ContextoDaAcao) => navegar(`/operacao/solicitacoes?nova=${tipo}`),
    permissoes: ['solicitacoes.atender'],
  }) as const;

export const ENTRADAS_DA_OPERACAO = [
  {
    id: 'novo-consumivel',
    rotulo: 'Novo consumível',
    grupo: 'acoes',
    caminho: 'Operação › Consumíveis',
    palavrasChave: ['cadastrar', 'novo', 'consumivel', 'toner', 'cilindro', 'tinta'],
    icone: PackagePlus,
    destino: '/operacao/consumiveis/novo',
    permissoes: ['consumiveis.editar'],
  },
  lancar('entrada', 'Nova entrada no estoque', ArrowDownToLine, ['entrada', 'nota', 'compra']),
  lancar('saida', 'Nova saída do estoque', ArrowUpFromLine, ['saida', 'troca', 'impressora']),
  lancar('transferencia', 'Nova transferência no estoque', ArrowRightLeft, [
    'transferencia',
    'mover',
  ]),
  lancar('ajuste', 'Novo ajuste do estoque', Scale, ['ajuste', 'inventario', 'perda']),
  registrar('toner', 'Nova solicitação de toner', Printer, ['toner', 'impressora', 'cartucho']),
  registrar('conserto', 'Nova solicitação de conserto', Wrench, ['conserto', 'defeito', 'reparo']),
  registrar('equipamento', 'Nova solicitação de equipamento', Laptop, [
    'equipamento',
    'notebook',
    'computador',
  ]),
  // A OS de um ativo, para quem atende as OS (change p4e-ordens-de-servico, design, decisão 8).
  {
    id: 'nova-ordem',
    rotulo: 'Nova ordem de serviço',
    grupo: 'acoes',
    caminho: 'Operação › Ordens de serviço',
    palavrasChave: ['ordem', 'servico', 'os', 'manutencao', 'tecnico'],
    icone: ClipboardList,
    executar: ({ navegar }: ContextoDaAcao) => navegar('/operacao/ordens?nova=1'),
    permissoes: ['ordens.atender'],
  },
] as const;

/** Os consumíveis pelo código e pelo nome, como a lista os acha, cada um levando à ficha. */
export const provedorDosConsumiveis: ProvedorDeBusca = {
  grupo: 'Consumíveis',
  permissoes: ['consumiveis.ver'],
  buscar: async (termo, sinal, api) => {
    const { data, error } = await api.GET('/consumiveis', {
      params: { query: { busca: termo, situacao: 'todos', limite: NA_BUSCA } },
      signal: sinal,
    });
    if (error || !data) throw new Error('A busca de consumíveis falhou.');
    const itens = data.itens.map((consumivel) => {
      const tipo = ROTULOS_DOS_TIPOS_DE_CONSUMIVEL[consumivel.tipo];
      return {
        id: consumivel.id,
        rotulo: consumivel.codigo,
        caminho: [
          consumivel.nome,
          consumivel.cor ? `${tipo}, ${ROTULOS_DAS_CORES_DE_CONSUMIVEL[consumivel.cor]}` : tipo,
          consumivel.situacao === 'inativo' ? 'Inativo' : null,
        ]
          .filter(Boolean)
          .join(' · '),
        destino: `/operacao/consumiveis/${consumivel.id}`,
      };
    });
    return { itens, total: data.total };
  },
  verTodos: (termo) => `/operacao/consumiveis?busca=${encodeURIComponent(termo)}`,
};
