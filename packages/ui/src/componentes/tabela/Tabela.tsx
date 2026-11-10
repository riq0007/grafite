import { ChevronDown, ChevronsUpDown, ChevronUp, Ellipsis } from 'lucide-react';
import {
  createContext,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Cell,
  Collection,
  Column,
  type ColumnProps,
  ColumnResizer,
  type Key,
  ResizableTableContainer,
  Row,
  type RowProps,
  type Selection,
  type SortDescriptor,
  type SortDirection,
  Table,
  TableBody,
  TableColumnResizeStateContext,
  TableHeader,
  TableLayout,
  TableLoadMoreItem,
  TableStateContext,
  Virtualizer,
} from 'react-aria-components';
import { BotaoDeIcone, Icone } from '../../icones/Icone.tsx';
import { Botao } from '../botao/Botao.tsx';
import { Esqueleto } from '../exibicao/Esqueleto.tsx';
import { ItemDeMenu, Menu } from '../menu/Menu.tsx';
import { type ItemDoMenuDeContexto, MenuDeContexto } from '../menu/MenuDeContexto.tsx';
import { PEDIDO_DE_FOCO_DA_LINHA } from './pedidoDeFoco.ts';
import { type ItemDoResumo, type PosicaoDoResumo, ResumoDaLinha } from './ResumoDaLinha.tsx';
import { colunasComConteudoCortado, colunasForaDaArea, relogioDoResumo } from './resumo.ts';
import estilos from './Tabela.module.css';

/** Os limites da largura de uma coluna redimensionável, em px. */
export const LIMITES_DA_LARGURA = { minima: 64, maxima: 800 } as const;

/**
 * A coluna sem uma largura dada, na tabela redimensionável, divide a sobra da área com as outras, e
 * a principal fica com o dobro (change redesenho-da-interface, design, decisão 2). Na divisão, ela
 * não fica mais estreita que 120 px.
 */
const FRACAO = { principal: '2fr', outra: '1fr' } as const;
const MINIMA_NA_DIVISAO = 120;

export type DirecaoDaOrdenacao = 'crescente' | 'decrescente';

export interface Ordenacao {
  coluna: string;
  direcao: DirecaoDaOrdenacao;
}

const paraReactAria = (ordenacao?: Ordenacao): SortDescriptor | undefined =>
  ordenacao && {
    column: ordenacao.coluna,
    direction: ordenacao.direcao === 'crescente' ? 'ascending' : 'descending',
  };

const deReactAria = (descritor: SortDescriptor): Ordenacao => ({
  coluna: String(descritor.column),
  direcao: descritor.direction === 'ascending' ? 'crescente' : 'decrescente',
});

/** O fim de uma lista paginada: o botão que pede a próxima página. */
export interface CarregarMais {
  /** Há registros além dos que estão na tabela. */
  haMais: boolean;
  /** A próxima página está a caminho. */
  carregando: boolean;
  aoCarregar: () => void;
  /** O texto do botão: "Carregar mais", se não for dado. */
  rotulo?: string;
}

export interface PropsDaTabela {
  /** Nome da tabela para o leitor de tela. */
  rotulo: string;
  ordenacao?: Ordenacao;
  aoOrdenar?: (ordenacao: Ordenacao) => void;
  /** Com altura máxima, a tabela rola por dentro e o cabeçalho fica fixo. */
  alturaMaxima?: string;
  /** Abre o registro da linha: clique na linha, fora dos controles dela, ou Enter. */
  aoAbrirLinha?: (chave: string) => void;
  /** Pede a prévia do registro da linha em foco: a barra de espaço. */
  aoPreverLinha?: (chave: string) => void;
  /** Na lista paginada, "Carregar mais" logo depois da tabela, enquanto houver mais registros. */
  carregarMais?: CarregarMais;
  /**
   * As colunas mudam de largura pela borda do cabeçalho e pelo teclado, de 64 a 800 px, e a tabela
   * rola de lado quando passam da janela. A largura de cada uma vem da `largura` dela.
   */
  redimensionavel?: boolean;
  /** As larguras novas, em px, pelo id da coluna, quando o usuário termina de redimensionar. */
  aoRedimensionar?: (larguras: ReadonlyMap<string, number>) => void;
  /**
   * Só as linhas perto da área visível ficam desenhadas, e a tabela ocupa a altura que recebe,
   * rolando por dentro. Com `carregarMais`, a página seguinte vem sozinha ao fim da rolagem.
   */
  virtualizada?: boolean;
  /**
   * As linhas selecionadas, pelo id. Com ela, a tabela seleciona com Ctrl e Shift, pelo mouse e pelo
   * teclado, e o clique simples continua abrindo o registro.
   */
  selecao?: ReadonlySet<string>;
  aoMudarSelecao?: (selecao: Set<string>) => void;
  /**
   * Os itens do menu de contexto para as linhas dadas: a seleção, quando ele abre sobre uma linha
   * dela, ou só a linha. Abre pelo clique direito, pela tecla de menu, por Shift+F10 e pelo toque
   * longo.
   */
  menuDeContexto?: (chaves: string[]) => ItemDoMenuDeContexto[];
  /** Ctrl+C, ou Cmd+C: as linhas selecionadas ou, sem seleção, a linha em foco. */
  aoCopiar?: (chaves: string[]) => void;
  /**
   * As colunas à vista na linha dada, na ordem da tabela, com o rótulo e o valor de cada uma. Quando
   * o mouse para 1,5 s sobre uma linha, a tabela mostra junto dela as que estão fora da área
   * visível. Só com o mouse e com o resumo ligado nas preferências.
   */
  resumoDaLinha?: (chave: string) => readonly ItemDoResumo[];
  /**
   * A tabela espera as linhas (change filtros-e-barra-da-tabela, design, decisão 6): sem nenhuma,
   * o esqueleto delas sob as colunas; com as de antes, elas ficam, ocupadas, até as novas chegarem.
   */
  carregando?: boolean;
  children: ReactNode;
  className?: string;
}

/** A ordem dos ids das linhas carregadas, que o corpo escreve: o Shift+clique seleciona entre elas. */
const OrdemDasLinhasContexto = createContext<{ current: string[] }>({ current: [] });

/** Os controles dentro de uma linha: o clique neles é só deles. */
const CONTROLES =
  'button, a, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="menuitem"], [role="slider"]';

/** A linha do corpo sob o ponteiro, também sobre os controles dela; nenhuma no cabeçalho. */
function chaveSobOPonteiro(alvo: EventTarget | null): string | null {
  const linha =
    alvo instanceof Element ? alvo.closest<HTMLElement>('[role="row"][data-key]') : null;
  if (!linha || linha.querySelector('[role="columnheader"]')) return null;
  return linha.dataset.key ?? null;
}

/** Uma referência na célula, como o responsável: sobre ela, o ponteiro abre o cartão dela. */
const REFERENCIAS = 'a[href], [role="link"]';

const sobreUmaReferencia = (alvo: EventTarget | null) =>
  alvo instanceof Element && alvo.closest(REFERENCIAS) !== null;

/** A linha do corpo sob o ponteiro, fora dos controles dela; nenhuma no cabeçalho. */
function linhaDoCorpo(alvo: EventTarget | null): HTMLElement | null {
  const elemento = alvo instanceof Element ? alvo : null;
  if (!elemento || elemento.closest(CONTROLES)) return null;
  const linha = elemento.closest<HTMLElement>('[role="row"][data-key]');
  if (!linha || linha.querySelector('[role="columnheader"]')) return null;
  return linha;
}

/** O modo da tabela: virtualizada, com a carga ao fim que o corpo desenha como a última linha. */
const ModoDaTabelaContexto = createContext<{
  virtualizada: boolean;
  carregarMais: CarregarMais | null;
  carregando: boolean;
}>({ virtualizada: false, carregarMais: null, carregando: false });

/** Quantas linhas o esqueleto da primeira carga desenha. */
const LINHAS_DO_ESQUELETO = 6;

/** As linhas do esqueleto, com larguras diferentes, como textos de tamanhos diferentes. */
function EsqueletoDasLinhas() {
  return (
    <div className={estilos.esqueletoDasLinhas}>
      <span className={estilos.somenteLeitor}>Carregando as linhas.</span>
      {Array.from({ length: LINHAS_DO_ESQUELETO }, (_, indice) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: as linhas do esqueleto são iguais e fixas.
        <span key={indice} className={estilos.linhaDoEsqueleto} data-esqueleto-da-linha="">
          <Esqueleto largura={`${[72, 48, 64, 40, 56, 68][indice] ?? 60}%`} />
        </span>
      ))}
    </div>
  );
}

/**
 * A posição de cada linha na tabela virtualizada, pelo id: lá o React Aria reaproveita os elementos
 * fora de ordem, e a linha alternada vem da posição, e não do lugar no DOM.
 */
const PosicoesDasLinhasContexto = createContext<ReadonlyMap<string, number> | null>(null);

/** As larguras da tabela redimensionável: as do arraste em curso e o lado da miniatura. */
interface LargurasDaTabela {
  /** As larguras enquanto o usuário arrasta, por cima das dadas pelas colunas. */
  emCurso: ReadonlyMap<string, number> | null;
  /** O lado da miniatura na densidade atual, para a coluna dela. */
  miniatura: number;
}

const LargurasDaTabelaContexto = createContext<LargurasDaTabela>({ emCurso: null, miniatura: 22 });

/** As larguras do React Aria em px, sem a coluna da miniatura, que não muda. */
function emPixels(larguras: ReadonlyMap<Key, unknown>): Map<string, number> {
  const pixels = new Map<string, number>();
  for (const [chave, largura] of larguras) {
    if (typeof largura === 'number' && chave !== 'miniatura') {
      pixels.set(String(chave), Math.round(largura));
    }
  }
  return pixels;
}

function marcar(area: HTMLElement, atributo: string, ligado: boolean) {
  if (ligado) area.setAttribute(atributo, '');
  else area.removeAttribute(atributo);
}

/**
 * Marca na área da tabela se há colunas além da borda esquerda (`data-mais-a-esquerda`) e da
 * direita (`data-mais-a-direita`), e passa a altura da barra de rolagem de baixo em
 * `--altura-da-barra` e a largura da do lado, na tabela de altura máxima, em `--largura-da-barra`
 * (change rolagem-das-tabelas, design, decisão 1). Mede de novo ao rolar e
 * quando a área ou a tabela mudam de tamanho, sem desenhar o React de novo a cada rolagem.
 */
function useBordasLaterais(referencia: RefObject<HTMLDivElement | null> | null) {
  useLayoutEffect(() => {
    const area = referencia?.current;
    if (!area) return;
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      const embaixo = area.offsetHeight - area.clientHeight;
      const aDireita = area.offsetWidth - area.clientWidth;
      area.style.setProperty('--altura-da-barra', `${Math.max(0, embaixo)}px`);
      area.style.setProperty('--largura-da-barra', `${Math.max(0, aDireita)}px`);
      const rolado = Math.abs(area.scrollLeft);
      marcar(area, 'data-mais-a-esquerda', rolado > 1);
      marcar(area, 'data-mais-a-direita', rolado + area.clientWidth < area.scrollWidth - 1);
    };
    const pedirMedida = () => {
      if (!quadro) quadro = requestAnimationFrame(medir);
    };
    medir();
    area.addEventListener('scroll', pedirMedida, { passive: true });
    const observador = new ResizeObserver(pedirMedida);
    observador.observe(area);
    if (area.firstElementChild) observador.observe(area.firstElementChild);
    return () => {
      cancelAnimationFrame(quadro);
      area.removeEventListener('scroll', pedirMedida);
      observador.disconnect();
    };
  }, [referencia]);
}

/** Quanto o dedo fica parado sobre a linha para o toque longo abrir o menu de contexto, em ms. */
const TEMPO_DO_TOQUE_LONGO = 500;

/** O que recebe o espaço da prévia: a linha em foco, ou uma célula dela, e não um controle. */
const ALVO_DA_PREVIA = '[role="row"], [role="gridcell"], [role="rowheader"]';

/**
 * Tabela base: cabeçalho fixo na rolagem, linhas demarcadas e alternadas na altura da densidade,
 * ordenação indicada no cabeçalho (e anunciada). As setas movem a linha em foco. Quando a tela
 * oferece, o clique ou Enter abrem o registro, e o espaço pede a prévia.
 */
export function Tabela({
  rotulo,
  ordenacao,
  aoOrdenar,
  alturaMaxima,
  aoAbrirLinha,
  aoPreverLinha,
  carregarMais,
  redimensionavel = false,
  aoRedimensionar,
  virtualizada = false,
  selecao,
  aoMudarSelecao,
  menuDeContexto,
  aoCopiar,
  resumoDaLinha,
  carregando = false,
  children,
  className,
}: PropsDaTabela) {
  const [contexto, definirContexto] = useState<{
    posicao: { x: number; y: number };
    chaves: string[];
    origem: HTMLElement;
  } | null>(null);
  const comSelecao = selecao !== undefined && aoMudarSelecao !== undefined;
  const ordemDasLinhas = useRef<string[]>([]);
  // A última linha escolhida pelo clique: o Shift+clique seleciona dela até a clicada.
  const ancora = useRef<string | null>(null);
  const preferencias = useContext(PreferenciasDaTabelaContexto);
  const rolagem = useRef<HTMLDivElement>(null);
  // O resumo da linha: o relógio conta o tempo parado, e a tabela mede as colunas fora da área
  // visível na hora de mostrar.
  const comResumo = preferencias.resumoDaLinha && resumoDaLinha !== undefined;
  const [resumo, definirResumo] = useState<{
    itens: readonly ItemDoResumo[];
    posicao: PosicaoDoResumo;
  } | null>(null);
  const pontoDoMouse = useRef(0);
  const mostrarResumo = useRef<(chave: string) => void>(() => undefined);
  mostrarResumo.current = (chave) => {
    const area = rolagem.current;
    if (!area || !resumoDaLinha || contexto || !ordemDasLinhas.current.includes(chave)) return;
    const linha = area.querySelector<HTMLElement>(`[role="row"][data-key="${CSS.escape(chave)}"]`);
    if (!linha) return;
    const itens = resumoDaLinha(chave);
    const colunas = itens.map((item) => item.coluna);
    // As colunas fora da área visível e as que estão à vista com o conteúdo cortado na célula.
    const fora = new Set([
      ...colunasForaDaArea(area, colunas),
      ...colunasComConteudoCortado(area, linha, colunas),
    ]);
    if (fora.size === 0) return;
    const caixa = linha.getBoundingClientRect();
    definirResumo({
      itens: itens.filter((item) => fora.has(item.coluna)),
      posicao: { x: pontoDoMouse.current, topo: caixa.top, base: caixa.bottom },
    });
  };
  const [relogio] = useState(() =>
    relogioDoResumo({
      aoMostrar: (chave) => mostrarResumo.current(chave),
      aoEsconder: () => definirResumo(null),
    }),
  );
  // A rolagem, de qualquer parte da página, e qualquer tecla fecham o resumo e cancelam a espera.
  useEffect(() => {
    if (!comResumo) return;
    const cancelar = () => relogio.cancelar();
    window.addEventListener('scroll', cancelar, true);
    window.addEventListener('keydown', cancelar, true);
    return () => {
      window.removeEventListener('scroll', cancelar, true);
      window.removeEventListener('keydown', cancelar, true);
      relogio.cancelar();
    };
  }, [comResumo, relogio]);
  const [emCurso, definirEmCurso] = useState<ReadonlyMap<string, number> | null>(null);
  const [miniatura, definirMiniatura] = useState(22);
  const [alturaDaLinha, definirAlturaDaLinha] = useState(34);
  // O lado da miniatura e a altura da linha vêm da densidade, pelo CSS: a coluna da miniatura tem
  // a largura dela e das margens da célula, e a virtualização, a altura de cada linha.
  useLayoutEffect(() => {
    if ((!redimensionavel && !virtualizada) || !rolagem.current) return;
    const estilo = getComputedStyle(rolagem.current);
    const lado = Number.parseFloat(estilo.getPropertyValue('--tamanho-miniatura'));
    if (lado > 0 && lado !== miniatura) definirMiniatura(lado);
    const altura = Number.parseFloat(estilo.getPropertyValue('--altura-linha'));
    if (altura > 0 && altura !== alturaDaLinha) definirAlturaDaLinha(altura);
  });
  // O foco pedido numa linha que a tabela virtualizada não desenha, como o da prévia que fecha:
  // a tabela rola até ela, com a linha no meio da área, e a foca quando ela é desenhada.
  const areaDosEventos = useRef<HTMLDivElement>(null);
  const focarLinha = useRef<(chave: string) => void>(() => undefined);
  focarLinha.current = (chave) => {
    const indice = ordemDasLinhas.current.indexOf(chave);
    const rolavel = virtualizada
      ? rolagem.current?.querySelector<HTMLElement>('[role="grid"]')
      : rolagem.current;
    if (indice < 0 || !rolavel) return;
    const topo = alturaDaLinha * (indice + 1);
    rolavel.scrollTop = Math.max(0, topo - (rolavel.clientHeight - alturaDaLinha) / 2);
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        rolavel
          .querySelector<HTMLElement>(`[role="row"][data-key="${CSS.escape(chave)}"]`)
          ?.focus(),
      ),
    );
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: a área dos eventos muda só com a tabela redimensionável.
  useEffect(() => {
    const area = areaDosEventos.current ?? rolagem.current;
    if (!area) return;
    const aoPedir = (evento: Event) => focarLinha.current(String((evento as CustomEvent).detail));
    area.addEventListener(PEDIDO_DE_FOCO_DA_LINHA, aoPedir);
    return () => area.removeEventListener(PEDIDO_DE_FOCO_DA_LINHA, aoPedir);
  }, [redimensionavel]);
  // O espaço é da prévia, antes do React Aria, também com a seleção: ela muda com Ctrl e Shift. E
  // Enter abre o registro com ou sem seleção.
  const aoTeclar = (evento: KeyboardEvent<HTMLDivElement>) => {
    const vertical = evento.key === 'ArrowDown' || evento.key === 'ArrowUp';
    if (comSelecao && vertical) {
      estenderPeloTeclado(evento);
      return;
    }
    const pedeMenu = evento.key === 'ContextMenu' || (evento.shiftKey && evento.key === 'F10');
    if (pedeMenu || (evento.key.toLowerCase() === 'c' && (evento.ctrlKey || evento.metaKey))) {
      const linha = linhaDoCorpo(evento.target);
      const chave = linha?.dataset.key;
      if (!linha || !chave) return;
      if (pedeMenu && menuDeContexto) {
        evento.preventDefault();
        evento.stopPropagation();
        const caixa = linha.getBoundingClientRect();
        abrirMenuDeContexto(linha, { x: caixa.left + 16, y: caixa.bottom });
      }
      // Com um trecho de texto selecionado, o Ctrl+C é do navegador.
      if (!pedeMenu && aoCopiar && !window.getSelection()?.toString()) {
        evento.preventDefault();
        // Com seleção, ela inteira, esteja onde estiver o foco; sem seleção, a linha em foco.
        aoCopiar(
          selecao && selecao.size > 0
            ? ordemDasLinhas.current.filter((outra) => selecao.has(outra))
            : [chave],
        );
      }
      return;
    }
    const abrir = evento.key === 'Enter' && comSelecao && aoAbrirLinha;
    if (!(evento.key === ' ' && aoPreverLinha) && !abrir) return;
    const alvo = evento.target as HTMLElement;
    if (!alvo.matches(ALVO_DA_PREVIA)) return;
    const linha = alvo.closest<HTMLElement>('[role="row"][data-key]');
    if (!linha?.dataset.key || linha.querySelector('[role="columnheader"]')) return;
    evento.preventDefault();
    evento.stopPropagation();
    if (evento.key === ' ') aoPreverLinha?.(linha.dataset.key);
    else aoAbrirLinha?.(linha.dataset.key);
  };
  // As setas sozinhas só movem o foco, e a seleção seguinte começa na linha em foco. Com o Shift, a
  // seleção vai da âncora (a linha em foco quando o Shift começou, ou a do último Ctrl+clique) até
  // a linha seguinte, que recebe o foco.
  function estenderPeloTeclado(evento: KeyboardEvent<HTMLDivElement>) {
    const linha = linhaDoCorpo(evento.target);
    const chave = linha?.dataset.key;
    if (!linha || !chave) return;
    if (!evento.shiftKey) {
      ancora.current = null;
      return;
    }
    const chaves = ordemDasLinhas.current;
    const proxima = chaves[chaves.indexOf(chave) + (evento.key === 'ArrowDown' ? 1 : -1)];
    evento.preventDefault();
    evento.stopPropagation();
    if (proxima === undefined || !aoMudarSelecao) return;
    const de = ancora.current ?? chave;
    ancora.current = de;
    const [inicio, fim] = [chaves.indexOf(de), chaves.indexOf(proxima)].sort((a, b) => a - b);
    aoMudarSelecao(new Set(chaves.slice(inicio, (fim ?? 0) + 1)));
    linha.parentElement
      ?.querySelector<HTMLElement>(`[role="row"][data-key="${CSS.escape(proxima)}"]`)
      ?.focus();
  }
  /** As linhas sobre as quais o menu e o copiar agem: a seleção, na ordem da tabela, ou a linha. */
  const linhasDaAcao = (chave: string): string[] =>
    selecao?.has(chave) ? ordemDasLinhas.current.filter((outra) => selecao.has(outra)) : [chave];
  // O menu de contexto da linha: aberto sobre uma linha fora da seleção, ela passa a ser a seleção.
  const abrirMenuDeContexto = (linha: HTMLElement, posicao: { x: number; y: number }) => {
    const chave = linha.dataset.key;
    if (!menuDeContexto || !chave) return;
    if (comSelecao && !selecao.has(chave)) aoMudarSelecao(new Set([chave]));
    definirContexto({ posicao, chaves: linhasDaAcao(chave), origem: linha });
  };
  const aoPedirMenu = (evento: MouseEvent<HTMLDivElement>) => {
    const linha = linhaDoCorpo(evento.target);
    if (!menuDeContexto || !linha) return;
    evento.preventDefault();
    // O toque longo já abriu o menu: o "contextmenu" do navegador não abre outro.
    if (Date.now() - toqueLongo.current.abertoEm < 1000) return;
    linha.focus();
    abrirMenuDeContexto(linha, { x: evento.clientX, y: evento.clientY });
  };
  // O toque longo abre o menu de contexto, e o toque que termina depois dele não abre o registro.
  const toqueLongo = useRef<{
    temporizador: number | undefined;
    inicio: { x: number; y: number } | null;
    abertoEm: number;
  }>({ temporizador: undefined, inicio: null, abertoEm: 0 });
  const cancelarToqueLongo = () => {
    window.clearTimeout(toqueLongo.current.temporizador);
    toqueLongo.current.inicio = null;
  };
  // Com a seleção, o clique decide antes do React Aria: o simples abre, o Ctrl+clique põe ou tira
  // a linha da seleção e o Shift+clique seleciona da última escolhida até a clicada.
  const aoApertar = (evento: PointerEvent<HTMLDivElement>) => {
    relogio.cancelar();
    const linha = linhaDoCorpo(evento.target);
    if (!linha) return;
    if (evento.pointerType === 'touch' && menuDeContexto) {
      cancelarToqueLongo();
      const inicio = { x: evento.clientX, y: evento.clientY };
      toqueLongo.current.inicio = inicio;
      toqueLongo.current.temporizador = window.setTimeout(() => {
        toqueLongo.current.abertoEm = Date.now();
        abrirMenuDeContexto(linha, inicio);
      }, TEMPO_DO_TOQUE_LONGO);
    }
    if (!comSelecao || evento.button !== 0) return;
    evento.stopPropagation();
    // O Shift+clique não seleciona o texto entre as duas linhas.
    if (evento.shiftKey) evento.preventDefault();
  };
  const aoMoverOPonteiro = (evento: PointerEvent<HTMLDivElement>) => {
    // O resumo é só do mouse: o toque e a caneta não o abrem. Com um botão apertado, como no
    // arraste da borda de uma coluna ou na seleção de um trecho, ele não conta o tempo.
    if (comResumo && evento.pointerType === 'mouse') {
      pontoDoMouse.current = evento.clientX;
      // Sobre uma referência, quem abre é o cartão dela, e o resumo da linha espera.
      relogio.mover(
        evento.buttons === 0 && !sobreUmaReferencia(evento.target)
          ? chaveSobOPonteiro(evento.target)
          : null,
      );
    }
    const { inicio } = toqueLongo.current;
    if (inicio && Math.hypot(evento.clientX - inicio.x, evento.clientY - inicio.y) > 10) {
      cancelarToqueLongo();
    }
  };
  const aoClicar = (evento: MouseEvent<HTMLDivElement>) => {
    const linha = linhaDoCorpo(evento.target);
    const chave = linha?.dataset.key;
    if (!linha || !chave) return;
    if (Date.now() - toqueLongo.current.abertoEm < 1000) {
      evento.stopPropagation();
      evento.preventDefault();
      return;
    }
    if (!comSelecao) return;
    evento.stopPropagation();
    linha.focus();
    if (evento.ctrlKey || evento.metaKey) {
      const nova = new Set(selecao);
      if (nova.has(chave)) nova.delete(chave);
      else nova.add(chave);
      ancora.current = chave;
      aoMudarSelecao(nova);
      return;
    }
    if (evento.shiftKey) {
      const chaves = ordemDasLinhas.current;
      const de = chaves.indexOf(ancora.current ?? chave);
      const ate = chaves.indexOf(chave);
      aoMudarSelecao(
        de < 0 || ate < 0
          ? new Set([chave])
          : new Set(chaves.slice(Math.min(de, ate), Math.max(de, ate) + 1)),
      );
      return;
    }
    aoAbrirLinha?.(chave);
  };
  const eventosDaArea = {
    onKeyDownCapture: aoTeclar,
    onPointerDownCapture: aoApertar,
    onPointerMoveCapture: aoMoverOPonteiro,
    onPointerUpCapture: cancelarToqueLongo,
    onPointerCancelCapture: cancelarToqueLongo,
    onClickCapture: aoClicar,
    onContextMenuCapture: aoPedirMenu,
    onPointerLeave: () => relogio.cancelar(),
  };
  useBordasLaterais(virtualizada ? null : rolagem);
  // O React Aria não passa o aria-busy à grade: a tabela o põe e o tira pela referência.
  const grade = useRef<HTMLTableElement>(null);
  useLayoutEffect(() => {
    if (carregando) grade.current?.setAttribute('aria-busy', 'true');
    else grade.current?.removeAttribute('aria-busy');
  }, [carregando]);
  const tabelaDoReactAria = (
    <Table
      ref={grade}
      aria-label={rotulo}
      sortDescriptor={paraReactAria(ordenacao)}
      onSortChange={aoOrdenar ? (descritor) => aoOrdenar(deReactAria(descritor)) : undefined}
      onRowAction={aoAbrirLinha ? (chave) => aoAbrirLinha(String(chave)) : undefined}
      {...(comSelecao
        ? {
            selectionMode: 'multiple' as const,
            selectionBehavior: 'toggle' as const,
            selectedKeys: selecao,
            onSelectionChange: (chaves: Selection) =>
              aoMudarSelecao(
                chaves === 'all'
                  ? new Set(ordemDasLinhas.current)
                  : new Set([...chaves].map(String)),
              ),
          }
        : {})}
      data-sem-linhas-alternadas={preferencias.linhasAlternadas ? undefined : ''}
      data-carregando={carregando ? '' : undefined}
      className={[estilos.tabela, virtualizada ? estilos.virtualizada : undefined, className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Table>
  );
  // Na tabela virtualizada, a própria tabela rola, e o React Aria posiciona as linhas e o cabeçalho.
  const conteudo = virtualizada ? (
    <Virtualizer
      layout={TableLayout}
      layoutOptions={{ rowHeight: alturaDaLinha, headingHeight: alturaDaLinha }}
    >
      {tabelaDoReactAria}
    </Virtualizer>
  ) : (
    tabelaDoReactAria
  );
  const classeDaArea = virtualizada ? estilos.areaVirtualizada : estilos.rolagem;
  const estiloDaArea = virtualizada ? { height: alturaMaxima } : { maxHeight: alturaMaxima };
  const area = redimensionavel ? (
    <div
      ref={areaDosEventos}
      className={[estilos.envoltorio, virtualizada ? estilos.envoltorioVirtualizado : undefined]
        .filter(Boolean)
        .join(' ')}
      {...eventosDaArea}
    >
      <ResizableTableContainer
        ref={rolagem}
        data-rolagem=""
        className={classeDaArea}
        style={estiloDaArea}
        onResize={(larguras) => definirEmCurso(emPixels(larguras))}
        onResizeEnd={(larguras) => {
          aoRedimensionar?.(emPixels(larguras));
          definirEmCurso(null);
        }}
      >
        <LargurasDaTabelaContexto.Provider value={{ emCurso, miniatura }}>
          {conteudo}
        </LargurasDaTabelaContexto.Provider>
      </ResizableTableContainer>
    </div>
  ) : (
    <div
      ref={rolagem}
      data-rolagem=""
      className={classeDaArea}
      style={estiloDaArea}
      {...eventosDaArea}
    >
      {conteudo}
    </div>
  );
  // A tabela virtualizada carrega a página seguinte pela última linha, e não pelo botão.
  const tabela = (
    <ModoDaTabelaContexto.Provider
      value={{
        virtualizada,
        carregarMais: virtualizada ? (carregarMais ?? null) : null,
        carregando,
      }}
    >
      <OrdemDasLinhasContexto.Provider value={ordemDasLinhas}>
        {carregando && (
          <span className={estilos.progresso} data-progresso-da-tabela="" aria-hidden="true" />
        )}
        {area}
      </OrdemDasLinhasContexto.Provider>
      {menuDeContexto && (
        <MenuDeContexto
          rotulo="Ações das linhas"
          posicao={contexto?.posicao ?? null}
          itens={contexto ? menuDeContexto(contexto.chaves) : []}
          aoFechar={() => definirContexto(null)}
          origem={contexto?.origem}
        />
      )}
      {resumo && <ResumoDaLinha itens={resumo.itens} posicao={resumo.posicao} />}
    </ModoDaTabelaContexto.Provider>
  );
  if (!carregarMais || virtualizada) return tabela;
  return (
    <>
      {tabela}
      <BotaoDeCarregarMais {...carregarMais} rolagem={rolagem} />
    </>
  );
}

const linhasDoCorpo = (rolagem: HTMLElement | null) => [
  ...(rolagem?.querySelectorAll<HTMLElement>('tbody [role="row"]') ?? []),
];

function BotaoDeCarregarMais({
  haMais,
  carregando,
  aoCarregar,
  rotulo = 'Carregar mais',
  rolagem,
}: CarregarMais & { rolagem: RefObject<HTMLDivElement | null> }) {
  const envoltorio = useRef<HTMLDivElement>(null);
  // Entre o clique e a tabela voltar com "carregando", um segundo clique não vira outro pedido.
  const pedido = useRef(false);
  // Quantas linhas havia no pedido, e se o botão tinha o foco.
  const noPedido = useRef<{ linhas: number; comFoco: boolean } | null>(null);

  useEffect(() => {
    pedido.current = false;
  });

  // Quando acabam os registros, o botão sai com o foco, e ele passa à primeira linha nova.
  useEffect(() => {
    const anterior = noPedido.current;
    if (haMais || !anterior) return;
    noPedido.current = null;
    if (!anterior.comFoco) return;
    const quadro = requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      linhasDoCorpo(rolagem.current)[anterior.linhas]?.focus();
    });
    return () => cancelAnimationFrame(quadro);
  }, [haMais, rolagem]);

  if (!haMais) return null;
  return (
    <div ref={envoltorio} className={estilos.carregarMais}>
      <Botao
        carregando={carregando}
        rotuloCarregando="Carregando"
        onPress={() => {
          if (pedido.current) return;
          pedido.current = true;
          noPedido.current = {
            linhas: linhasDoCorpo(rolagem.current).length,
            comFoco: envoltorio.current?.contains(document.activeElement) ?? false,
          };
          aoCarregar();
        }}
      >
        {rotulo}
      </Botao>
    </div>
  );
}

export function CabecalhoDaTabela({ children }: { children: ReactNode }) {
  return <TableHeader className={estilos.cabecalho}>{children}</TableHeader>;
}

/** O que o menu da coluna oferece além de ordenar e redimensionar. */
export interface MenuDaColuna {
  /** "Filtrar…": abre o filtro da coluna. */
  aoFiltrar?: () => void;
  /** "Ocultar coluna": a coluna sai da tabela. A coluna principal nunca oferece. */
  aoOcultar?: () => void;
}

export type AlinhamentoDaColuna = 'inicio' | 'fim';

/**
 * O que a coluna mostra (change tabelas-consistentes, design, decisões 1 e 2): o número fica à
 * direita e na mono, o código na mono, a data numa linha, e as ações à direita, lado a lado. A
 * célula segue a espécie da coluna dela, sem repetir.
 */
export type EspecieDaColuna = 'texto' | 'numero' | 'codigo' | 'data' | 'situacao' | 'acoes';

/** As espécies que põem o cabeçalho e o valor à direita. */
const ESPECIES_A_DIREITA: ReadonlySet<EspecieDaColuna> = new Set(['numero', 'acoes']);

export interface PropsDaColuna
  extends Omit<
    ColumnProps,
    | 'children'
    | 'className'
    | 'allowsSorting'
    | 'isRowHeader'
    | 'width'
    | 'defaultWidth'
    | 'minWidth'
    | 'maxWidth'
  > {
  children: string;
  ordenavel?: boolean;
  /** A coluna que nomeia cada linha: o leitor de tela a anuncia ao navegar. */
  principal?: boolean;
  /** Sem texto visível (a coluna da miniatura), mas com nome para o leitor de tela. */
  rotuloOculto?: boolean;
  /** A largura em px, na tabela redimensionável; sem ela, a coluna divide a sobra da área. */
  largura?: number;
  /** Os números ficam à direita. A espécie número e a ações já põem à direita. */
  alinhamento?: AlinhamentoDaColuna;
  /** O que a coluna mostra; a célula segue. Sem ela, texto. */
  especie?: EspecieDaColuna;
  /** O menu da coluna. A tabela redimensionável sempre o tem, com "Redimensionar coluna". */
  menu?: MenuDaColuna;
}

function MenuDoCabecalho({
  rotulo,
  ordenavel,
  principal,
  menu,
  aoOrdenar,
  aoRedimensionar,
}: {
  rotulo: string;
  ordenavel: boolean;
  principal: boolean;
  menu?: MenuDaColuna;
  aoOrdenar: (direcao: SortDirection) => void;
  aoRedimensionar?: () => void;
}) {
  const nome = `Opções da coluna ${rotulo}`;
  return (
    <Menu
      rotulo={nome}
      gatilho={
        <BotaoDeIcone
          icone={Ellipsis}
          rotulo={nome}
          comDica={false}
          className={estilos.botaoDaColuna}
        />
      }
    >
      {ordenavel && (
        <ItemDeMenu id="crescente" onAction={() => aoOrdenar('ascending')}>
          Ordenar crescente
        </ItemDeMenu>
      )}
      {ordenavel && (
        <ItemDeMenu id="decrescente" onAction={() => aoOrdenar('descending')}>
          Ordenar decrescente
        </ItemDeMenu>
      )}
      {menu?.aoFiltrar && (
        <ItemDeMenu id="filtrar" onAction={menu.aoFiltrar}>
          Filtrar…
        </ItemDeMenu>
      )}
      {menu?.aoOcultar && !principal && (
        <ItemDeMenu id="ocultar" onAction={menu.aoOcultar}>
          Ocultar coluna
        </ItemDeMenu>
      )}
      {aoRedimensionar && (
        <ItemDeMenu id="redimensionar" onAction={aoRedimensionar}>
          Redimensionar coluna
        </ItemDeMenu>
      )}
    </Menu>
  );
}

/**
 * O conteúdo do cabeçalho: o rótulo, a ordem, o menu e a borda que arrasta. A tabela redimensionável
 * só se conhece na renderização das colunas, e não na montagem da coleção.
 */
function CabecalhoDaColuna({
  rotulo,
  rotuloOculto,
  principal,
  menu,
  allowsSorting,
  sortDirection,
  sort,
  startResize,
}: {
  rotulo: string;
  rotuloOculto: boolean;
  principal: boolean;
  menu?: MenuDaColuna;
  allowsSorting: boolean;
  sortDirection: SortDirection | undefined;
  sort: (direcao: SortDirection) => void;
  startResize: () => void;
}) {
  const redimensionavel = useContext(TableColumnResizeStateContext) !== null;
  const comMenu = !rotuloOculto && (menu !== undefined || redimensionavel);
  return (
    <div className={estilos.cabecalhoDaColuna}>
      <span className={estilos.conteudoDaColuna}>
        <span className={rotuloOculto ? estilos.somenteLeitor : estilos.rotuloDaColuna}>
          {rotulo}
        </span>
        {allowsSorting && (
          <span className={estilos.ordem} data-ativa={sortDirection ? '' : undefined}>
            <Icone
              icone={
                sortDirection === 'ascending'
                  ? ChevronUp
                  : sortDirection === 'descending'
                    ? ChevronDown
                    : ChevronsUpDown
              }
              tamanho={14}
            />
          </span>
        )}
      </span>
      {comMenu && (
        <MenuDoCabecalho
          rotulo={rotulo}
          ordenavel={allowsSorting}
          principal={principal}
          menu={menu}
          aoOrdenar={sort}
          aoRedimensionar={redimensionavel ? startResize : undefined}
        />
      )}
      {redimensionavel && !rotuloOculto && (
        // O React Aria junta o nome da coluna ao rótulo: "Redimensionar Local".
        <ColumnResizer aria-label="Redimensionar" className={estilos.borda} />
      )}
    </div>
  );
}

export function Coluna({
  children,
  ordenavel = false,
  principal = false,
  rotuloOculto = false,
  largura,
  alinhamento = 'inicio',
  especie = 'texto',
  menu,
  ...resto
}: PropsDaColuna) {
  const { emCurso } = useContext(LargurasDaTabelaContexto);
  const id = resto.id === undefined ? undefined : String(resto.id);
  const dada = (id === undefined ? undefined : emCurso?.get(id)) ?? largura;
  // As larguras só valem na tabela redimensionável; a coluna sem rótulo à vista, a da miniatura,
  // fica na largura dada.
  return (
    <Column
      {...resto}
      width={dada ?? (principal ? FRACAO.principal : FRACAO.outra)}
      minWidth={
        rotuloOculto ? largura : dada === undefined ? MINIMA_NA_DIVISAO : LIMITES_DA_LARGURA.minima
      }
      maxWidth={rotuloOculto ? largura : LIMITES_DA_LARGURA.maxima}
      allowsSorting={ordenavel}
      isRowHeader={principal}
      textValue={children}
      data-alinhamento={
        alinhamento === 'fim' || ESPECIES_A_DIREITA.has(especie) ? 'fim' : undefined
      }
      data-especie={especie === 'texto' ? undefined : especie}
      className={estilos.coluna}
    >
      {(propriedades) => (
        <CabecalhoDaColuna
          rotulo={children}
          rotuloOculto={rotuloOculto}
          principal={principal}
          menu={menu}
          allowsSorting={propriedades.allowsSorting}
          sortDirection={propriedades.sortDirection}
          sort={propriedades.sort}
          startResize={propriedades.startResize}
        />
      )}
    </Column>
  );
}

export interface PropsDoCorpoDaTabela<T extends object> {
  itens: T[];
  /** Estado vazio padronizado, com a mensagem e, quando houver, a ação. */
  vazio?: ReactNode;
  /** O que, além dos itens, muda as linhas, como as colunas à vista. */
  dependencias?: readonly unknown[];
  children: (item: T) => ReactElement;
}

export function CorpoDaTabela<T extends object>({
  itens,
  vazio,
  dependencias,
  children,
}: PropsDoCorpoDaTabela<T>) {
  const { virtualizada, carregarMais, carregando: semAsLinhas } = useContext(ModoDaTabelaContexto);
  // Sem linhas, enquanto a tabela carrega, o esqueleto delas no lugar do estado vazio.
  const vazioOuEsqueleto =
    semAsLinhas && itens.length === 0
      ? () => <EsqueletoDasLinhas />
      : vazio
        ? () => vazio
        : undefined;
  // A tabela seleciona entre as linhas carregadas, na ordem delas.
  useContext(OrdemDasLinhasContexto).current = itens.map((item) =>
    String((item as { id?: unknown }).id),
  );
  const posicoes = useMemo(
    () =>
      virtualizada
        ? new Map(itens.map((item, posicao) => [String((item as { id?: unknown }).id), posicao]))
        : null,
    [virtualizada, itens],
  );
  // Entre o pedido e a tabela voltar com "carregando", a última linha à vista não pede de novo.
  const pedido = useRef(false);
  const carregando = carregarMais?.carregando ?? false;
  // biome-ignore lint/correctness/useExhaustiveDependencies: o pedido termina quando chegam linhas novas ou quando a carga acaba.
  useEffect(() => {
    if (!carregando) pedido.current = false;
  }, [carregando, itens.length]);
  if (!carregarMais) {
    return (
      <PosicoesDasLinhasContexto.Provider value={posicoes}>
        <TableBody
          items={itens}
          dependencies={dependencias}
          renderEmptyState={vazioOuEsqueleto}
          className={estilos.corpo}
        >
          {children}
        </TableBody>
      </PosicoesDasLinhasContexto.Provider>
    );
  }
  return (
    <PosicoesDasLinhasContexto.Provider value={posicoes}>
      <TableBody
        dependencies={dependencias}
        renderEmptyState={vazioOuEsqueleto}
        className={estilos.corpo}
      >
        <Collection items={itens} dependencies={dependencias}>
          {children}
        </Collection>
        {(carregarMais.haMais || carregando) && (
          <TableLoadMoreItem
            // O React Aria marca a linha com o nível da árvore, que só vale numa treegrid: numa
            // tabela comum, o atributo é inválido para o leitor de tela.
            ref={(linha) => linha?.removeAttribute('aria-level')}
            className={estilos.carregandoMais}
            isLoading={carregando}
            onLoadMore={() => {
              if (pedido.current || carregando || !carregarMais.haMais) return;
              pedido.current = true;
              carregarMais.aoCarregar();
            }}
          >
            <span role="status">Carregando mais…</span>
          </TableLoadMoreItem>
        )}
      </TableBody>
    </PosicoesDasLinhasContexto.Provider>
  );
}

export function Linha<T extends object>({
  children,
  ...resto
}: Omit<RowProps<T>, 'className' | 'children'> & { children: ReactNode }) {
  const posicao = useContext(PosicoesDasLinhasContexto)?.get(String(resto.id));
  return (
    <Row
      {...resto}
      data-par={posicao !== undefined && posicao % 2 === 1 ? '' : undefined}
      className={estilos.linha}
    >
      {children}
    </Row>
  );
}

export interface PropsDaCelula {
  children: ReactNode;
  /** Os números ficam à direita, como a coluna deles. */
  alinhamento?: AlinhamentoDaColuna;
  /** Os identificadores e os números na fonte mono, com algarismos tabulares. */
  mono?: boolean;
}

/** A classe do conteúdo de cada espécie; o texto e a situação ficam como a célula comum. */
const CLASSE_DA_ESPECIE: Partial<Record<EspecieDaColuna, string | undefined>> = {
  numero: estilos.conteudoNumero,
  codigo: estilos.conteudoCodigo,
  data: estilos.conteudoData,
  acoes: estilos.conteudoAcoes,
};

/**
 * O conteúdo da célula na espécie da coluna dela. Ele roda dentro da tabela, onde o estado dela tem
 * as colunas: a célula em si é montada antes, na coleção do React Aria, sem esse estado.
 */
function ConteudoDaCelula({
  indice,
  children,
}: {
  indice: number | null | undefined;
  children: ReactNode;
}) {
  const estado = useContext(TableStateContext);
  const especie =
    indice == null
      ? undefined
      : (estado?.collection.columns[indice]?.props?.['data-especie'] as
          | EspecieDaColuna
          | undefined);
  const classe = especie && CLASSE_DA_ESPECIE[especie];
  if (!classe) return children;
  return (
    <span className={classe} data-especie={especie}>
      {children}
    </span>
  );
}

/** A célula segue a espécie da coluna dela; o alinhamento e o mono dados aqui valem sobre ela. */
export function Celula({ children, alinhamento = 'inicio', mono = false }: PropsDaCelula) {
  return (
    <Cell
      data-alinhamento={alinhamento === 'fim' ? 'fim' : undefined}
      data-mono={mono ? '' : undefined}
      className={estilos.celula}
    >
      {({ columnIndex }) => <ConteudoDaCelula indice={columnIndex}>{children}</ConteudoDaCelula>}
    </Cell>
  );
}

/** A coluna "Ações", à direita e sem ordenar, para os botões de cada linha. */
export function ColunaDeAcoes({
  children = 'Ações',
  ...resto
}: Omit<PropsDaColuna, 'children' | 'especie' | 'ordenavel'> & { children?: string }) {
  return (
    <Coluna {...resto} especie="acoes">
      {children}
    </Coluna>
  );
}

/** Preferências de tabela do usuário (seção Tabelas dos Ajustes), válidas em todas as tabelas. */
export interface PreferenciasDaTabela {
  linhasAlternadas: boolean;
  miniaturas: boolean;
  /** O resumo das colunas fora da área visível, ao parar o mouse 1,5 s sobre uma linha. */
  resumoDaLinha: boolean;
}

const PreferenciasDaTabelaContexto = createContext<PreferenciasDaTabela>({
  linhasAlternadas: true,
  miniaturas: true,
  resumoDaLinha: true,
});

/** O app passa as preferências de tabela do usuário a todas as tabelas abaixo dele. */
export function ProvedorDaTabela({
  linhasAlternadas = true,
  miniaturas = true,
  resumoDaLinha = true,
  children,
}: Partial<PreferenciasDaTabela> & { children: ReactNode }) {
  return (
    <PreferenciasDaTabelaContexto.Provider value={{ linhasAlternadas, miniaturas, resumoDaLinha }}>
      {children}
    </PreferenciasDaTabelaContexto.Provider>
  );
}

/**
 * A coluna da miniatura, no início da linha. Com as miniaturas desligadas, ela e as células dela
 * não se desenham: esconder só por CSS poria o foco das setas numa célula invisível.
 */
export function ColunaDaMiniatura({ children = 'Imagem' }: { children?: string }) {
  const { miniaturas } = useContext(PreferenciasDaTabelaContexto);
  const { miniatura } = useContext(LargurasDaTabelaContexto);
  if (!miniaturas) return null;
  // Na tabela redimensionável, a largura é a da miniatura e das margens da célula, e não muda.
  return (
    <Coluna id="miniatura" rotuloOculto largura={miniatura + 24}>
      {children}
    </Coluna>
  );
}

export function CelulaDaMiniatura({ children }: { children: ReactNode }) {
  const { miniaturas } = useContext(PreferenciasDaTabelaContexto);
  if (!miniaturas) return null;
  return <Celula>{children}</Celula>;
}

export interface PropsDaContagemDaSelecao {
  /** Quantas linhas estão selecionadas. */
  quantas: number;
  aoLimpar: () => void;
}

/**
 * Quantas linhas estão selecionadas, como "3 selecionados", com "Limpar seleção". A contagem é
 * anunciada ao leitor de tela, e o anúncio fica montado mesmo sem seleção, para valer na primeira.
 */
export function ContagemDaSelecao({ quantas, aoLimpar }: PropsDaContagemDaSelecao) {
  return (
    <span className={estilos.contagemDaSelecao}>
      <span role="status">
        {quantas === 0 ? '' : quantas === 1 ? '1 selecionado' : `${quantas} selecionados`}
      </span>
      {quantas > 0 && (
        <Botao nivel="terciario" onPress={aoLimpar}>
          Limpar seleção
        </Botao>
      )}
    </span>
  );
}
