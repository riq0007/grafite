import { PERMISSOES_DE_VER } from './permissoes.ts';
import { ListaDosPrazos } from './prazos/ListaDosPrazos.tsx';
import { TelaDosChamados } from './TelaDosChamados.tsx';

/** Os prazos dos chamados (spec modulo-chamados), para quem vê os chamados. */
export function PrazosDosChamados() {
  return (
    <TelaDosChamados titulo="Prazos" permissoes={PERMISSOES_DE_VER} semAcesso="aos chamados">
      <ListaDosPrazos />
    </TelaDosChamados>
  );
}
