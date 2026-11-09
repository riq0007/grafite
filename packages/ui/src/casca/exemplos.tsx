// Só para o catálogo: módulos de exemplo, que não são os módulos do produto. Cada módulo real
// entra na casca pelo registro do app (design, decisão 2).
import { House, Network, Package, Settings, Wrench } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import type { MenuDaBarra, ModuloDaCasca } from './tipos.ts';

export const MODULOS_DE_EXEMPLO: readonly ModuloDaCasca[] = [
  { id: 'inicio', nome: 'Início', icone: House, prioridadeNoCelular: 1 },
  {
    id: 'ativos',
    nome: 'Ativos',
    icone: Package,
    prioridadeNoCelular: 2,
    menu: [
      { id: 'ativos/todos', rotulo: 'Todos os ativos' },
      { id: 'ativos/computadores', rotulo: 'Computadores' },
      { id: 'ativos/impressoras', rotulo: 'Impressoras' },
      {
        id: 'ativos/rede',
        rotulo: 'Rede',
        filhos: [
          { id: 'ativos/rede/switches', rotulo: 'Switches' },
          { id: 'ativos/rede/racks', rotulo: 'Racks' },
          { id: 'ativos/rede/pontos', rotulo: 'Pontos de rede' },
        ],
      },
      { id: 'ativos/importar', rotulo: 'Importar planilha', separadoAntes: true },
    ],
  },
  {
    id: 'operacao',
    nome: 'Operação',
    icone: Wrench,
    prioridadeNoCelular: 3,
    menu: [
      { id: 'operacao/solicitacoes', rotulo: 'Solicitações' },
      { id: 'operacao/ordens', rotulo: 'Ordens de serviço' },
    ],
  },
  {
    id: 'rede',
    nome: 'Rede',
    icone: Network,
    prioridadeNoCelular: 5,
    menu: [
      { id: 'rede/status', rotulo: 'Status da rede' },
      { id: 'rede/switches', rotulo: 'Switches' },
    ],
  },
];

export const AJUSTES_DE_EXEMPLO: readonly ModuloDaCasca[] = [
  {
    id: 'ajustes',
    nome: 'Ajustes',
    icone: Settings,
    prioridadeNoCelular: 9,
    menu: [
      { id: 'ajustes/aparencia', rotulo: 'Aparência' },
      { id: 'ajustes/dock', rotulo: 'Dock' },
      { id: 'ajustes/acessibilidade', rotulo: 'Acessibilidade' },
    ],
  },
];

const estiloDaTela: CSSProperties = {
  position: 'relative',
  height: 320,
  overflow: 'hidden',
  // Transform faz da tela o bloco de contenção dos elementos fixos da casca.
  transform: 'translateZ(0)',
  borderRadius: 'var(--raio-janela)',
  background: 'var(--cor-fundo)',
};

/**
 * Uma "tela" de exemplo: dentro dela, a casca fica fixa como ficaria na janela do navegador. A
 * altura muda para o dock lateral, que fica abaixo da barra superior e manda ao Mais o que não cabe.
 */
export function TelaDeExemplo({ children, altura }: { children: ReactNode; altura?: number }) {
  return <div style={altura ? { ...estiloDaTela, height: altura } : estiloDaTela}>{children}</div>;
}

/** Menus da barra de um módulo de exemplo (Ativos), só para o catálogo. */
export const MENUS_DA_BARRA_DE_EXEMPLO: readonly MenuDaBarra[] = [
  {
    id: 'visualizar',
    rotulo: 'Visualizar',
    itens: [
      { id: 'visualizar/lista', rotulo: 'Lista' },
      { id: 'visualizar/galeria', rotulo: 'Galeria' },
    ],
  },
  {
    id: 'filtros',
    rotulo: 'Filtros',
    itens: [
      { id: 'filtros/em-uso', rotulo: 'Em uso' },
      { id: 'filtros/em-estoque', rotulo: 'Em estoque' },
    ],
  },
  {
    id: 'acoes',
    rotulo: 'Ações',
    itens: [
      { id: 'acoes/novo', rotulo: 'Novo ativo' },
      { id: 'acoes/importar', rotulo: 'Importar planilha' },
    ],
  },
];
