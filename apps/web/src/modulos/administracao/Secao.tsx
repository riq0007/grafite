import { CabecalhoDaPagina } from '@grafite/ui';
import type { ReactNode } from 'react';
import { useAcesso } from '../../sessao/useAcesso.ts';
import { SemPermissao } from './SemPermissao.tsx';
import { type IdDaSecao, SECOES } from './secoes.ts';

/**
 * Uma seção da Administração: com a permissão da tela, o conteúdo dela; sem a permissão, o título
 * e a quem pedir acesso, sem o conteúdo, que nem chega a pedir os dados.
 */
export function Secao({ id, children }: { id: IdDaSecao; children: ReactNode }) {
  const secao = SECOES.find((candidata) => candidata.id === id);
  const { pode } = useAcesso();
  if (!secao) return null;
  if (!pode(secao.permissao)) {
    return (
      <>
        <CabecalhoDaPagina titulo={secao.nome} />
        <SemPermissao a={secao.semAcesso} />
      </>
    );
  }
  return children;
}
