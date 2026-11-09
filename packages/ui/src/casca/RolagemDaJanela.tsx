import {
  type ReactNode,
  type Ref,
  type RefObject,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import estilos from './RolagemDaJanela.module.css';

export interface PropsDaRolagemDaJanela {
  children: ReactNode;
  /** A barra das abas está acima da área: o título com `ocultarComAbas` sai da vista. */
  comBarra?: boolean;
  /** O elemento que rola, para quem guarda a posição da rolagem, como as abas da janela. */
  ref?: Ref<HTMLDivElement>;
}

/**
 * A área da janela que rola, abaixo da barra das abas (change janela-rolavel-e-campos-em-colunas).
 * Perto da borda de cima e da de baixo, o conteúdo esmaece enquanto há mais além dela; a barra de
 * rolagem fica fora do esmaecimento, e o elemento que recebe o foco rola para fora da faixa. Ela
 * recebe o foco do "Ir para o conteúdo" e, como o Chrome faz com as áreas que rolam, entra na ordem
 * do Tab só quando rola sem nada focável dentro, para o teclado alcançar o conteúdo.
 */
export function RolagemDaJanela({ children, comBarra, ref }: PropsDaRolagemDaJanela) {
  const area = useRef<HTMLDivElement>(null);
  // O elemento já existe quando o React cria o acesso a ele, na fase do layout.
  useImperativeHandle(ref, () => area.current as HTMLDivElement, []);
  useBordasDaRolagem(area);
  return (
    <div
      ref={area}
      className={estilos.rolagem}
      data-rolagem-da-janela=""
      data-com-barra={comBarra || undefined}
      tabIndex={-1}
    >
      <div>{children}</div>
    </div>
  );
}

const medida = (valor: string) => Number.parseFloat(valor) || 0;

/** O que o Tab alcança: os controles habilitados e o que entrou na ordem pelo `tabindex`. */
const FOCAVEIS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** Se o Tab alcança algo dentro da área, fora dos painéis escondidos das abas de trás. */
function temFocavel(area: HTMLElement) {
  for (const elemento of area.querySelectorAll<HTMLElement>(FOCAVEIS)) {
    if (!elemento.closest('[inert], [hidden]')) return true;
  }
  return false;
}

/**
 * Marca na área se há conteúdo além da borda de cima (`data-mais-acima`) e da de baixo
 * (`data-mais-abaixo`), e passa a largura da barra de rolagem em `--largura-da-barra`. Mede de novo
 * ao rolar e quando a área ou o conteúdo mudam de tamanho, como na troca de etapa; nessa hora,
 * também decide se a área entra na ordem do Tab. As marcas vão direto no elemento, sem desenhar o
 * React de novo a cada rolagem.
 */
function useBordasDaRolagem(referencia: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const area = referencia.current;
    if (!area) return;
    let quadro = 0;
    let comOrdem = true;
    const medir = () => {
      quadro = 0;
      if (comOrdem) {
        comOrdem = false;
        const rola = area.scrollHeight > area.clientHeight + 1;
        area.tabIndex = rola && !temFocavel(area) ? 0 : -1;
      }
      const estilo = getComputedStyle(area);
      const barra =
        area.offsetWidth -
        area.clientWidth -
        medida(estilo.borderLeftWidth) -
        medida(estilo.borderRightWidth);
      area.style.setProperty('--largura-da-barra', `${Math.max(0, barra)}px`);
      marcar(area, 'data-mais-acima', area.scrollTop > 1);
      marcar(area, 'data-mais-abaixo', area.scrollTop + area.clientHeight < area.scrollHeight - 1);
    };
    const pedirMedida = () => {
      if (!quadro) quadro = requestAnimationFrame(medir);
    };
    const aoMudarDeTamanho = () => {
      comOrdem = true;
      pedirMedida();
    };
    // Depois de o navegador rolar até o elemento que recebeu o foco, a área tira o elemento da faixa.
    const aoFocar = (evento: FocusEvent) => {
      const alvo = evento.target;
      if (alvo instanceof HTMLElement && alvo !== area) {
        requestAnimationFrame(() => tirarDaFaixa(area, alvo));
      }
    };
    medir();
    area.addEventListener('scroll', pedirMedida, { passive: true });
    area.addEventListener('focusin', aoFocar);
    const observador = new ResizeObserver(aoMudarDeTamanho);
    observador.observe(area);
    if (area.firstElementChild) observador.observe(area.firstElementChild);
    return () => {
      cancelAnimationFrame(quadro);
      area.removeEventListener('scroll', pedirMedida);
      area.removeEventListener('focusin', aoFocar);
      observador.disconnect();
    };
  }, [referencia]);
}

function marcar(area: HTMLElement, atributo: string, ligado: boolean) {
  if (ligado) area.setAttribute(atributo, '');
  else area.removeAttribute(atributo);
}

/**
 * Rola a área o necessário para o elemento ficar entre as faixas esmaecidas. O elemento mais alto
 * que o espaço entre elas fica com o topo logo abaixo da faixa de cima.
 */
function tirarDaFaixa(area: HTMLElement, alvo: HTMLElement) {
  if (!alvo.isConnected || !area.contains(alvo)) return;
  const estilo = getComputedStyle(area);
  const topoDaArea = area.getBoundingClientRect().top + area.clientTop;
  const comeco = topoDaArea + medida(estilo.getPropertyValue('--faixa-de-cima-da-janela'));
  const fim =
    topoDaArea + area.clientHeight - medida(estilo.getPropertyValue('--faixa-de-baixo-da-janela'));
  const caixa = alvo.getBoundingClientRect();
  if (caixa.top < comeco || caixa.height > fim - comeco) {
    area.scrollTop -= comeco - caixa.top;
  } else if (caixa.bottom > fim) {
    area.scrollTop += caixa.bottom - fim;
  }
}
