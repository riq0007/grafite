// A altura de uma tabela que ocupa a janela até embaixo (design do P1c, decisão 10): a tabela
// virtualizada rola por dentro, com o cabeçalho fixo, e precisa de uma altura própria.
import { useLayoutEffect, useRef } from 'react';

/** A menor altura da tabela, para ela continuar útil numa janela baixa: a janela rola. */
const ALTURA_MINIMA = 320;

const medida = (valor: string) => Number.parseFloat(valor) || 0;

/**
 * Dá ao elemento a altura do topo dele até o fim da área que rola da janela, sem o respiro de
 * baixo dela (change janela-rolavel-e-campos-em-colunas, design, decisão 8). O topo soma a rolagem
 * da área, para a medida não depender de onde ela está rolada. Mede de novo a cada desenho, quando o
 * que está acima muda, e quando a janela do navegador muda de tamanho.
 */
export function useAlturaAteOFim<T extends HTMLElement>() {
  const elemento = useRef<T>(null);
  useLayoutEffect(() => {
    const atual = elemento.current;
    if (!atual) return;
    const medir = () => {
      const area = atual.closest<HTMLElement>('[data-rolagem-da-janela]');
      let fim = window.innerHeight;
      let rolado = 0;
      if (area) {
        const estilo = getComputedStyle(area);
        fim =
          area.getBoundingClientRect().bottom -
          medida(estilo.borderBottomWidth) -
          medida(estilo.paddingBottom);
        rolado = area.scrollTop;
      }
      const topo = atual.getBoundingClientRect().top + rolado;
      atual.style.height = `${Math.max(ALTURA_MINIMA, fim - topo)}px`;
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  });
  return elemento;
}
