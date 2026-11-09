// Utilitário de teste do catálogo: movimento de ponteiro em linha reta, passo a passo,
// com cada evento disparado no elemento que está sob o ponto (como faz o navegador).
import { userEvent } from 'storybook/test';

export interface Ponto {
  x: number;
  y: number;
}

export const centro = (r: DOMRect): Ponto => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/** Um usuário cujo ponteiro guarda a posição entre os movimentos. */
export function criarPonteiro() {
  const usuario = userEvent.setup();
  return {
    usuario,
    async mover(
      de: Ponto,
      para: Ponto,
      {
        passos = 12,
        intervalo = 16,
        aCadaPasso,
      }: { passos?: number; intervalo?: number; aCadaPasso?: () => void } = {},
    ) {
      for (let i = 1; i <= passos; i++) {
        const x = de.x + ((para.x - de.x) * i) / passos;
        const y = de.y + ((para.y - de.y) * i) / passos;
        const alvo = document.elementFromPoint(x, y) ?? document.body;
        await usuario.pointer({ target: alvo, coords: { clientX: x, clientY: y } });
        aCadaPasso?.();
        await esperar(intervalo);
      }
    },
  };
}
