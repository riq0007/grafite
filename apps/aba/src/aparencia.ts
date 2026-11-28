import { useEffect, useState } from 'react';
import { type Aparencia, lerAparencia, ouvirAparencia, type TemaDoWindows } from './nativo.ts';

/** A aparência sem o lado nativo responder: a pílula, no Windows escuro, numa tela grande. */
export const APARENCIA_DE_FABRICA: Aparencia = {
  forma: 'pilula',
  tema: 'escuro',
  movimentoReduzido: false,
  tela: { largura: 1920, altura: 1080 },
};

/** A tela pequena (spec aba-dos-colaboradores, "Aba fechada"; mockup m12). */
export const LARGURA_DA_TELA_PEQUENA = 1366;
/** Até esta altura, a pílula desce para não cobrir a barra de título do programa maximizado (m12). */
export const ALTURA_DA_TELA_BAIXA = 800;

export interface MedidasDaAbaFechada {
  /** A pílula de 160×32, e não a de 162×34. */
  compacta: boolean;
  /** A distância da forma ao alto da tela, em px. O entalhe fica preso à borda. */
  topo: number;
}

export function medidasDaAbaFechada({ forma, tela }: Aparencia): MedidasDaAbaFechada {
  return {
    compacta: tela.largura <= LARGURA_DA_TELA_PEQUENA,
    topo: forma === 'entalhe' ? 0 : tela.altura <= ALTURA_DA_TELA_BAIXA ? 36 : 8,
  };
}

/**
 * O tema e o movimento do Windows no <html>: o `data-windows-theme` escolhe as cores
 * `--cor-aba-flutuante-*`, e o `data-motion` reduz as durações da aba.
 */
export function aplicarNaRaiz(tema: TemaDoWindows, movimentoReduzido: boolean, raiz: HTMLElement) {
  raiz.dataset.windowsTheme = tema;
  if (movimentoReduzido) raiz.dataset.motion = 'reduzido';
  else delete raiz.dataset.motion;
}

/**
 * A aparência que o lado nativo dá e a que ele avisa depois, sem reiniciar: a forma nova da
 * configuração, o tema trocado e a tela principal trocada. Sem resposta dele, a de fábrica.
 */
export function useAparencia(): Aparencia | null {
  const [aparencia, setAparencia] = useState<Aparencia | null>(null);

  useEffect(() => {
    let ativo = true;
    let deixarDeOuvir: (() => void) | undefined;
    ouvirAparencia((nova) => {
      if (ativo) setAparencia(nova);
    })
      .then((parar) => {
        if (ativo) deixarDeOuvir = parar;
        else parar();
      })
      .catch(() => undefined);
    // O aviso que chegou antes da leitura é o mais novo, e fica.
    lerAparencia()
      .then((lida) => {
        if (ativo) setAparencia((atual) => atual ?? lida);
      })
      .catch(() => {
        if (ativo) setAparencia((atual) => atual ?? APARENCIA_DE_FABRICA);
      });
    return () => {
      ativo = false;
      deixarDeOuvir?.();
    };
  }, []);

  const tema = aparencia?.tema;
  const movimentoReduzido = aparencia?.movimentoReduzido;
  useEffect(() => {
    if (tema !== undefined && movimentoReduzido !== undefined) {
      aplicarNaRaiz(tema, movimentoReduzido, document.documentElement);
    }
  }, [tema, movimentoReduzido]);

  return aparencia;
}
