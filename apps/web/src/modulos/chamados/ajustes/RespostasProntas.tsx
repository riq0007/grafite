import { CabecalhoDaPagina } from '@grafite/ui';
import { PERMISSOES_DE_CONFIGURAR } from '../permissoes.ts';
import { TelaDosChamados } from '../TelaDosChamados.tsx';

/** As respostas prontas (spec modulo-chamados), para quem configura os chamados. */
export function RespostasProntas() {
  return (
    <TelaDosChamados
      titulo="Respostas prontas"
      permissoes={PERMISSOES_DE_CONFIGURAR}
      semAcesso="às respostas prontas"
    >
      <CabecalhoDaPagina titulo="Respostas prontas" />
    </TelaDosChamados>
  );
}
