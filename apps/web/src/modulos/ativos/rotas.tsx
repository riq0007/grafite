import {
  createRoute,
  Navigate,
  Outlet,
  type ParsedLocation,
  redirect,
} from '@tanstack/react-router';
import { raiz } from '../../rotas/raiz.tsx';
import { useAcesso } from '../../sessao/useAcesso.ts';
import { AtivoNovo } from './cadastro/AtivoNovo.tsx';
import { lerAbaDaFicha } from './cadastro/abas.ts';
import { FichaDoAtivo } from './cadastro/FichaDoAtivo.tsx';
import { lerEnderecoDosAtivos } from './endereco.ts';
import { Etiquetas } from './etiquetas/Etiquetas.tsx';
import { lerEnderecoDasEtiquetas } from './etiquetas/endereco.ts';
import { origemDoEndereco } from './origem.ts';
import { AcessoRemoto } from './remoto/AcessoRemoto.tsx';
import { TabelaDosAtivos } from './tabela/TabelaDosAtivos.tsx';

// Cada rota numa constante própria: criadas dentro do addChildren, as filhas perdem os tipos dos
// endereços, e um menu com destino errado passaria a compilar. O catálogo, as importações, o
// Software e o Control iD estão na Gestão de ativos (change gestao-de-ativos).

const ativos = createRoute({
  getParentRoute: () => raiz,
  path: '/ativos',
  component: Outlet,
});

/** O endereço do módulo: a tabela dos ativos e, para quem não vê ativos, a Gestão de ativos. */
function InicioDosAtivos() {
  const { pode } = useAcesso();
  return pode('ativos.ver') ? <TabelaDosAtivos /> : <Navigate to="/gestao" replace />;
}

const inicio = createRoute({
  getParentRoute: () => ativos,
  path: '/',
  validateSearch: lerEnderecoDosAtivos,
  component: InicioDosAtivos,
});

const ativoNovo = createRoute({
  getParentRoute: () => ativos,
  path: 'novo',
  // A origem da tabela de onde o cadastro veio, que preenche o campo dela (decisão 3).
  validateSearch: (busca: Record<string, unknown>): { origem?: string } => {
    const { origem } = origemDoEndereco(busca);
    return origem ? { origem } : {};
  },
  component: AtivoNovo,
});

const ativo = createRoute({
  getParentRoute: () => ativos,
  path: '$id',
  validateSearch: lerAbaDaFicha,
  component: FichaDoAtivo,
});

const acessoRemoto = createRoute({
  getParentRoute: () => ativos,
  path: '$id/remoto',
  component: AcessoRemoto,
});

const etiquetas = createRoute({
  getParentRoute: () => ativos,
  path: 'etiquetas',
  validateSearch: lerEnderecoDasEtiquetas,
  component: Etiquetas,
});

/**
 * Os endereços que saíram para a Gestão de ativos (change gestao-de-ativos, design, decisão 4): o
 * mesmo resto do caminho e a mesma busca, debaixo de /gestao, no lugar do antigo no histórico. O
 * destino só se sabe na hora, e o roteador o resolve contra as rotas da Gestão.
 */
function paraAGestao({ location }: { location: ParsedLocation }): never {
  throw redirect({
    to: location.pathname.replace(/^\/ativos\//, '/gestao/') as '/gestao',
    search: location.search as Record<string, never>,
    replace: true,
  });
}

// Os segmentos fixos ganham do $id da ficha: /ativos/catalogo não abre um ativo "catalogo".
const catalogoAntigo = createRoute({
  getParentRoute: () => ativos,
  path: 'catalogo/$',
  beforeLoad: paraAGestao,
});

const importacoesAntigas = createRoute({
  getParentRoute: () => ativos,
  path: 'importacoes/$',
  beforeLoad: paraAGestao,
});

const softwareAntigo = createRoute({
  getParentRoute: () => ativos,
  path: 'software/$',
  beforeLoad: paraAGestao,
});

const controlIdAntigo = createRoute({
  getParentRoute: () => ativos,
  path: 'control-id/$',
  beforeLoad: paraAGestao,
});

export const rotasDosAtivos = ativos.addChildren([
  inicio,
  ativoNovo,
  ativo,
  acessoRemoto,
  etiquetas,
  catalogoAntigo,
  importacoesAntigas,
  softwareAntigo,
  controlIdAntigo,
]);
