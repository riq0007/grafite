// O foco na chegada à janela do Chat, vindo de outro módulo da casca (change chat-com-chamados,
// design, decisão 15): a janela não tem o título da janela, e a casca leva o foco ao título de
// chegada da tela, o do item escolhido, como o nome da conversa, ou o da lista. O título do item que
// aparece depois, como o da conversa que acabou de carregar, o recebe. Fica no chat, e não na casca,
// porque a entrada do app do chat não chega à casca; nele, nada chega de outro módulo, e o título
// fica sem efeito.

const TITULO_DO_ITEM = '[data-titulo-de-chegada="item"]';

/**
 * A chegada que ainda espera o título do item, como a do "Abrir" de uma notificação numa conversa
 * que carrega: o elemento com o foco quando a casca a tratou. A navegação seguinte a desfaz.
 */
let chegadaPendente: { foco: Element | null } | null = null;

/** Leva o foco ao título do item ou, enquanto ele não aparece, ao da lista. */
export function focarNaChegada() {
  const doItem = document.querySelector<HTMLElement>(TITULO_DO_ITEM);
  (doItem ?? document.querySelector<HTMLElement>('[data-titulo-de-chegada]'))?.focus();
  chegadaPendente = doItem ? null : { foco: document.activeElement };
}

/** Desfaz a chegada que espera o título do item: a casca a chama a cada navegação. */
export function esquecerAChegada() {
  chegadaPendente = null;
}

/**
 * O foco está fora da janela do Chat e fora de um diálogo ou de um menu aberto: ele voltou, por
 * exemplo, ao sino da casca quando a central de notificações saiu, e a conta ainda não chegou.
 */
function foraDaJanela(ativo: Element | null, titulo: HTMLElement) {
  const janela = titulo.closest('[data-na-casca]');
  return (
    ativo !== null &&
    janela !== null &&
    !janela.contains(ativo) &&
    ativo.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]') === null
  );
}

/**
 * O `ref` do título do item: quando ele aparece depois da chegada, recebe o foco, se ele não saiu
 * de onde a casca o deixou ou se está fora da janela (`foraDaJanela`). No celular, a lista atrás do
 * item é inerte e não o recebe: o foco ficou onde estava ou caiu no corpo da página.
 */
export function focarAoChegar(titulo: HTMLElement | null) {
  if (!titulo || !chegadaPendente) return;
  const { foco } = chegadaPendente;
  chegadaPendente = null;
  const ativo = document.activeElement;
  if (ativo === foco || ativo === document.body || foraDaJanela(ativo, titulo)) titulo.focus();
}
