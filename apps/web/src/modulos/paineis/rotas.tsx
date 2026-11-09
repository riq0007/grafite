import { createRoute, Outlet } from '@tanstack/react-router';
import { raiz } from '../../rotas/raiz.tsx';
import { Cadastro } from './Cadastro.tsx';
import { Grade } from './Grade.tsx';

// Os painéis (change painel-de-dashboards): a grade, com o painel expandido pelo endereço, que o
// mapa usa, e o cadastro.

const paineis = createRoute({
  getParentRoute: () => raiz,
  path: '/paineis',
  component: Outlet,
});

const grade = createRoute({
  getParentRoute: () => paineis,
  path: '/',
  validateSearch: (busca: Record<string, unknown>): { expandido?: string } =>
    typeof busca.expandido === 'string' && /^[\w-]{1,64}$/.test(busca.expandido)
      ? { expandido: busca.expandido }
      : {},
  component: Grade,
});

const cadastro = createRoute({
  getParentRoute: () => paineis,
  path: 'cadastro',
  component: Cadastro,
});

export const rotasDosPaineis = paineis.addChildren([grade, cadastro]);
