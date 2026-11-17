import type { Permissao } from '@grafite/domain';
import { CabecalhoDaPagina } from '@grafite/ui';
import type { ReactNode } from 'react';
import { useAcesso } from '../../sessao/useAcesso.ts';
import { SemPermissao } from '../administracao/SemPermissao.tsx';

/**
 * Uma tela dos chamados (change chamados-da-ti, design, decisão 14, "O módulo na casca"): o que ela
 * mostra, para quem tem uma das permissões dela; para quem não tem, o título dela, "Você não tem
 * acesso…" e a quem pedir, sem pedir os dados.
 */
export function TelaDosChamados({
  titulo,
  permissoes,
  semAcesso,
  children,
}: {
  titulo: string;
  permissoes: readonly Permissao[];
  /** O complemento de "Você não tem acesso", como "aos chamados". */
  semAcesso: string;
  children: ReactNode;
}) {
  const { pode } = useAcesso();
  if (permissoes.some((permissao) => pode(permissao))) return children;
  return (
    <>
      <CabecalhoDaPagina titulo={titulo} />
      <SemPermissao a={semAcesso} />
    </>
  );
}
