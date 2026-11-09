// O alvo das seções de preferências dos Ajustes (design do F2c, decisão 5): por padrão, as
// preferências da conta; a tela de padrões dá o rascunho dos padrões da organização, sem mudar a
// casca de quem edita. As prévias das seções, como a tabela e o aviso de exemplo, seguem o alvo.
import { Botao, CabecalhoDaPagina } from '@grafite/ui';
import { createContext, type ReactNode, useContext } from 'react';
import type { PreferenciasDaInterface, SecaoDePreferencias } from './preferencias.ts';
import { usePreferencias } from './usePreferencias.tsx';

export interface AlvoDasPreferencias {
  /** As preferências que as seções mostram. */
  preferencias: PreferenciasDaInterface;
  mudar: <S extends SecaoDePreferencias>(
    secao: S,
    mudanca: Partial<PreferenciasDaInterface[S]>,
  ) => void;
  restaurar: (secao: SecaoDePreferencias) => void;
  /** O nome do botão que restaura a seção; sem ele, "Restaurar padrões". */
  rotuloDeRestaurar?: string;
  /** As seções numa aba de outra tela, como a de padrões: a aba já as nomeia, sem o título. */
  numaAba?: boolean;
}

const Contexto = createContext<AlvoDasPreferencias | null>(null);

/** Dá às seções abaixo outro alvo; sem `alvo`, elas continuam nas preferências da conta. */
export function ProvedorDoAlvo({
  alvo,
  children,
}: {
  alvo?: AlvoDasPreferencias;
  children: ReactNode;
}) {
  return alvo ? <Contexto.Provider value={alvo}>{children}</Contexto.Provider> : children;
}

/** O alvo das seções: o dado pelo ProvedorDoAlvo ou, sem ele, as preferências da conta. */
export function useAlvoDasPreferencias(): AlvoDasPreferencias {
  const daConta = usePreferencias();
  return useContext(Contexto) ?? daConta;
}

/** As seções estão nas preferências da conta, e não no rascunho de outro alvo, como os padrões. */
export function useAlvoEhAConta(): boolean {
  return useContext(Contexto) === null;
}

/** O título da seção no cabeçalho da página; numa aba de outra tela, a aba já o diz. */
export function TituloDaSecao({ children }: { children: ReactNode }) {
  const { numaAba } = useAlvoDasPreferencias();
  return numaAba ? null : <CabecalhoDaPagina titulo={children} />;
}

/** O botão que volta a seção aos padrões do alvo, como "Restaurar padrões". */
export function RestaurarPadroes({ secao }: { secao: SecaoDePreferencias }) {
  const { restaurar, rotuloDeRestaurar = 'Restaurar padrões' } = useAlvoDasPreferencias();
  return (
    <Botao nivel="terciario" onPress={() => restaurar(secao)}>
      {rotuloDeRestaurar}
    </Botao>
  );
}
