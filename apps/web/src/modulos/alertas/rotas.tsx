import { createRoute, Outlet } from '@tanstack/react-router';
import { raiz } from '../../rotas/raiz.tsx';
import { AlertasAbertos, AlertasResolvidos } from './Alertas.tsx';
import { validarFiltrosDosAbertos, validarFiltrosDosResolvidos } from './filtros.ts';
import { Indicadores } from './Indicadores.tsx';
import { FichaDaRegra, RegraNova, Regras } from './Regras.tsx';

// Cada rota numa constante própria: criadas dentro do addChildren, as filhas perdem os tipos dos
// endereços, e um menu com destino errado passaria a compilar.

const alertas = createRoute({
  getParentRoute: () => raiz,
  path: '/alertas',
  component: Outlet,
});

const abertos = createRoute({
  getParentRoute: () => alertas,
  path: '/',
  validateSearch: validarFiltrosDosAbertos,
  component: AlertasAbertos,
});

const resolvidos = createRoute({
  getParentRoute: () => alertas,
  path: 'resolvidos',
  validateSearch: validarFiltrosDosResolvidos,
  component: AlertasResolvidos,
});

const indicadores = createRoute({
  getParentRoute: () => alertas,
  path: 'indicadores',
  component: Indicadores,
});

const regras = createRoute({
  getParentRoute: () => alertas,
  path: 'regras',
  component: Outlet,
});

const listaDasRegras = createRoute({
  getParentRoute: () => regras,
  path: '/',
  component: Regras,
});

const novaRegra = createRoute({
  getParentRoute: () => regras,
  path: 'nova',
  component: RegraNova,
});

const regra = createRoute({
  getParentRoute: () => regras,
  path: '$regraId',
  component: FichaDaRegra,
});

export const rotasDosAlertas = alertas.addChildren([
  abertos,
  resolvidos,
  indicadores,
  regras.addChildren([listaDasRegras, novaRegra, regra]),
]);
