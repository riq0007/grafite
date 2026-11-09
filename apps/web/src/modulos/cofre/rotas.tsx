import { createRoute, Outlet } from '@tanstack/react-router';
import { raiz } from '../../rotas/raiz.tsx';
import { FichaDoSegredo } from './FichaDoSegredo.tsx';
import { validarFiltrosDoCofre } from './filtros.ts';
import { SegredoNovo } from './SegredoNovo.tsx';
import { InicioDoCofre } from './Segredos.tsx';

// Cada rota numa constante própria: criadas dentro do addChildren, as filhas perdem os tipos dos
// endereços, e um menu com destino errado passaria a compilar.

const cofre = createRoute({
  getParentRoute: () => raiz,
  path: '/cofre',
  component: Outlet,
});

const inicio = createRoute({
  getParentRoute: () => cofre,
  path: '/',
  validateSearch: validarFiltrosDoCofre,
  component: InicioDoCofre,
});

const novo = createRoute({
  getParentRoute: () => cofre,
  path: 'novo',
  component: SegredoNovo,
});

const segredo = createRoute({
  getParentRoute: () => cofre,
  path: '$id',
  component: FichaDoSegredo,
});

export const rotasDoCofre = cofre.addChildren([inicio, novo, segredo]);
