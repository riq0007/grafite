import { CabecalhoDaPagina, JanelaComSecoes, usePostura } from '@grafite/ui';
import { Link, Navigate, Outlet, useRouterState } from '@tanstack/react-router';
import { useAcesso } from '../../sessao/useAcesso.ts';
import { useServidor } from '../../sessao/useSessao.tsx';
import { Backup } from './backup/Backup.tsx';
import { Secao } from './Secao.tsx';
import { SemPermissao } from './SemPermissao.tsx';
import { SECOES } from './secoes.ts';

/**
 * A Administração (spec modulo-administracao): a lista das seções que a conta pode usar, ao lado
 * da seção escolhida, como os Ajustes. No celular, uma de cada vez.
 */
export function Administracao() {
  const { pode } = useAcesso();
  const caminho = useRouterState({ select: (estado) => estado.location.pathname }).replace(
    /\/$/,
    '',
  );
  const permitidas = SECOES.filter((secao) => pode(secao.permissao));
  if (permitidas.length === 0) {
    return (
      <>
        <CabecalhoDaPagina titulo="Administração" />
        <SemPermissao a="à Administração" />
      </>
    );
  }
  const atual = SECOES.find(
    (secao) => caminho === secao.endereco || caminho.startsWith(`${secao.endereco}/`),
  )?.id;
  return (
    <JanelaComSecoes
      rotulo="Seções da Administração"
      titulo="Administração"
      grupos={[permitidas]}
      atual={atual}
      naLista={caminho === '/administracao'}
      linkDaSecao={(secao, props) => <Link to={secao.endereco} {...props} />}
      linkDeVoltar={(props) => <Link to="/administracao" {...props} />}
    >
      <Outlet />
    </JanelaComSecoes>
  );
}

/**
 * O endereço da Administração: no computador, a primeira seção que a conta pode usar; no
 * celular, a lista, que a janela já mostra.
 */
export function InicioDaAdministracao() {
  const { pode } = useAcesso();
  const celular = usePostura() === 'celular';
  const primeira = SECOES.find((secao) => pode(secao.permissao));
  if (celular || !primeira) return null;
  return <Navigate to={primeira.endereco} replace />;
}

/**
 * A seção Backup (spec modulo-administracao): só existe na organização que opera o servidor; nas
 * outras, o endereço dela leva à primeira seção que a conta pode usar.
 */
export function SecaoDoBackup() {
  const servidor = useServidor();
  const { pode } = useAcesso();
  if (!servidor?.operaOServidor) {
    const primeira = SECOES.find((secao) => pode(secao.permissao));
    return <Navigate to={primeira?.endereco ?? '/administracao'} replace />;
  }
  return (
    <Secao id="backup">
      <Backup />
    </Secao>
  );
}
