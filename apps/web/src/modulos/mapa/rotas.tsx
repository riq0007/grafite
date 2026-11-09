import { createRoute, Outlet } from '@tanstack/react-router';
import { raiz } from '../../rotas/raiz.tsx';
import { MapaDaPlanta } from './MapaDaPlanta.tsx';
import { Plantas } from './Plantas.tsx';

// O mapa da planta (change p7-mapa-da-planta): as plantas e o mapa de cada uma.

const mapa = createRoute({
  getParentRoute: () => raiz,
  path: '/mapa',
  component: Outlet,
});

const inicio = createRoute({
  getParentRoute: () => mapa,
  path: '/',
  component: Plantas,
});

const planta = createRoute({
  getParentRoute: () => mapa,
  path: '$id',
  component: MapaDaPlanta,
});

export const rotasDoMapa = mapa.addChildren([inicio, planta]);
