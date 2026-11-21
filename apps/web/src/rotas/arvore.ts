import { createRouter, type RouterHistory } from '@tanstack/react-router';
import { lembrarAsEntradas } from '../chat/voltar.ts';
import { REGISTRO } from '../modulos/registro.ts';
import type { ModuloRegistrado } from '../modulos/tipos.ts';
import { raiz } from './raiz.tsx';

/** Árvore de rotas composta pelo registro: cada módulo pendura a sua subárvore na raiz. */
export const arvoreDeRotas = raiz.addChildren(REGISTRO.map((modulo) => modulo.rotas));

/**
 * Roteador do app. Sem histórico, usa o do navegador; os testes passam um em memória e, para
 * ligar uma fonte de teste a um módulo, o registro que a casca e as telas recebem.
 */
export function criarRoteador(
  historico?: RouterHistory,
  modulos: readonly ModuloRegistrado[] = REGISTRO,
) {
  const roteador = createRouter({
    routeTree: arvoreDeRotas,
    history: historico,
    context: { modulos },
  });
  // A seta de voltar da janela do Chat, no celular, sabe se a entrada anterior é a lista
  // (`chat/voltar.ts`).
  lembrarAsEntradas(roteador.history);
  return roteador;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof criarRoteador>;
  }
}
