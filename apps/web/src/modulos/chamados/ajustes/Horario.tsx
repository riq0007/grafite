import { CabecalhoDaPagina } from '@grafite/ui';
import { PERMISSOES_DE_CONFIGURAR } from '../permissoes.ts';
import { TelaDosChamados } from '../TelaDosChamados.tsx';

/** O horário da TI (spec modulo-chamados), para quem configura os chamados. */
export function HorarioDaTi() {
  return (
    <TelaDosChamados
      titulo="Horário da TI"
      permissoes={PERMISSOES_DE_CONFIGURAR}
      semAcesso="ao horário da TI"
    >
      <CabecalhoDaPagina titulo="Horário da TI" />
    </TelaDosChamados>
  );
}
