import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { cursor } from '../tokens/escalas.ts';
import estilos from './CursorSuavizado.module.css';
import {
  alvoDoAbraco,
  aproximar,
  cursorVisivel,
  type FormaDoAnel,
  fatorNoTempo,
  fatorPorQuadro,
  formaDoAbraco,
  formaRedonda,
  pedeCursorDoSistema,
} from './cursor.ts';
import { usePostura } from './postura.ts';

export interface PropsDoCursorSuavizado {
  tipo: 'suavizado' | 'sistema';
  /** De 0 a 100%: quanto o anel demora a alcançar o ponto. */
  suavizacao: number;
  abracar: boolean;
  /** Movimento reduzido pedido nos Ajustes; o do sistema operacional o componente lê sozinho. */
  movimentoReduzido?: boolean;
}

const MOVIMENTO_REDUZIDO = '(prefers-reduced-motion: reduce)';

function useSistemaReduzMovimento(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const lista = matchMedia(MOVIMENTO_REDUZIDO);
      lista.addEventListener('change', avisar);
      return () => lista.removeEventListener('change', avisar);
    },
    () => matchMedia(MOVIMENTO_REDUZIDO).matches,
  );
}

/**
 * Cursor suavizado (spec cursor-suavizado; design do F1b, decisão 5): um ponto que segue o mouse
 * e um anel que o acompanha, suavizado, e abraça os elementos interativos compactos. Só existe no
 * computador, sem movimento reduzido e com a preferência "Suavizado"; nos outros casos, nada é
 * montado e vale o cursor do sistema.
 */
export function CursorSuavizado({
  tipo,
  suavizacao,
  abracar,
  movimentoReduzido = false,
}: PropsDoCursorSuavizado) {
  const postura = usePostura();
  const sistemaReduz = useSistemaReduzMovimento();
  const ativo =
    tipo === 'suavizado' && !movimentoReduzido && !sistemaReduz && postura === 'computador';
  if (!ativo) return null;
  return createPortal(<Camada suavizacao={suavizacao} abracar={abracar} />, document.body);
}

type TipoDePonteiro = 'mouse' | 'touch' | 'pen' | null;

const tipoDoPonteiro = (evento: PointerEvent): TipoDePonteiro =>
  evento.pointerType === 'touch' || evento.pointerType === 'pen' ? evento.pointerType : 'mouse';

/** Diferença abaixo da qual o anel já chegou e o laço para. */
const CHEGADA = 0.1;

const chegou = (a: FormaDoAnel, b: FormaDoAnel) =>
  Math.abs(a.x - b.x) < CHEGADA &&
  Math.abs(a.y - b.y) < CHEGADA &&
  Math.abs(a.largura - b.largura) < CHEGADA &&
  Math.abs(a.altura - b.altura) < CHEGADA &&
  Math.abs(a.raio - b.raio) < CHEGADA;

/**
 * O ponto e o anel, fora do React: os eventos do ponteiro e um laço por quadro escrevem a posição
 * por referência. O laço só roda enquanto o anel não alcançou o alvo.
 */
function Camada({ suavizacao, abracar }: { suavizacao: number; abracar: boolean }) {
  const ponto = useRef<HTMLDivElement>(null);
  const anel = useRef<HTMLDivElement>(null);
  const opcoes = useRef({ suavizacao, abracar });
  opcoes.current = { suavizacao, abracar };

  useEffect(() => {
    const raiz = document.documentElement;
    let x = 0;
    let y = 0;
    let ultimoPonteiro: TipoDePonteiro = null;
    let dentroDaJanela = false;
    let sobreCursorDoSistema = false;
    let alvo: HTMLElement | null = null;
    let forma: FormaDoAnel | null = null;
    let quadro = 0;
    let ultimoQuadro = 0;
    /** O quadro pedido depois de um clique, para olhar de novo o que está sob o ponteiro. */
    let reavaliacao = 0;
    /** Depois de desmontado, nada mais mexe no <html>: o cursor do sistema fica de volta. */
    let desmontado = false;

    const visivel = () =>
      cursorVisivel({
        tipo: 'suavizado',
        movimentoReduzido: false,
        postura: 'computador',
        ultimoPonteiro,
        dentroDaJanela,
        pedeCursorDoSistema: sobreCursorDoSistema,
      });

    /** O atributo no <html> esconde o cursor do sistema: só existe com o cursor à vista. */
    const aplicarVisibilidade = () => {
      if (desmontado) return;
      const aVista = visivel();
      ponto.current?.toggleAttribute('data-visivel', aVista && !alvo);
      anel.current?.toggleAttribute('data-visivel', aVista);
      anel.current?.toggleAttribute('data-abracando', aVista && alvo !== null);
      raiz.toggleAttribute('data-cursor-suavizado', aVista);
    };

    const formaDoAlvo = (): FormaDoAnel => {
      if (!alvo?.isConnected) {
        alvo = null;
        return formaRedonda(x, y);
      }
      const raio = Number.parseFloat(getComputedStyle(alvo).borderTopLeftRadius) || 0;
      return formaDoAbraco(alvo.getBoundingClientRect(), raio);
    };

    const escreverAnel = ({ x: cx, y: cy, largura, altura, raio }: FormaDoAnel) => {
      const elemento = anel.current;
      if (!elemento) return;
      elemento.style.transform = `translate3d(${cx - largura / 2}px, ${cy - altura / 2}px, 0)`;
      elemento.style.width = `${largura}px`;
      elemento.style.height = `${altura}px`;
      elemento.style.borderRadius = `${raio}px`;
    };

    const passo = (agora: number) => {
      quadro = 0;
      try {
        const duracao = ultimoQuadro ? agora - ultimoQuadro : cursor.quadroDeReferencia;
        ultimoQuadro = agora;
        const destino = formaDoAlvo();
        const atual = forma ?? destino;
        const fator = fatorNoTempo(fatorPorQuadro(opcoes.current.suavizacao), duracao);
        const proxima: FormaDoAnel = {
          x: aproximar(atual.x, destino.x, fator),
          y: aproximar(atual.y, destino.y, fator),
          largura: aproximar(atual.largura, destino.largura, fator),
          altura: aproximar(atual.altura, destino.altura, fator),
          raio: aproximar(atual.raio, destino.raio, fator),
        };
        forma = chegou(proxima, destino) ? destino : proxima;
        escreverAnel(forma);
        if (forma === destino) ultimoQuadro = 0;
        else quadro = requestAnimationFrame(passo);
      } catch (erro) {
        // Nunca deixa a tela sem cursor: com o laço parado, volta o do sistema.
        raiz.removeAttribute('data-cursor-suavizado');
        throw erro;
      }
    };

    const pedirQuadro = () => {
      if (!quadro) quadro = requestAnimationFrame(passo);
    };

    const olharO = (sob: Element | null) => {
      sobreCursorDoSistema = pedeCursorDoSistema(sob);
      alvo = opcoes.current.abracar ? alvoDoAbraco(sob) : null;
    };

    const aoMover = (evento: PointerEvent) => {
      ultimoPonteiro = tipoDoPonteiro(evento);
      dentroDaJanela = true;
      x = evento.clientX;
      y = evento.clientY;
      olharO(evento.target instanceof Element ? evento.target : null);
      if (ponto.current) {
        ponto.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      }
      aplicarVisibilidade();
      if (visivel()) pedirQuadro();
    };

    const aoPressionar = (evento: PointerEvent) => {
      ultimoPonteiro = tipoDoPonteiro(evento);
      aplicarVisibilidade();
    };

    const aoSair = (evento: PointerEvent) => {
      if (evento.relatedTarget) return;
      dentroDaJanela = false;
      aplicarVisibilidade();
    };

    /**
     * Rolar ou clicar muda o que está sob o ponteiro parado: o elemento abraçado pode rolar para
     * longe, ou sumir com o clique (um menu que fecha, um botão que sai).
     */
    const reavaliar = () => {
      if (!dentroDaJanela || desmontado) return;
      olharO(document.elementFromPoint(x, y));
      aplicarVisibilidade();
      if (visivel()) pedirQuadro();
    };
    const aoClicar = () => {
      cancelAnimationFrame(reavaliacao);
      reavaliacao = requestAnimationFrame(reavaliar);
    };

    document.addEventListener('pointermove', aoMover, { capture: true, passive: true });
    document.addEventListener('pointerdown', aoPressionar, { capture: true, passive: true });
    document.addEventListener('pointerout', aoSair, { capture: true, passive: true });
    document.addEventListener('click', aoClicar, { capture: true, passive: true });
    window.addEventListener('scroll', reavaliar, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointermove', aoMover, { capture: true });
      document.removeEventListener('pointerdown', aoPressionar, { capture: true });
      document.removeEventListener('pointerout', aoSair, { capture: true });
      document.removeEventListener('click', aoClicar, { capture: true });
      window.removeEventListener('scroll', reavaliar, { capture: true });
      cancelAnimationFrame(quadro);
      // Um clique que troca para "Do sistema" desmonta o cursor com esta reavaliação pedida.
      cancelAnimationFrame(reavaliacao);
      desmontado = true;
      raiz.removeAttribute('data-cursor-suavizado');
    };
  }, []);

  return (
    <div aria-hidden="true" className={estilos.camada}>
      <div ref={anel} data-cursor="anel" className={estilos.anel} />
      <div ref={ponto} data-cursor="ponto" className={estilos.ponto} />
    </div>
  );
}
