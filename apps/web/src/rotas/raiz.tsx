import { createRootRouteWithContext } from '@tanstack/react-router';
import { CascaDoApp } from '../casca/CascaDoApp.tsx';
import type { ModuloRegistrado } from '../modulos/tipos.ts';
import { PaginaNaoEncontrada } from '../paginas/PaginaNaoEncontrada.tsx';

/**
 * O que o roteador entrega a todas as rotas. O registro chega à casca por aqui, e não por
 * importação: as rotas de cada módulo dependem desta raiz, e a raiz não depende delas.
 */
export interface ContextoDasRotas {
  modulos: readonly ModuloRegistrado[];
}

/** Parâmetros de busca que valem em qualquer endereço. */
export interface BuscaDaRaiz {
  /**
   * Elemento que recebe o foco depois de navegar, marcado com `data-foco` (design do F1b, decisão
   * 4). Só letras, números e hífen: o valor vai para um seletor.
   */
  foco?: string;
}

export function validarBuscaDaRaiz(busca: Record<string, unknown>): BuscaDaRaiz {
  const { foco } = busca;
  return typeof foco === 'string' && /^[\w-]+$/.test(foco) ? { foco } : {};
}

/**
 * Rota raiz: a casca, com o conteúdo do módulo na janela. Um endereço desconhecido mostra
 * "Página não encontrada" dentro da própria casca.
 */
export const raiz = createRootRouteWithContext<ContextoDasRotas>()({
  validateSearch: validarBuscaDaRaiz,
  component: CascaDoApp,
  notFoundComponent: PaginaNaoEncontrada,
});
