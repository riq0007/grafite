// As ações da tela aberta na busca (spec busca-global, "O que a busca encontra"; change
// relacoes-vivas, decisão 5): cada tela declara as ações dela com `useAcoesDaTela`, e a casca as lê
// quando a busca abre, no grupo "Nesta tela", antes de "Ir para".
import type { LucideIcon } from 'lucide-react';
import { createContext, useContext, useEffect, useRef } from 'react';

export interface AcaoDaTela {
  /** Único entre as ações da tela. */
  id: string;
  rotulo: string;
  palavrasChave?: readonly string[];
  icone?: LucideIcon;
  /** O que a ação faz, pela tela, como abrir o painel de filtros. A busca fecha antes. */
  executar: () => void;
}

/** Onde as telas abertas registram as ações; vale a da tela registrada por último. */
export interface RegistroDasAcoesDaTela {
  registrar: (ler: () => readonly AcaoDaTela[]) => () => void;
  ler: () => readonly AcaoDaTela[];
}

export function criarRegistroDasAcoesDaTela(): RegistroDasAcoesDaTela {
  const leitores: Array<() => readonly AcaoDaTela[]> = [];
  return {
    registrar(ler) {
      leitores.push(ler);
      return () => {
        const posicao = leitores.lastIndexOf(ler);
        if (posicao >= 0) leitores.splice(posicao, 1);
      };
    },
    ler: () => leitores.at(-1)?.() ?? [],
  };
}

export const ContextoDasAcoesDaTela = createContext<RegistroDasAcoesDaTela | null>(null);

/**
 * A tela declara as ações dela para a busca, enquanto estiver aberta. A busca lê as ações de agora
 * ao abrir, então elas podem depender do estado da tela.
 */
export function useAcoesDaTela(acoes: readonly AcaoDaTela[]) {
  const registro = useContext(ContextoDasAcoesDaTela);
  const atuais = useRef(acoes);
  atuais.current = acoes;
  useEffect(() => registro?.registrar(() => atuais.current), [registro]);
}
