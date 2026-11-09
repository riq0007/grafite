import { createRoute, Outlet } from '@tanstack/react-router';
import { raiz } from '../../rotas/raiz.tsx';
import { InicioDosConsumiveis } from './consumiveis/Consumiveis.tsx';
import { ConsumivelNovo } from './consumiveis/ConsumivelNovo.tsx';
import { FichaDoConsumivel } from './consumiveis/FichaDoConsumivel.tsx';
import { validarFiltrosDosConsumiveis } from './consumiveis/filtros.ts';
import { InicioDoEstoque } from './estoque/Estoque.tsx';
import { validarFiltrosDoEstoque } from './estoque/filtros.ts';
import { validarFiltrosDasMovimentacoes } from './estoque/filtrosDasMovimentacoes.ts';
import { InicioDasMovimentacoes } from './estoque/Movimentacoes.tsx';
import { InicioDaOperacao } from './Inicio.tsx';
import { InicioDosIndicadores } from './indicadores/Indicadores.tsx';
import { FichaDaOrdem } from './ordens/FichaDaOrdem.tsx';
import { validarFiltrosDasOrdens } from './ordens/filtros.ts';
import { InicioDasOrdens } from './ordens/Ordens.tsx';
import { FichaDaSolicitacao } from './solicitacoes/FichaDaSolicitacao.tsx';
import { validarFiltrosDasSolicitacoes } from './solicitacoes/filtros.ts';
import { InicioDasSolicitacoes } from './solicitacoes/Solicitacoes.tsx';

// Cada rota numa constante própria: criadas dentro do addChildren, as filhas perdem os tipos dos
// endereços, e um menu com destino errado passaria a compilar.

const operacao = createRoute({
  getParentRoute: () => raiz,
  path: '/operacao',
  component: Outlet,
});

// O endereço do módulo abre o Início do Operação (change redesenho-da-interface, design, decisão 4).
const inicio = createRoute({
  getParentRoute: () => operacao,
  path: '/',
  component: InicioDaOperacao,
});

const consumiveis = createRoute({
  getParentRoute: () => operacao,
  path: 'consumiveis',
  component: Outlet,
});

const listaDosConsumiveis = createRoute({
  getParentRoute: () => consumiveis,
  path: '/',
  validateSearch: validarFiltrosDosConsumiveis,
  component: InicioDosConsumiveis,
});

const consumivelNovo = createRoute({
  getParentRoute: () => consumiveis,
  path: 'novo',
  component: ConsumivelNovo,
});

const consumivel = createRoute({
  getParentRoute: () => consumiveis,
  path: '$id',
  component: FichaDoConsumivel,
});

const estoque = createRoute({
  getParentRoute: () => operacao,
  path: 'estoque',
  validateSearch: validarFiltrosDoEstoque,
  component: InicioDoEstoque,
});

const movimentacoes = createRoute({
  getParentRoute: () => operacao,
  path: 'movimentacoes',
  validateSearch: validarFiltrosDasMovimentacoes,
  component: InicioDasMovimentacoes,
});

const solicitacoes = createRoute({
  getParentRoute: () => operacao,
  path: 'solicitacoes',
  component: Outlet,
});

const listaDasSolicitacoes = createRoute({
  getParentRoute: () => solicitacoes,
  path: '/',
  validateSearch: validarFiltrosDasSolicitacoes,
  component: InicioDasSolicitacoes,
});

const solicitacao = createRoute({
  getParentRoute: () => solicitacoes,
  path: '$numero',
  component: FichaDaSolicitacao,
});

const ordens = createRoute({
  getParentRoute: () => operacao,
  path: 'ordens',
  component: Outlet,
});

const listaDasOrdens = createRoute({
  getParentRoute: () => ordens,
  path: '/',
  validateSearch: validarFiltrosDasOrdens,
  component: InicioDasOrdens,
});

const ordemDeServico = createRoute({
  getParentRoute: () => ordens,
  path: '$numero',
  component: FichaDaOrdem,
});

/** Os indicadores da operação; o foco do endereço, como o da notificação, vem da raiz. */
const indicadores = createRoute({
  getParentRoute: () => operacao,
  path: 'indicadores',
  component: InicioDosIndicadores,
});

export const rotasDaOperacao = operacao.addChildren([
  inicio,
  consumiveis.addChildren([listaDosConsumiveis, consumivelNovo, consumivel]),
  estoque,
  movimentacoes,
  solicitacoes.addChildren([listaDasSolicitacoes, solicitacao]),
  ordens.addChildren([listaDasOrdens, ordemDeServico]),
  indicadores,
]);
