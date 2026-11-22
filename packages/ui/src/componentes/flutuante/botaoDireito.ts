// O botão direito com um painel do kit aberto (spec componentes-base, "Botão direito com um menu,
// uma lista ou um popover aberto"; change chat-com-chamados, decisão 15, "As respostas do usuário
// de 22/11"). Todo `PainelFlutuante` aberto entra no registro, sem prop: o menu de botão, o de
// contexto, o do dock, o submenu, as listas das seleções, das buscas e da escolha em árvore, o
// popover e os cartões das referências.
//
// Com um painel modal aberto, o React Aria deixa o resto da tela inerte, e o botão direito fora dele
// cai no corpo da página, com o menu do navegador por cima do painel. O kit fecha os painéis de fora
// do ponto no `pointerdown`, antes de o navegador escolher o alvo do `contextmenu`, que então cai
// onde o ponteiro está, como se nada estivesse aberto: no Windows, ao soltar; no Linux e no macOS,
// ao apertar. O `mousedown` do mesmo clique fica com o alvo de antes de fechar, e o foco, no corpo
// da página: no campo em que se digita, o kit põe o foco e o cursor do texto no ponto, como o
// navegador faria sem nada aberto.
import { flushSync } from 'react-dom';
import { plataformaAtual } from '../atalho/atalho.ts';

/** Um ponto nas coordenadas da janela. */
export interface PontoNaJanela {
  x: number;
  y: number;
}

/** Um painel aberto no registro. */
export interface PainelAberto {
  /** O painel na tela. */
  elemento: () => HTMLElement | null;
  /** Fecha o painel na hora. */
  fechar: () => void;
}

/** Os painéis abertos, na ordem em que abriram: o de cima é o último. */
const abertos: PainelAberto[] = [];

/**
 * O botão direito apertado com um painel aberto, até o `contextmenu` dele: se fechou algum painel, e
 * o texto selecionado ao apertar, porque no macOS o botão direito seleciona a palavra antes do
 * `contextmenu`. Cai quando o `contextmenu` chega, no `pointerdown` seguinte e numa tecla, sem
 * relógio: o Firefox manda o `contextmenu` numa tarefa à parte, e o Windows só ao soltar o botão.
 */
let clique: { fechou: boolean; trechos: Range[] } | null = null;

let ouvindo = false;

/** Os tipos do `input` em que não se digita, como a caixa de marcar e o rádio. */
const SEM_TEXTO = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/**
 * O campo em que se digita, onde o alvo está: o `textarea`, o `contenteditable` e o `input` dos
 * tipos de texto, e não a caixa de marcar nem o rádio.
 */
export function campoEmQueSeDigita(alvo: Element): HTMLElement | null {
  const campo = alvo.closest('input, textarea, [contenteditable]');
  if (campo instanceof HTMLTextAreaElement) return campo;
  if (campo instanceof HTMLInputElement) return SEM_TEXTO.has(campo.type) ? null : campo;
  if (campo instanceof HTMLElement && campo.getAttribute('contenteditable') !== 'false') {
    return campo;
  }
  return null;
}

/** Os trechos do texto selecionado na página, sem nenhum quando nada está selecionado. */
export function trechosSelecionados(): Range[] {
  const selecao = window.getSelection();
  if (!selecao || selecao.isCollapsed) return [];
  return Array.from({ length: selecao.rangeCount }, (_, posicao) =>
    selecao.getRangeAt(posicao).cloneRange(),
  );
}

/** O ponto cai no texto selecionado. */
export const noTextoSelecionado = (trechos: readonly Range[], { x, y }: PontoNaJanela) =>
  trechos.some((trecho) =>
    Array.from(trecho.getClientRects()).some(
      (caixa) => x >= caixa.left && x <= caixa.right && y >= caixa.top && y <= caixa.bottom,
    ),
  );

const noLink = (alvo: Element) => alvo.closest('a[href]') !== null;

/** O botão direito, e no macOS também o Ctrl+clique, que abre o mesmo menu. */
const doBotaoDireito = (evento: PointerEvent) =>
  evento.button === 2 || (evento.button === 0 && evento.ctrlKey && plataformaAtual() === 'mac');

/**
 * O painel tem o ponto: o alvo está nele ou, com um painel modal aberto por cima, que deixa o resto
 * inerte e manda o clique ao corpo da página, o ponto cai dentro dele.
 */
function temOPonto(painel: PainelAberto, alvo: EventTarget | null, { x, y }: PontoNaJanela) {
  const elemento = painel.elemento();
  if (!elemento) return false;
  if (alvo instanceof Node && elemento.contains(alvo)) return true;
  const caixa = elemento.getBoundingClientRect();
  return x >= caixa.left && x < caixa.right && y >= caixa.top && y < caixa.bottom;
}

/**
 * O botão direito apertado: os painéis de cima do ponto fecham já, para a tela voltar a receber o
 * ponteiro antes de o navegador escolher o alvo do `contextmenu`. O painel de cima com o ponto fica,
 * com os do grupo dele, como o menu e o submenu, e os abertos depois dele fecham, como a lista de uma
 * seleção dentro do editor de um filtro.
 */
function aoApertar(evento: PointerEvent) {
  clique = null;
  if (abertos.length === 0 || !doBotaoDireito(evento)) return;
  const ponto = { x: evento.clientX, y: evento.clientY };
  const onde = abertos.findLastIndex((painel) => temOPonto(painel, evento.target, ponto));
  const grupo = onde >= 0 ? abertos[onde]?.elemento()?.parentElement : null;
  const aFechar = abertos
    .slice(onde + 1)
    .filter((painel) => !grupo || painel.elemento()?.parentElement !== grupo)
    .reverse();
  clique = { fechou: aFechar.length > 0, trechos: trechosSelecionados() };
  if (aFechar.length === 0) return;
  flushSync(() => {
    // O que fecha junto com outro, como o submenu com o menu, já saiu do registro.
    for (const painel of aFechar) if (abertos.includes(painel)) painel.fechar();
  });
}

const aoTeclar = () => {
  clique = null;
};

/**
 * O foco e o cursor do texto no ponto do clique, ou a seleção do campo, quando o ponto cai nela,
 * como o navegador faz sem nada aberto: o "Colar" do menu dele entra ali.
 */
function focarNoPonto(campo: HTMLElement, { x, y }: PontoNaJanela) {
  campo.focus({ preventScroll: true });
  if (!(campo instanceof HTMLInputElement || campo instanceof HTMLTextAreaElement)) return;
  // O e-mail e o número não têm o cursor do texto: o `selectionStart` deles é nulo, e pôr o cursor
  // neles lança um erro. Sem o `caretPositionFromPoint` (Chrome antes do 128, Safari antes do 18.4),
  // fica só o foco.
  const { selectionStart: de, selectionEnd: ate } = campo;
  if (de === null || ate === null || typeof document.caretPositionFromPoint !== 'function') return;
  const posicao = document.caretPositionFromPoint(x, y);
  if (posicao?.offsetNode !== campo) return;
  if (de < ate && posicao.offset >= de && posicao.offset <= ate) return;
  campo.setSelectionRange(posicao.offset, posicao.offset);
}

/**
 * O `contextmenu`, depois de a tela tratá-lo: o que a tela abriu fica; no campo em que se digita,
 * no link e no texto selecionado, o menu do navegador, que ali é o útil; no resto, o kit o cancela,
 * e o clique só fecha. Sem o botão direito, como na tecla de menu solta no item com o foco, dentro
 * de um painel aberto o app fica com ele, fora do campo em que se digita e do link.
 */
function aoPedirOMenu(evento: MouseEvent) {
  const desteClique = clique;
  clique = null;
  const alvo = evento.target instanceof Element ? evento.target : null;
  if (!alvo || evento.defaultPrevented) return;
  if (!desteClique) {
    if (!abertos.some((painel) => painel.elemento()?.contains(alvo))) return;
    if (campoEmQueSeDigita(alvo) || noLink(alvo)) return;
    evento.preventDefault();
    return;
  }
  const ponto = { x: evento.clientX, y: evento.clientY };
  const campo = campoEmQueSeDigita(alvo);
  if (campo) {
    if (desteClique.fechou) focarNoPonto(campo, ponto);
    return;
  }
  if (noLink(alvo) || noTextoSelecionado(desteClique.trechos, ponto)) return;
  evento.preventDefault();
}

function ouvir() {
  if (ouvindo) return;
  ouvindo = true;
  // Na captura da janela, antes de a tela ver o aperto; o `contextmenu`, na bolha, depois dela.
  window.addEventListener('pointerdown', aoApertar, true);
  window.addEventListener('keydown', aoTeclar, true);
  window.addEventListener('contextmenu', aoPedirOMenu);
}

/** Põe o painel aberto no registro; a função devolvida o tira, quando ele fecha. */
export function registrarPainelAberto(painel: PainelAberto): () => void {
  ouvir();
  abertos.push(painel);
  return () => {
    const posicao = abertos.indexOf(painel);
    if (posicao >= 0) abertos.splice(posicao, 1);
  };
}

/** Os painéis abertos agora, para saber depois se outro abriu. */
export const paineisAbertos = (): readonly PainelAberto[] => [...abertos];

/**
 * Abriu um painel que não estava entre os de antes, como o menu que o botão direito em outra linha
 * abriu, ou o popover que a ação de um menu abriu.
 */
export const abriuOutroPainel = (antes: readonly PainelAberto[]): boolean =>
  abertos.some((painel) => !antes.includes(painel));

/** O foco está num campo em que se digita, como a caixa onde o botão direito caiu. */
export function focoNumCampo(): boolean {
  const ativo = document.activeElement;
  return ativo instanceof Element && campoEmQueSeDigita(ativo) !== null;
}
