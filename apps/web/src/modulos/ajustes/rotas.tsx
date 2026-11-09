import { createRoute } from '@tanstack/react-router';
import { raiz } from '../../rotas/raiz.tsx';
import { AjustesDoSistema } from './AjustesDoSistema.tsx';
import { SecaoAcessibilidade } from './secoes/Acessibilidade.tsx';
import { SecaoAparencia } from './secoes/Aparencia.tsx';
import { SecaoConta } from './secoes/Conta.tsx';
import { SecaoCursor } from './secoes/Cursor.tsx';
import { SecaoDock } from './secoes/Dock.tsx';
import { SecaoIdiomaERegiao } from './secoes/IdiomaERegiao.tsx';
import { SecaoNotificacoes } from './secoes/Notificacoes.tsx';
import { SecaoTabelas } from './secoes/Tabelas.tsx';

// Cada rota numa constante própria: criadas dentro do addChildren, as filhas perdem os tipos dos
// endereços, e um menu com destino errado passaria a compilar.

const ajustes = createRoute({
  getParentRoute: () => raiz,
  path: '/ajustes',
  component: AjustesDoSistema,
});

/**
 * Em /ajustes, o computador mostra a primeira seção de preferências, e o celular só a lista
 * (AjustesDoSistema).
 */
const inicio = createRoute({ getParentRoute: () => ajustes, path: '/', component: SecaoAparencia });

const conta = createRoute({ getParentRoute: () => ajustes, path: 'conta', component: SecaoConta });

const aparencia = createRoute({
  getParentRoute: () => ajustes,
  path: 'aparencia',
  component: SecaoAparencia,
});

const dock = createRoute({ getParentRoute: () => ajustes, path: 'dock', component: SecaoDock });

const cursor = createRoute({
  getParentRoute: () => ajustes,
  path: 'cursor',
  component: SecaoCursor,
});

const notificacoes = createRoute({
  getParentRoute: () => ajustes,
  path: 'notificacoes',
  component: SecaoNotificacoes,
});

const tabelas = createRoute({
  getParentRoute: () => ajustes,
  path: 'tabelas',
  component: SecaoTabelas,
});

const idiomaERegiao = createRoute({
  getParentRoute: () => ajustes,
  path: 'idioma-e-regiao',
  component: SecaoIdiomaERegiao,
});

const acessibilidade = createRoute({
  getParentRoute: () => ajustes,
  path: 'acessibilidade',
  component: SecaoAcessibilidade,
});

export const rotasDeAjustes = ajustes.addChildren([
  inicio,
  conta,
  aparencia,
  dock,
  cursor,
  notificacoes,
  tabelas,
  idiomaERegiao,
  acessibilidade,
]);
