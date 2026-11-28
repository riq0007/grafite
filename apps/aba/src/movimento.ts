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
 * Quantas vezes as fontes chegaram. A fonte da interface vem pelo `@font-face`, depois da primeira
 * medida, e com a fonte reserva a aba tem outra largura (a DejaVu do Linux a alarga de 162 para
 * 178 px). Cada chegada renderiza de novo, e quem guarda uma medida para animar dela mede de novo. A
 * fonte que chegou antes de o efeito ouvir conta como uma chegada.
 */
export function useChegadasDasFontes(): number {
  const [chegadas, setChegadas] = useState(0);
  useEffect(() => {
    const fontes = typeof document === 'undefined' ? undefined : document.fonts;
    if (!fontes) return;
    const chegou = () => setChegadas((antes) => antes + 1);
    fontes.addEventListener('loadingdone', chegou);
    if (fontes.status === 'loaded') chegou();
    return () => fontes.removeEventListener('loadingdone', chegou);
  }, []);
  return chegadas;
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
  const chegadasDasFontes = useChegadasDasFontes();
  // A medida de antes passa a ser a com a fonte, se nada está animando a largura agora.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mede de novo só quando as fontes chegam.
  useLayoutEffect(() => {
    const elemento = ref.current;
    if (chegadasDasFontes === 0 || !elemento || !antes.current) return;
    if ((elemento.getAnimations?.() ?? []).length > 0) return;
    antes.current = { ...antes.current, largura: elemento.offsetWidth };
  }, [chegadasDasFontes]);
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

/** Uma forma medida: o tamanho, o raio e a distância ao alto da janela. */
export interface FormaMedida {
  largura: number;
  altura: number;
  raio: string;
  topo: number;
}

/**
 * A forma que entra cresce, ou encolhe, a partir da que saiu: a aba que vira a linha da apresentação
 * e a linha que volta a ser a aba.
 */
export function useEntradaDaForma(
  ref: RefObject<HTMLElement | null>,
  de: FormaMedida | null,
  duracao: 'abrir' | 'fechar',
) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: anima uma vez, ao montar.
  useLayoutEffect(() => {
    const elemento = ref.current;
    if (!elemento || !de) return;
    const topo = elemento.getBoundingClientRect().top;
    elemento.animate(
      [
        {
          width: `${de.largura}px`,
          height: `${de.altura}px`,
          borderRadius: de.raio,
          transform: `translateY(${de.topo - topo}px)`,
        },
        {
          width: `${elemento.offsetWidth}px`,
          height: `${elemento.offsetHeight}px`,
          borderRadius: getComputedStyle(elemento).borderRadius,
          transform: 'none',
        },
      ],
      { duration: duracaoDaAba(duracao), easing: curva(duracao === 'abrir' ? 'padrao' : 'saida') },
    );
  }, []);
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
