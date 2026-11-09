import { createRoute, Outlet } from '@tanstack/react-router';
import { raiz } from '../../rotas/raiz.tsx';
import { Agenda } from './Agenda.tsx';
import { Cadastro } from './Cadastro.tsx';
import { MinhasReservas, Pedidos } from './Reservas.tsx';

// As salas de reunião (change salas-de-reuniao): a Agenda, as Minhas reservas, os Pedidos e o
// Cadastro. A Agenda aceita `?nova=1`, que a busca usa para abrir a Nova reserva.

const salas = createRoute({
  getParentRoute: () => raiz,
  path: '/salas',
  component: Outlet,
});

const agenda = createRoute({
  getParentRoute: () => salas,
  path: '/',
  validateSearch: (busca: Record<string, unknown>): { nova?: 1 } =>
    busca.nova === 1 || busca.nova === '1' ? { nova: 1 } : {},
  component: Agenda,
});

const minhas = createRoute({
  getParentRoute: () => salas,
  path: 'minhas',
  component: MinhasReservas,
});

const pedidos = createRoute({
  getParentRoute: () => salas,
  path: 'pedidos',
  component: Pedidos,
});

const cadastro = createRoute({
  getParentRoute: () => salas,
  path: 'cadastro',
  component: Cadastro,
});

export const rotasDasSalas = salas.addChildren([agenda, minhas, pedidos, cadastro]);
