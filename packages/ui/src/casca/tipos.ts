// Contratos da casca: o app monta os módulos a partir do registro (design, decisão 2) e passa
// para os componentes da casca só estes dados.
import type { LucideIcon } from 'lucide-react';

export type PosicaoDoDock = 'embaixo' | 'esquerda' | 'direita';

/** Item de um menu em árvore: navega (o `id` é o destino) ou abre um submenu (`filhos`). */
export interface ItemDoMenuDaCasca {
  id: string;
  rotulo: string;
  filhos?: readonly ItemDoMenuDaCasca[];
  /** Linha antes deste item, separando grupos do menu. */
  separadoAntes?: boolean;
  /** O ícone antes do nome, como o de cada tipo em "Por tipo". */
  icone?: LucideIcon;
}

/** Menu que um módulo registra para a barra superior, como Visualizar ou Ações. */
export interface MenuDaBarra {
  id: string;
  rotulo: string;
  itens: readonly ItemDoMenuDaCasca[];
}

/**
 * O selo do item do módulo no dock e na barra de abas, como o total do chat: o número à vista é só
 * desenho, e o leitor de tela ouve a descrição depois do nome, como "Chat, 2 não lidas".
 */
export interface SeloDoModulo {
  /** O que o selo mostra, como "3" ou "99+". */
  texto: string;
  /** O que o leitor de tela ouve depois do nome, como "2 não lidas". */
  descricao: string;
}

export interface ModuloDaCasca {
  id: string;
  nome: string;
  icone: LucideIcon;
  /** O selo no canto do item, como o total do chat; sem ele, o item fica sem. */
  selo?: SeloDoModulo;
  /** Menu em árvore do módulo; sem ele, o item do dock só abre o módulo. */
  menu?: readonly ItemDoMenuDaCasca[];
  /** Menus do módulo na barra superior. */
  menusDaBarra?: readonly MenuDaBarra[];
  /**
   * Ordem na barra de abas do celular: número menor vem antes. Sem ela, vai para o fim; com
   * `'mais'`, fica sempre em "Mais".
   */
  prioridadeNoCelular?: number | 'mais';
}
