import { JanelaComSecoes } from '@grafite/ui';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { SECOES } from './secoes.ts';

type Secao = (typeof SECOES)[number];

/** A Conta no topo da lista, separada das seções de preferências (spec ajustes-do-sistema). */
const GRUPOS_DA_LISTA: Secao[][] = [
  SECOES.filter((secao) => secao.id === 'conta'),
  SECOES.filter((secao) => secao.id !== 'conta'),
];

/** Em /ajustes, a seção à vista no computador: a primeira de preferências. */
const SECAO_INICIAL = 'aparencia';

/**
 * Ajustes do Sistema: a lista de seções e a seção escolhida, lado a lado. No celular, uma de cada
 * vez: em /ajustes só a lista, e numa seção só ela, com Voltar para a lista.
 */
export function AjustesDoSistema() {
  const caminho = useRouterState({ select: (estado) => estado.location.pathname });
  const naLista = caminho.replace(/\/$/, '') === '/ajustes';
  const atual = naLista
    ? SECAO_INICIAL
    : SECOES.find((secao) => caminho === secao.endereco || caminho.startsWith(`${secao.endereco}/`))
        ?.id;

  return (
    <JanelaComSecoes
      rotulo="Seções dos Ajustes"
      titulo="Ajustes do Sistema"
      grupos={GRUPOS_DA_LISTA}
      atual={atual}
      naLista={naLista}
      linkDaSecao={(secao, props) => <Link to={secao.endereco} {...props} />}
      linkDeVoltar={(props) => <Link to="/ajustes" {...props} />}
    >
      <Outlet />
    </JanelaComSecoes>
  );
}
