// O foco pelo endereço (design do F1b, decisão 4): o `foco` da busca leva ao elemento marcado com
// `data-foco`. A casca o aplica a cada navegação; uma seção que só desenha a parte depois de ler o
// servidor, como a Conta, aplica de novo quando a parte aparece.

/**
 * A parada de Tab dentro de um elemento marcado com `data-foco`: num grupo de rádios, a opção
 * escolhida, que é a única sem `tabindex="-1"`.
 */
const FOCAVEL = ':is(input, button, select, textarea, [tabindex]):not([tabindex="-1"], :disabled)';

/**
 * Leva o foco ao elemento marcado com o `foco` do endereço (ou ao primeiro focável dentro dele);
 * sem ele, ao título do conteúdo.
 */
export function focarDestino(foco: string | undefined) {
  const marcado = foco ? document.querySelector<HTMLElement>(`[data-foco="${foco}"]`) : null;
  const alvo = marcado?.matches(FOCAVEL) ? marcado : marcado?.querySelector<HTMLElement>(FOCAVEL);
  (alvo ?? document.querySelector<HTMLElement>('[data-titulo-da-janela]'))?.focus();
}
