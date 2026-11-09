// Tipos da busca global no app (design do F1b, decisões 2, 3 e 12).
import type { LucideIcon } from 'lucide-react';
import type { ControleDasPreferencias } from '../preferencias/usePreferencias.tsx';

/**
 * Grupos locais da busca, sempre nesta ordem; os grupos dos provedores vêm depois deles. "Nesta
 * tela" traz as ações da tela aberta (change relacoes-vivas, decisão 5).
 */
export type IdDoGrupoLocal = 'nesta-tela' | 'ir-para' | 'acoes' | 'ajustes';

export const GRUPOS_LOCAIS: ReadonlyArray<{ id: IdDoGrupoLocal; nome: string }> = [
  { id: 'nesta-tela', nome: 'Nesta tela' },
  { id: 'ir-para', nome: 'Ir para' },
  { id: 'acoes', nome: 'Ações' },
  { id: 'ajustes', nome: 'Ajustes' },
];

/**
 * De onde a entrada veio. Quando duas levam ao mesmo destino, vale a declarada pelo módulo, depois
 * a do próprio módulo (dock), depois a de um item de menu.
 */
export type OrigemDaEntrada = 'declarada' | 'modulo' | 'menu';

/** O que a casca oferece às ações da busca. */
export interface ContextoDaAcao {
  /** Navega até o endereço e, com `foco`, põe o foco no elemento marcado com `data-foco`. */
  navegar: (destino: string, foco?: string) => void;
  mudarPreferencias: ControleDasPreferencias['mudar'];
  /** Abre a central de notificações. */
  abrirNotificacoes: () => void;
}

export interface EntradaDeBusca {
  /** Identificador estável e único entre as entradas. */
  id: string;
  rotulo: string;
  grupo: IdDoGrupoLocal;
  origem: OrigemDaEntrada;
  /** Onde fica, em texto secundário, como "Ajustes › Dock". */
  caminho?: string;
  palavrasChave?: readonly string[];
  icone?: LucideIcon;
  /** Endereço aonde a entrada leva; sem ele, a entrada executa uma ação. */
  destino?: string;
  /** Elemento que recebe o foco depois de navegar (`data-foco`), como o controle de um ajuste. */
  foco?: string;
  executar?: (contexto: ContextoDaAcao) => void;
}

/** Um grupo de resultados, na forma que a busca mostra. */
export interface GrupoDeResultados {
  id: string;
  nome: string;
  resultados: EntradaDeBusca[];
}
