import { CabecalhoDaPagina } from '@grafite/ui';
import { PERMISSOES_DE_CONFIGURAR } from '../permissoes.ts';
import { TelaDosChamados } from '../TelaDosChamados.tsx';

/** Os tipos de chamado (spec modulo-chamados), para quem configura os chamados. */
export function TiposDeChamado() {
  return (
    <TelaDosChamados
      titulo="Tipos de chamado"
      permissoes={PERMISSOES_DE_CONFIGURAR}
      semAcesso="aos tipos de chamado"
    >
      <CabecalhoDaPagina titulo="Tipos de chamado" />
    </TelaDosChamados>
  );
}
