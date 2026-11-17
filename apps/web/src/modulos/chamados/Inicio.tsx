import { CabecalhoDaPagina } from '@grafite/ui';
import { Navigate } from '@tanstack/react-router';
import { useAcesso } from '../../sessao/useAcesso.ts';
import { PERMISSOES_DE_VER } from './permissoes.ts';
import { TelaDosChamados } from './TelaDosChamados.tsx';

/**
 * O endereço dos Chamados (spec modulo-chamados, "Chamados no dock"; change chamados-da-ti,
 * design, decisão 14, "O módulo na casca"): o Início dos chamados, para quem os vê; quem só
 * configura vai aos Tipos de chamado, sem o Início no histórico; e quem não tem nenhuma das
 * permissões lê que não tem acesso, e a quem pedir.
 */
export function InicioDosChamados() {
  const { pode } = useAcesso();
  const ve = PERMISSOES_DE_VER.some((permissao) => pode(permissao));
  if (!ve && pode('chamados.configurar')) return <Navigate to="/chamados/tipos" replace />;
  return (
    <TelaDosChamados titulo="Chamados" permissoes={PERMISSOES_DE_VER} semAcesso="aos chamados">
      <CabecalhoDaPagina titulo="Chamados" />
    </TelaDosChamados>
  );
}
