import { createRoute } from '@tanstack/react-router';
import { raiz } from '../../rotas/raiz.tsx';
import { Inicio } from './Inicio.tsx';

export const rotasDoInicio = createRoute({
  getParentRoute: () => raiz,
  path: '/',
  component: Inicio,
});
