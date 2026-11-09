// Postura da casca (design, decisão 6): computador, tablet ou celular, pelo ponteiro primário e
// pela largura da janela. Muda sem recarregar quando a janela muda ou o aparelho gira.
import { useEffect, useState } from 'react';
import { LIMITES_DE_POSTURA } from '../tokens/escalas.ts';

export type Postura = 'computador' | 'tablet' | 'celular';

const PONTEIRO_FINO = '(pointer: fine)';

/** Abaixo de 768 px, celular; acima, computador com ponteiro fino e tablet com toque. */
export function escolherPostura(largura: number, ponteiroFino: boolean): Postura {
  if (largura < LIMITES_DE_POSTURA.celular) return 'celular';
  return ponteiroFino ? 'computador' : 'tablet';
}

function lerPostura(): Postura {
  return escolherPostura(window.innerWidth, matchMedia(PONTEIRO_FINO).matches);
}

/** A postura atual, lida já no primeiro render e atualizada quando a janela ou o ponteiro mudam. */
export function usePostura(): Postura {
  const [postura, definirPostura] = useState(lerPostura);
  useEffect(() => {
    const atualizar = () => definirPostura(lerPostura());
    const ponteiro = matchMedia(PONTEIRO_FINO);
    window.addEventListener('resize', atualizar);
    ponteiro.addEventListener('change', atualizar);
    return () => {
      window.removeEventListener('resize', atualizar);
      ponteiro.removeEventListener('change', atualizar);
    };
  }, []);
  return postura;
}
