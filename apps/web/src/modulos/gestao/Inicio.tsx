import { CabecalhoDaPagina } from '@grafite/ui';
import { Navigate } from '@tanstack/react-router';
import { useAcesso } from '../../sessao/useAcesso.ts';
import { SemPermissao } from '../administracao/SemPermissao.tsx';
import { PERMISSOES_DO_CATALOGO } from '../ativos/secoes.ts';

/** As telas da Gestão de ativos, na ordem do menu, com as permissões de quem pode abrir cada uma. */
const TELAS = [
  { endereco: '/gestao/catalogo/tipos', permissoes: PERMISSOES_DO_CATALOGO },
  { endereco: '/gestao/importacoes', permissoes: ['ativos.editar'] },
  { endereco: '/gestao/software', permissoes: ['software.distribuir'] },
  { endereco: '/gestao/control-id/backups', permissoes: ['controlid.ver'] },
] as const;

/**
 * O endereço da Gestão de ativos (spec modulo-gestao-de-ativos, "Gestão de ativos no dock"): a
 * primeira tela do menu que a conta pode usar, sem ficar no histórico. Sem nenhuma, a quem pedir
 * acesso.
 */
export function InicioDaGestao() {
  const { pode } = useAcesso();
  const primeira = TELAS.find((tela) => tela.permissoes.some((permissao) => pode(permissao)));
  if (!primeira) {
    return (
      <>
        <CabecalhoDaPagina titulo="Gestão de ativos" />
        <SemPermissao a="à Gestão de ativos" />
      </>
    );
  }
  return <Navigate to={primeira.endereco} replace />;
}
