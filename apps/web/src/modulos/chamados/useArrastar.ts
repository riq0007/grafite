// O arrastar das listas e das colunas dos chamados (change chamados-da-ti, design, decisão 15):
// os tipos, os campos, as respostas prontas e as colunas de "Quem está com o quê", com os eventos de
// ponteiro e sem biblioteca. O teclado tem a alternativa em cada tela, no menu do item.
import {
  type DragEvent,
  type PointerEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

/** Quanto o ponteiro anda antes de o arraste começar, para o clique seguir sendo clique. */
const LIMIAR_PX = 4;

/** O alvo sob o ponteiro: a chave dele e a metade em que o ponteiro está, o encaixe numa lista. */
export interface AlvoDoArraste {
  chave: string;
  metade: 'antes' | 'depois';
}

/** O arraste em curso. */
export interface Arraste<T> {
  item: T;
  /** O ponteiro, na janela. */
  x: number;
  y: number;
  /** Quanto o ponteiro andou desde o aperto. */
  dx: number;
  dy: number;
  /** O alvo deste arraste sob o ponteiro, ou nenhum. */
  alvo: AlvoDoArraste | null;
  /** Se o alvo sob o ponteiro recebe o item; fora de um alvo, não. */
  recebe: boolean;
}

export interface OpcoesDoArraste<T> {
  /**
   * Se o alvo recebe o item, como a coluna de quem atende os locais do chamado; sem ela, todo alvo
   * recebe.
   */
  recebe?: (item: T, chave: string) => boolean;
  /** O item solto num alvo que o recebe. */
  aoSoltar: (item: T, alvo: AlvoDoArraste) => void;
}

/** O aperto em curso, do `pointerdown` até soltar. */
interface Aperto<T> {
  item: T;
  ponteiro: number;
  x: number;
  y: number;
  /** Passou do limiar: o clique que vier logo depois de soltar não chega a ninguém. */
  comecou: boolean;
  /** Cancelado pelo Esc: espera soltar, sem soltar no alvo. */
  cancelado: boolean;
}

/** O alvo deste arraste sob o ponteiro, subindo do elemento que está nele. */
function alvoNoPonto(id: string, x: number, y: number): AlvoDoArraste | null {
  const elemento = document.elementFromPoint(x, y)?.closest<HTMLElement>(`[data-alvo-de="${id}"]`);
  if (!elemento) return null;
  const caixa = elemento.getBoundingClientRect();
  return {
    chave: elemento.dataset.alvo ?? '',
    metade: y < caixa.top + caixa.height / 2 ? 'antes' : 'depois',
  };
}

/**
 * O arrastar com o ponteiro: o `alca(item)` vai no que se arrasta, e o `alvo(chave)`, em cada lugar
 * que recebe. Os ouvintes ficam na janela do aperto até soltar, sem a captura do ponteiro, que
 * mandaria o clique ao item, e não aos botões de dentro dele; sem ela, a soltura pode se perder, e o
 * movimento sem o botão e a janela sem o foco acabam o aperto. O quadrado no ar fica com
 * `pointer-events: none`, para não tapar o alvo, e o `touch-action` e o cursor são do CSS da tela.
 */
export function useArrastar<T>(opcoes: OpcoesDoArraste<T>) {
  const id = useId();
  const [arraste, definirArraste] = useState<Arraste<T> | null>(null);
  const atuais = useRef(opcoes);
  const aperto = useRef<Aperto<T> | null>(null);
  const tirarOuvintes = useRef<(() => void) | null>(null);
  const pararDeEngolir = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    atuais.current = opcoes;
  });
  useEffect(() => () => tirarOuvintes.current?.(), []);

  const recebe = (item: T, alvo: AlvoDoArraste | null) =>
    alvo !== null && (atuais.current.recebe?.(item, alvo.chave) ?? true);

  /**
   * O clique que o navegador manda logo depois de soltar não chega a ninguém: nem ao item, nem a um
   * botão dele, nem ao quadro, que o recebe quando a soltura cai fora do item. O ouvinte é da janela,
   * na captura, e sai no primeiro clique, no fim da tarefa ou no aperto seguinte; o clique de
   * teclado, que vem depois, chega.
   */
  const engolirOClique = () => {
    const engolir = (evento: MouseEvent) => {
      evento.preventDefault();
      evento.stopPropagation();
      parar();
    };
    const parar = () => {
      window.removeEventListener('click', engolir, true);
      clearTimeout(tempo);
      if (pararDeEngolir.current === parar) pararDeEngolir.current = null;
    };
    window.addEventListener('click', engolir, true);
    const tempo = setTimeout(parar, 0);
    pararDeEngolir.current = parar;
  };

  const acabar = (atual: Aperto<T>) => {
    tirarOuvintes.current?.();
    definirArraste(null);
    if (atual.comecou) engolirOClique();
  };

  const aoMover = (evento: globalThis.PointerEvent) => {
    const atual = aperto.current;
    if (!atual || evento.pointerId !== atual.ponteiro) return;
    // Sem o botão principal, a soltura se perdeu (o Alt+Tab, um diálogo, o menu do botão direito): o
    // aperto acaba ali, sem soltar, também no arraste cancelado pelo Esc.
    if ((evento.buttons & 1) === 0) {
      acabar(atual);
      return;
    }
    if (atual.cancelado) return;
    const dx = evento.clientX - atual.x;
    const dy = evento.clientY - atual.y;
    if (!atual.comecou && Math.hypot(dx, dy) < LIMIAR_PX) return;
    atual.comecou = true;
    const alvo = alvoNoPonto(id, evento.clientX, evento.clientY);
    definirArraste({
      item: atual.item,
      x: evento.clientX,
      y: evento.clientY,
      dx,
      dy,
      alvo,
      recebe: recebe(atual.item, alvo),
    });
  };

  const aoSoltarOPonteiro = (evento: globalThis.PointerEvent) => {
    const atual = aperto.current;
    if (!atual || evento.pointerId !== atual.ponteiro) return;
    acabar(atual);
    if (!atual.comecou || atual.cancelado) return;
    const alvo = alvoNoPonto(id, evento.clientX, evento.clientY);
    if (alvo && recebe(atual.item, alvo)) atuais.current.aoSoltar(atual.item, alvo);
  };

  const aoCancelarOPonteiro = (evento: globalThis.PointerEvent) => {
    const atual = aperto.current;
    if (atual && evento.pointerId === atual.ponteiro) acabar(atual);
  };

  // A janela que perde o foco quase sempre perde a soltura: o aperto acaba, sem soltar.
  const aoPerderOFoco = () => {
    const atual = aperto.current;
    if (atual) acabar(atual);
  };

  const aoTeclar = (evento: KeyboardEvent) => {
    const atual = aperto.current;
    if (evento.key !== 'Escape' || !atual?.comecou || atual.cancelado) return;
    // A janela pega o Esc primeiro: ele cancela o arraste e não fecha a prévia nem o painel de trás.
    evento.preventDefault();
    evento.stopPropagation();
    atual.cancelado = true;
    definirArraste(null);
  };

  const alca = (item: T) => ({
    onPointerDown(evento: PointerEvent<HTMLElement>) {
      if (evento.button !== 0 || aperto.current) return;
      aperto.current = {
        item,
        ponteiro: evento.pointerId,
        x: evento.clientX,
        y: evento.clientY,
        comecou: false,
        cancelado: false,
      };
      pararDeEngolir.current?.();
      window.addEventListener('pointermove', aoMover);
      window.addEventListener('pointerup', aoSoltarOPonteiro);
      window.addEventListener('pointercancel', aoCancelarOPonteiro);
      window.addEventListener('keydown', aoTeclar, true);
      window.addEventListener('blur', aoPerderOFoco);
      tirarOuvintes.current = () => {
        window.removeEventListener('pointermove', aoMover);
        window.removeEventListener('pointerup', aoSoltarOPonteiro);
        window.removeEventListener('pointercancel', aoCancelarOPonteiro);
        window.removeEventListener('keydown', aoTeclar, true);
        window.removeEventListener('blur', aoPerderOFoco);
        aperto.current = null;
        tirarOuvintes.current = null;
      };
    },
    // O arrastar do navegador, o de um link ou de uma imagem dentro do item, cancelaria o ponteiro.
    onDragStart(evento: DragEvent<HTMLElement>) {
      evento.preventDefault();
    },
  });

  const alvo = (chave: string) => ({ 'data-alvo-de': id, 'data-alvo': chave });

  return { arraste, alca, alvo };
}
