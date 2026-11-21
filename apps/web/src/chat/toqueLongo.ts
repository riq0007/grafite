// O toque longo numa mensagem (spec modulo-chat, "Chat no celular"; change chat-com-chamados, design,
// decisão 15, "O celular"): tocar e segurar meio segundo, sem mexer o dedo, abre a folha da
// mensagem, em qualquer aparelho de toque. O dedo que anda é a rolagem, e o toque curto é o de
// sempre. Os controles da mensagem, como os links, as reações e o chip do chamado, ficam com o toque
// deles. O menu do navegador, que o Android abre no toque longo, dá lugar à folha; e o que o toque
// ainda traz depois de a folha abrir, como o clique ao soltar o dedo, não age em lugar nenhum.
import { type MouseEvent, type PointerEvent, useEffect, useLayoutEffect, useRef } from 'react';

/** O tempo, em ms, de tocar e segurar. */
export const TEMPO_DO_TOQUE_LONGO = 500;

/** O quanto o dedo pode andar, em px, sem o toque virar a rolagem. */
const FOLGA_DO_TOQUE = 10;

/** Depois de o dedo sair, o que chega até este tempo, em ms, ainda é do toque longo. */
const DEPOIS_DO_DEDO = 400;

/** Os controles dentro da mensagem, que ficam com o toque deles. */
const CONTROLES = 'a, button, input, textarea, select, [role="button"]';

/** O que o toque longo ainda traz depois de a folha abrir. */
const RESTO_DO_TOQUE = ['click', 'contextmenu', 'selectstart'] as const;

interface ToqueEmCurso {
  ponteiro: number;
  x: number;
  y: number;
  mensagem: HTMLElement;
  espera: number;
}

/**
 * Cala, na página inteira, o resto do toque longo: o clique que o navegador manda ao soltar o dedo,
 * quando o toque longo dele demora mais que o nosso, e que cairia na folha ou no véu, sob o dedo; o
 * menu do navegador; e a seleção do texto. Vale até logo depois de o dedo sair, ou até outro toque
 * começar. Devolve o que solta antes, para quando a tela sai.
 */
function calarOResto(ponteiro: number): () => void {
  let espera = 0;
  const calar = (evento: Event) => {
    evento.preventDefault();
    evento.stopPropagation();
  };
  const soltar = () => {
    window.clearTimeout(espera);
    for (const tipo of RESTO_DO_TOQUE) document.removeEventListener(tipo, calar, true);
    document.removeEventListener('pointerdown', aoOutroToque, true);
    document.removeEventListener('pointerup', aoSairODedo, true);
    document.removeEventListener('pointercancel', aoSairODedo, true);
  };
  function aoOutroToque(evento: globalThis.PointerEvent) {
    if (evento.pointerId !== ponteiro) soltar();
  }
  function aoSairODedo(evento: globalThis.PointerEvent) {
    if (evento.pointerId !== ponteiro) return;
    window.clearTimeout(espera);
    espera = window.setTimeout(soltar, DEPOIS_DO_DEDO);
  }
  for (const tipo of RESTO_DO_TOQUE) document.addEventListener(tipo, calar, true);
  document.addEventListener('pointerdown', aoOutroToque, true);
  document.addEventListener('pointerup', aoSairODedo, true);
  document.addEventListener('pointercancel', aoSairODedo, true);
  return soltar;
}

/**
 * Os ouvintes do toque longo, para a lista das mensagens: `aoSegurar` recebe a mensagem escrita
 * tocada, a com `data-escrita`.
 */
export function useToqueLongo(aoSegurar: (mensagem: HTMLElement) => void) {
  const toque = useRef<ToqueEmCurso | null>(null);
  const soltarOResto = useRef<(() => void) | null>(null);
  const ultimo = useRef(aoSegurar);
  useLayoutEffect(() => {
    ultimo.current = aoSegurar;
  });
  const parar = () => {
    if (toque.current) window.clearTimeout(toque.current.espera);
    toque.current = null;
  };
  // A espera e o que cala o resto do toque não passam da tela: saem com ela.
  useEffect(
    () => () => {
      if (toque.current) window.clearTimeout(toque.current.espera);
      soltarOResto.current?.();
    },
    [],
  );
  const segurar = ({ ponteiro, mensagem }: ToqueEmCurso) => {
    parar();
    soltarOResto.current?.();
    soltarOResto.current = calarOResto(ponteiro);
    ultimo.current(mensagem);
  };

  return {
    onPointerDown: (evento: PointerEvent<HTMLElement>) => {
      parar();
      if (evento.pointerType !== 'touch' || !evento.isPrimary) return;
      const alvo = evento.target;
      if (!(alvo instanceof Element)) return;
      const mensagem = alvo.closest<HTMLElement>('[data-escrita]');
      if (!mensagem || !evento.currentTarget.contains(mensagem)) return;
      const controle = alvo.closest(CONTROLES);
      if (controle && mensagem.contains(controle)) return;
      const atual: ToqueEmCurso = {
        ponteiro: evento.pointerId,
        x: evento.clientX,
        y: evento.clientY,
        mensagem,
        espera: 0,
      };
      atual.espera = window.setTimeout(() => segurar(atual), TEMPO_DO_TOQUE_LONGO);
      toque.current = atual;
    },
    onPointerMove: (evento: PointerEvent<HTMLElement>) => {
      const atual = toque.current;
      if (!atual || evento.pointerId !== atual.ponteiro) return;
      if (Math.hypot(evento.clientX - atual.x, evento.clientY - atual.y) > FOLGA_DO_TOQUE) parar();
    },
    onPointerUp: parar,
    onPointerCancel: parar,
    // No Android, o menu do navegador chega antes do nosso tempo: a folha abre com ele, no lugar dele.
    onContextMenu: (evento: MouseEvent<HTMLElement>) => {
      const atual = toque.current;
      if (!atual) return;
      evento.preventDefault();
      segurar(atual);
    },
  };
}
