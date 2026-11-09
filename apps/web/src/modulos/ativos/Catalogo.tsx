import { CabecalhoDaPagina, JanelaComSecoes, usePostura } from '@grafite/ui';
import { Link, Navigate, Outlet, useRouterState } from '@tanstack/react-router';
import { useAcesso } from '../../sessao/useAcesso.ts';
import { SemPermissao } from '../administracao/SemPermissao.tsx';
import { PERMISSOES_DO_CATALOGO, SECOES_DO_CATALOGO } from './secoes.ts';

/**
 * O catálogo de ativos (spec catalogo-de-ativos): as seções ao lado da escolhida, como a
 * Administração e os Ajustes. No celular, uma de cada vez. Sem as permissões do módulo, o título e a
 * quem pedir acesso.
 */
export function Catalogo() {
  const { pode } = useAcesso();
  const caminho = useRouterState({ select: (estado) => estado.location.pathname }).replace(
    /\/$/,
    '',
  );
  if (!PERMISSOES_DO_CATALOGO.some((permissao) => pode(permissao))) {
    return (
      <>
        <CabecalhoDaPagina titulo="Catálogo" />
        <SemPermissao a="ao catálogo de ativos" />
      </>
    );
  }
  const atual = SECOES_DO_CATALOGO.find(
    (secao) => caminho === secao.endereco || caminho.startsWith(`${secao.endereco}/`),
  )?.id;
  return (
    <JanelaComSecoes
      rotulo="Seções do catálogo"
      titulo="Catálogo"
      grupos={[SECOES_DO_CATALOGO]}
      atual={atual}
      naLista={caminho === '/gestao/catalogo'}
      linkDaSecao={(secao, props) => <Link to={secao.endereco} {...props} />}
      linkDeVoltar={(props) => <Link to="/gestao/catalogo" {...props} />}
    >
      <Outlet />
    </JanelaComSecoes>
  );
}

/** O endereço do catálogo: no computador, a primeira seção; no celular, a lista. */
export function InicioDoCatalogo() {
  const celular = usePostura() === 'celular';
  if (celular) return null;
  return <Navigate to="/gestao/catalogo/tipos" replace />;
}
