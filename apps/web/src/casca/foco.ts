// O foco pelo endereço (design do F1b, decisão 4): o `foco` da busca leva ao elemento marcado com
// `data-foco`. A casca o aplica a cada navegação; uma seção que só desenha a parte depois de ler o
// servidor, como a Conta, aplica de novo quando a parte aparece.
import { esquecerAChegada, focarNaChegada } from '../chat/focoNaChegada.ts';

/**
 * A parada de Tab dentro de um elemento marcado com `data-foco`: num grupo de rádios, a opção
 * escolhida, que é a única sem `tabindex="-1"`.
 */
const FOCAVEL = ':is(input, button, select, textarea, [tabindex]):not([tabindex="-1"], :disabled)';

/**
 * Leva o foco ao elemento marcado com o `foco` do endereço (ou ao primeiro focável dentro dele);
 * sem ele, ao título do conteúdo. Na chegada de outro módulo, a janela sem o título da janela, como
 * a do Chat, recebe o foco no título de chegada (change chat-com-chamados, design, decisão 15);
 * dentro dela, trocar de tela deixa o foco onde estava, como no app do chat.
 */
export function focarDestino(foco: string | undefined, { chegada = false } = {}) {
  esquecerAChegada();
  const marcado = foco ? document.querySelector<HTMLElement>(`[data-foco="${foco}"]`) : null;
  const alvo = marcado?.matches(FOCAVEL) ? marcado : marcado?.querySelector<HTMLElement>(FOCAVEL);
  const titulo = document.querySelector<HTMLElement>('[data-titulo-da-janela]');
  if (alvo || titulo || !chegada) (alvo ?? titulo)?.focus();
  else focarNaChegada();
}
