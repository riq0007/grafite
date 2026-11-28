import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';

// O movimento da aba (spec aba-dos-colaboradores, "Movimento da aba"): as durações e as curvas são os
// tokens `--dur-aba-*` e `--curva-*`, que o movimento reduzido do Windows leva a 1 ms. As animações
// do JavaScript os leem do CSS, para não ter valor solto.

function token(nome: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

/** A duração de um token `--dur-aba-*`, em ms. */
export function duracaoDaAba(nome: string): number {
  const valor = token(`--dur-aba-${nome}`);
  const ms = Number.parseFloat(valor);
  if (Number.isNaN(ms)) return 0;
  return valor.endsWith('ms') ? ms : ms * 1000;
}

export function curva(nome: 'padrao' | 'saida'): string {
  return token(`--curva-${nome}`) || 'ease';
}

/**
 * A largura que muda anima da antiga para a nova: alarga em `alargar`, e volta ao repouso em
 * `fechar`. A troca de forma ou de tamanho da tela não anima. Com `deLargura`, a primeira medida
 * também anima, dela para a de agora: é a aba fechada que volta do painel.
 */
export function useLarguraAnimada(
  ref: RefObject<HTMLElement | null>,
  chave: string,
  semAnimar: string,
  deLargura: number | null = null,
) {
  const antes = useRef<{ largura: number; semAnimar: string } | null>(
    deLargura === null ? null : { largura: deLargura, semAnimar },
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: mede de novo a cada aviso.
  useLayoutEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;
    const largura = elemento.offsetWidth;
    const anterior = antes.current;
    antes.current = { largura, semAnimar };
    if (!anterior || anterior.semAnimar !== semAnimar || anterior.largura === largura) return;
    const crescendo = largura > anterior.largura;
    elemento.animate([{ width: `${anterior.largura}px` }, { width: `${largura}px` }], {
      duration: duracaoDaAba(crescendo ? 'alargar' : 'fechar'),
      easing: curva(crescendo ? 'padrao' : 'saida'),
    });
  }, [chave, semAnimar]);
}

/**
 * O valor que some fica mais um pouco, para a saída dele: devolve o último valor e se ele está saindo.
 */
export function useComSaida<T>(
  valor: T | null,
  duracao: string,
): { valor: T | null; saindo: boolean } {
  const [ultimo, setUltimo] = useState<T | null>(valor);
  const [saindo, setSaindo] = useState(false);
  useEffect(() => {
    if (valor !== null) {
      setUltimo(valor);
      setSaindo(false);
      return;
    }
    setSaindo(true);
    const espera = setTimeout(() => {
      setUltimo(null);
      setSaindo(false);
    }, duracaoDaAba(duracao));
    return () => clearTimeout(espera);
  }, [valor, duracao]);
  return valor !== null
    ? { valor, saindo: false }
    : { valor: ultimo, saindo: saindo && ultimo !== null };
}
