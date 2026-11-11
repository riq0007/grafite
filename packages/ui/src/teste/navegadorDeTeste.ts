// O ponteiro e o teclado de verdade do navegador de teste, para as histórias que conferem o que o
// evento sintético não liga: o `:hover` e o `:focus-visible` do CSS e a rolagem pela tecla. Quem
// liga é a preparação dos testes do catálogo (`.storybook/vitest.setup.ts`), com os comandos do
// Playwright. No catálogo aberto no navegador, não há navegador de teste: quem passa o ponteiro é
// a pessoa, e a história confere só o que não depende dele.

export interface NavegadorDeTeste {
  /** Põe o cursor real sobre o elemento, no meio dele ou no ponto dado a partir do canto dele. */
  porPonteiroSobre: (seletor: string, ponto?: { x: number; y: number }) => Promise<void>;
  /** Tira o cursor real de cima da página. */
  tirarPonteiro: () => Promise<void>;
  /** Aperta uma tecla de verdade, no elemento em foco. */
  apertarTecla: (tecla: string) => Promise<void>;
}

const guarda = globalThis as { navegadorDeTesteDoGrafite?: NavegadorDeTeste };

export function ligarNavegadorDeTeste(navegador: NavegadorDeTeste): void {
  guarda.navegadorDeTesteDoGrafite = navegador;
}

/** O navegador de teste, quando a história roda nos testes do catálogo; fora deles, nada. */
export const navegadorDeTeste = (): NavegadorDeTeste | undefined =>
  guarda.navegadorDeTesteDoGrafite;
