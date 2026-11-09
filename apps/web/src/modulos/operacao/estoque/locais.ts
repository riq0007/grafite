// Os locais que o lançamento oferece (spec modulo-operacao, "Lançamento das movimentações"; change
// p4c-estoque, design, decisão 7): só os ramos em que a conta movimenta o estoque. Os outros ficam à
// vista na árvore, apagados, como a escolha do local faz com o que não se escolhe.
import type { ArvoreDeLocais, LocalDaArvore } from '@grafite/domain';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';

export function locaisForaDoAlcance(
  locais: readonly LocalDaArvore[],
  arvore: ArvoreDeLocais,
  permissao: PermissaoDaSessao | undefined,
): Set<string> {
  if (permissao?.organizacao) return new Set();
  const doRamo = new Set(
    (permissao?.locais ?? []).flatMap((raiz) => (arvore.local(raiz) ? [...arvore.ramo(raiz)] : [])),
  );
  return new Set(locais.map(({ id }) => id).filter((id) => !doRamo.has(id)));
}
