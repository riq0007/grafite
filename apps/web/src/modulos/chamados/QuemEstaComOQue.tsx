import { CabecalhoDaPagina } from '@grafite/ui';
import { PERMISSOES_DE_VER } from './permissoes.ts';
import { TelaDosChamados } from './TelaDosChamados.tsx';

/** Quem está com o quê (spec modulo-chamados), para quem vê os chamados. */
export function QuemEstaComOQue() {
  return (
    <TelaDosChamados
      titulo="Quem está com o quê"
      permissoes={PERMISSOES_DE_VER}
      semAcesso="aos chamados"
    >
      <CabecalhoDaPagina titulo="Quem está com o quê" />
    </TelaDosChamados>
  );
}
