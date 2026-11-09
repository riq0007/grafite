// A marca de segundo plano (design do F2c, decisão 13): a requisição que a tela faz sozinha, com o
// usuário sem interagir com a página há 5 min ou mais, sai com `x-grafite-segundo-plano: 1`, e a
// API não a conta como uso da sessão. Assim, uma casca abandonada sobre uma lista que se atualiza
// sozinha deixa a sessão terminar. Contam como interação o ponteiro, o teclado, o toque e a rolagem.

export const CABECALHO_DO_SEGUNDO_PLANO = 'x-grafite-segundo-plano';
/** Sem interação por este tempo, as requisições saem marcadas. */
export const TEMPO_SEM_INTERACAO = 5 * 60_000;

const INTERACOES = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel', 'scroll'];

export interface VigiaDaInteracao {
  /** Se o usuário não interage com a página há 5 min ou mais. */
  emSegundoPlano(): boolean;
  parar(): void;
}

/** Passa a contar as interações com a página, a começar de agora. */
export function vigiarInteracao(): VigiaDaInteracao {
  let ultima = Date.now();
  const aoInteragir = () => {
    ultima = Date.now();
  };
  // Na captura, para a rolagem de qualquer elemento contar, e passivo, para não atrasá-la.
  for (const tipo of INTERACOES) {
    document.addEventListener(tipo, aoInteragir, { capture: true, passive: true });
  }
  return {
    emSegundoPlano: () => Date.now() - ultima >= TEMPO_SEM_INTERACAO,
    parar() {
      for (const tipo of INTERACOES) {
        document.removeEventListener(tipo, aoInteragir, { capture: true });
      }
    },
  };
}
