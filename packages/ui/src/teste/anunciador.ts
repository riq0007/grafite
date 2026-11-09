// Utilitário de teste do catálogo: o anunciador do React Aria guarda cada mensagem por 7 s, e uma
// mensagem pode apontar (aria-labelledby) para um elemento que já saiu da tela. O leitor de tela
// já a leu quando ela entrou; o que sobra só confunde a checagem de acessibilidade.

/** Esvazia o anunciador do React Aria. */
export function esvaziarOAnunciador() {
  for (const log of document.querySelectorAll('[data-live-announcer] [role="log"]')) {
    log.replaceChildren();
  }
}
