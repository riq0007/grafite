import { Ellipsis } from 'lucide-react';
import {
  type CSSProperties,
  type FocusEvent,
  type PointerEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Button, type PressEvent } from 'react-aria-components';
import { Dica } from '../componentes/flutuante/Dica.tsx';
import { ItemDeMenu, Menu, Separador, Submenu } from '../componentes/menu/Menu.tsx';
import { Icone } from '../icones/Icone.tsx';
import { ampliar } from './ampliacao.ts';
import estilos from './Dock.module.css';
import { itensDoMenu } from './itensDoMenu.tsx';
import { MenuDoDock } from './MenuDoDock.tsx';
import { criarMenusDoDock, type MenusDoDock } from './menusDoDock.ts';
import { criarOcultarDoDock, type OcultarDoDock } from './ocultarDoDock.ts';
import type { ModuloDaCasca, PosicaoDoDock } from './tipos.ts';

export interface PropsDoDock {
  modulos: readonly ModuloDaCasca[];
  /**
   * Módulos que a conta tirou do dock: ficam no menu Mais, depois dos que não couberam (spec dock,
   * "Módulos excedentes no botão Mais").
   */
  modulosNoMais?: readonly ModuloDaCasca[];
  /** Módulos isolados por um separador, no fim do dock (Ajustes). */
  modulosDoFim?: readonly ModuloDaCasca[];
  /** Id do módulo atual. */
  atual: string | null;
  posicao: PosicaoDoDock;
  /** Lado do item em px, de 28 a 64 (preferência do usuário). */
  tamanho: number;
  /** Ampliação ao passar o mouse (preferência do usuário). */
  ampliar: boolean;
  /** Ocultar automático (preferência do usuário). */
  ocultar: boolean;
  aoAbrirModulo: (id: string) => void;
  aoEscolherItem: (idDoModulo: string, idDoItem: string) => void;
}

/** A seta que aponta para longe da borda do dock abre o menu do item. */
const SETA_DO_MENU = { embaixo: 'ArrowUp', esquerda: 'ArrowRight', direita: 'ArrowLeft' } as const;

/** A dica do nome sai para dentro da tela, do lado oposto à borda do dock. */
const LADO_DA_DICA = { embaixo: 'top', esquerda: 'right', direita: 'left' } as const;
const MAIS: ModuloDaCasca = { id: '@mais', nome: 'Mais', icone: Ellipsis, menu: [] };

/** Nenhum módulo tirado do dock: a mesma lista a cada desenho. */
const NENHUM_MODULO: readonly ModuloDaCasca[] = [];

/**
 * Dock da casca: um item por módulo, com o módulo atual marcado e Ajustes isolado no fim.
 * Material translúcido das camadas sobrepostas, sólido com a transparência reduzida.
 *
 * O botão Mais traz os módulos que não couberam e os que a conta tirou do dock. Só com os tirados,
 * ele fica depois dos módulos, antes do separador de Ajustes, e a ampliação continua. Com módulos
 * que não couberam, ele fica no último lugar, sem o separador, e a ampliação fica suspensa.
 */
export function Dock({
  modulos,
  modulosNoMais = NENHUM_MODULO,
  modulosDoFim = [],
  atual,
  posicao,
  tamanho,
  ampliar: comAmpliacao,
  ocultar,
  aoAbrirModulo,
  aoEscolherItem,
}: PropsDoDock) {
  const vertical = posicao !== 'embaixo';
  const trilhoRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const itensRef = useRef<HTMLDivElement>(null);
  const fundoRef = useRef<HTMLDivElement>(null);
  const [limite, definirLimite] = useState(Number.POSITIVE_INFINITY);
  const [maisAberto, definirMaisAberto] = useState(false);
  const todos = [...modulos, ...modulosDoFim];
  const excedentes = todos.slice(limite);
  const temExcedentes = excedentes.length > 0;
  // O menu Mais: os que não couberam e, depois deles, os que a conta tirou do dock.
  const noMais = [...excedentes, ...modulosNoMais];
  const temMais = noMais.length > 0;
  const visiveis = temExcedentes ? todos.slice(0, limite) : todos;
  // A ordem das setas: o Mais no último lugar ou, só com os tirados, antes de Ajustes.
  const ordem = temExcedentes
    ? [...visiveis, MAIS]
    : temMais
      ? [...modulos, MAIS, ...modulosDoFim]
      : visiveis;
  const ampliacao = useAmpliacao({
    itensRef,
    fundoRef,
    tamanho,
    posicao,
    ativa: comAmpliacao && !temExcedentes,
  });
  const { visivel, maquina } = useOcultar(ocultar);
  const botoes = useRef(new Map<string, HTMLElement>());
  const [aberto, menus] = useMenusDoDock();
  const [abertoPeloTeclado, definirAbertoPeloTeclado] = useState(false);
  // Conta as aberturas pelo teclado: o menu monta de novo a cada uma e leva o foco ao primeiro item,
  // também quando o painel anterior ainda sai da tela e seria reaproveitado.
  const [aberturasPeloTeclado, definirAberturasPeloTeclado] = useState(0);
  // Parada única do Tab (índice móvel): o último item com foco; de início, o módulo atual.
  const [paradaDoTab, definirParadaDoTab] = useState<string | undefined>(undefined);
  const parada = ordem.some((modulo) => modulo.id === paradaDoTab)
    ? paradaDoTab
    : (
        ordem.find((modulo) => modulo.id === atual) ??
        (noMais.some((modulo) => modulo.id === atual) ? MAIS : ordem[0])
      )?.id;

  useLayoutEffect(() => {
    const trilho = trilhoRef.current;
    const nav = navRef.current;
    const itens = itensRef.current;
    if (!trilho || !nav || !itens || typeof ResizeObserver === 'undefined') return;
    const medir = () => {
      const estilo = getComputedStyle(nav);
      const espaco = vertical ? trilho.clientHeight : trilho.clientWidth;
      const bordas = vertical
        ? [estilo.paddingTop, estilo.paddingBottom]
        : [estilo.paddingLeft, estilo.paddingRight];
      const disponivel = espaco - bordas.reduce((soma, borda) => soma + parseFloat(borda), 0);
      const gap = parseFloat(getComputedStyle(itens).gap);
      if (espaco === 0 || !Number.isFinite(gap)) return;
      // O separador tem 1 px, margens de 0,75 do gap e um gap adicional no eixo.
      const separador = modulosDoFim.length > 0 ? 1 + 2.5 * gap : 0;
      // O Mais dos módulos tirados ocupa um lugar mesmo quando todos cabem.
      const lugares = todos.length + (modulosNoMais.length > 0 ? 1 : 0);
      const total = lugares * (tamanho + gap) - gap + separador;
      definirLimite(
        total <= disponivel
          ? Number.POSITIVE_INFINITY
          : Math.max(0, Math.floor((disponivel + gap) / (tamanho + gap)) - 1),
      );
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(trilho);
    return () => observador.disconnect();
  }, [vertical, tamanho, todos.length, modulosDoFim.length, modulosNoMais.length]);

  useEffect(() => {
    if (!temMais) definirMaisAberto(false);
  }, [temMais]);

  const focarItem = (id: string | undefined) => {
    if (id !== undefined) botoes.current.get(id)?.focus();
  };

  // Toque ou clique fora do dock e dos menus fecha o menu aberto.
  useEffect(() => {
    if (aberto === null) return;
    const aoTocar = (evento: globalThis.PointerEvent) => {
      const alvo = evento.target instanceof Element ? evento.target : null;
      if (navRef.current?.contains(alvo)) return;
      if (alvo?.closest('[data-menu-do-dock], [role="menu"]')) return;
      menus.fecharAgora();
    };
    document.addEventListener('pointerdown', aoTocar, true);
    return () => document.removeEventListener('pointerdown', aoTocar, true);
  }, [aberto, menus]);

  // Com um menu aberto, o ocultar automático não esconde o dock.
  useEffect(() => {
    if (aberto === null && !(temMais && maisAberto)) maquina.menuFechou();
    else maquina.menuAbriu();
  }, [aberto, maquina, temMais, maisAberto]);

  const item = (modulo: ModuloDaCasca) => (
    <ItemDoDock
      key={modulo.id}
      modulo={modulo}
      atual={modulo.id === atual || (modulo === MAIS && noMais.some(({ id }) => id === atual))}
      tamanho={tamanho}
      ladoDaDica={LADO_DA_DICA[posicao]}
      menuAberto={modulo === MAIS ? maisAberto : aberto === modulo.id}
      naOrdemDoTab={modulo.id === parada}
      aoReceberFoco={() => definirParadaDoTab(modulo.id)}
      registrar={(botao) => {
        if (botao) botoes.current.set(modulo.id, botao);
        else botoes.current.delete(modulo.id);
      }}
      aoEntrar={() => menus.entrarNoItem(modulo.id, modulo !== MAIS && Boolean(modulo.menu))}
      aoSair={() => menus.sairDoItem()}
      aoPressionar={
        modulo === MAIS
          ? undefined
          : (evento) => {
              // No toque, o primeiro toque num item com menu abre o menu, sem os atrasos do ponteiro.
              if (evento.pointerType === 'touch' && modulo.menu) {
                definirAbertoPeloTeclado(false);
                if (aberto === modulo.id) menus.fecharAgora();
                else menus.abrirAgora(modulo.id);
                return;
              }
              aoAbrirModulo(modulo.id);
            }
      }
      aoTeclar={(tecla) => {
        // As setas na direção do dock andam entre os itens, sem dar a volta.
        const indice = ordem.findIndex((outro) => outro.id === modulo.id);
        const [anterior, proxima] = vertical
          ? ['ArrowUp', 'ArrowDown']
          : ['ArrowLeft', 'ArrowRight'];
        if (tecla === proxima) focarItem(ordem[indice + 1]?.id);
        else if (tecla === anterior) focarItem(ordem[indice - 1]?.id);
        else if (tecla === 'Home') focarItem(ordem[0]?.id);
        else if (tecla === 'End') focarItem(ordem.at(-1)?.id);
        else if (tecla === SETA_DO_MENU[posicao] && modulo.menu && modulo !== MAIS) {
          definirAbertoPeloTeclado(true);
          definirAberturasPeloTeclado((vezes) => vezes + 1);
          menus.abrirAgora(modulo.id);
        } else return false;
        return true;
      }}
    />
  );

  const aoPerderFoco = (evento: FocusEvent) => {
    if (!navRef.current?.contains(evento.relatedTarget as Node | null)) maquina.focoSaiu();
  };

  const menuMais = temMais && (
    <Menu
      rotulo="Mais módulos"
      gatilho={item(MAIS)}
      posicao={LADO_DA_DICA[posicao]}
      aoMudarAberto={(abriu) => {
        definirMaisAberto(abriu);
        if (abriu) menus.fecharAgora();
      }}
    >
      {noMais.map((modulo) =>
        modulo.menu?.length ? (
          <Submenu key={modulo.id} rotulo={modulo.nome}>
            <ItemDeMenu
              onAction={() => aoAbrirModulo(modulo.id)}
            >{`Abrir ${modulo.nome}`}</ItemDeMenu>
            <Separador />
            {itensDoMenu(modulo.menu, (id) => aoEscolherItem(modulo.id, id))}
          </Submenu>
        ) : (
          <ItemDeMenu
            key={modulo.id}
            icone={modulo.icone}
            onAction={() => aoAbrirModulo(modulo.id)}
          >
            {modulo.nome}
          </ItemDeMenu>
        ),
      )}
    </Menu>
  );

  return (
    <>
      {ocultar && (
        <div
          className={estilos.faixa}
          data-posicao={posicao}
          data-parte="faixa"
          aria-hidden="true"
          onPointerEnter={() => maquina.entrarNaFaixa()}
        />
      )}
      <div ref={trilhoRef} className={estilos.trilho} data-posicao={posicao}>
        <nav
          ref={navRef}
          aria-label="Dock"
          className={estilos.dock}
          data-montagem="dock"
          data-posicao={posicao}
          data-oculto={visivel ? undefined : ''}
          style={{ '--tamanho-item-dock': `${tamanho}px` } as CSSProperties}
          onPointerEnter={() => maquina.entrarNoDock()}
          onPointerMove={ampliacao.aoMoverPonteiro}
          onPointerLeave={() => {
            maquina.sairDoDock();
            ampliacao.aoSairPonteiro();
          }}
          onFocus={() => maquina.focoEntrou()}
          onBlur={aoPerderFoco}
        >
          <div ref={fundoRef} className={estilos.fundo} data-parte="fundo" aria-hidden="true" />
          <div
            ref={itensRef}
            role="toolbar"
            aria-label="Módulos"
            aria-orientation={vertical ? 'vertical' : 'horizontal'}
            className={estilos.itens}
          >
            {visiveis.slice(0, modulos.length).map(item)}
            {!temExcedentes && menuMais}
            {!temExcedentes && modulosDoFim.length > 0 && (
              <hr
                aria-orientation={vertical ? 'horizontal' : 'vertical'}
                className={estilos.separador}
                data-parte="separador"
              />
            )}
            {visiveis.slice(modulos.length).map(item)}
            {temExcedentes && menuMais}
          </div>
        </nav>
      </div>
      {visiveis
        .filter((modulo) => modulo.menu)
        .map((modulo) => (
          <MenuDoDock
            key={modulo.id}
            modulo={modulo}
            aberto={aberto === modulo.id}
            gatilho={{ current: botoes.current.get(modulo.id) ?? null }}
            posicao={posicao}
            focoNoPrimeiro={abertoPeloTeclado}
            aberturaPeloTeclado={aberturasPeloTeclado}
            aoEntrarComOPonteiro={() => menus.entrarNoMenu()}
            aoSairComOPonteiro={() => menus.sairDoMenu()}
            aoEscolher={(idDoItem) => {
              aoEscolherItem(modulo.id, idDoItem);
              menus.fecharAgora();
            }}
            aoFechar={(peloTeclado) => {
              menus.fecharAgora();
              definirAbertoPeloTeclado(false);
              // Esc devolve o foco ao item do dock de onde o menu saiu.
              if (peloTeclado) focarItem(modulo.id);
            }}
          />
        ))}
    </>
  );
}

interface PropsDoItemDoDock {
  modulo: ModuloDaCasca;
  atual: boolean;
  tamanho: number;
  ladoDaDica: 'top' | 'right' | 'left';
  menuAberto: boolean;
  naOrdemDoTab: boolean;
  aoReceberFoco: () => void;
  registrar: (botao: HTMLButtonElement | null) => void;
  aoEntrar: () => void;
  aoSair: () => void;
  aoPressionar?: (evento: PressEvent) => void;
  /** Trata uma tecla do item; devolve false para ela seguir até a barra (setas e Tab). */
  aoTeclar: (tecla: string) => boolean;
}

function ItemDoDock({
  modulo,
  atual,
  tamanho,
  ladoDaDica,
  menuAberto,
  naOrdemDoTab,
  aoReceberFoco,
  registrar,
  aoEntrar,
  aoSair,
  aoPressionar,
  aoTeclar,
}: PropsDoItemDoDock) {
  const botao = (
    <Button
      ref={registrar}
      aria-label={modulo.nome}
      aria-current={atual ? 'page' : undefined}
      aria-haspopup={modulo.menu ? 'menu' : undefined}
      aria-expanded={modulo.menu ? menuAberto : undefined}
      className={estilos.item}
      data-parte="item"
      data-menu-aberto={menuAberto || undefined}
      excludeFromTabOrder={!naOrdemDoTab}
      onFocus={aoReceberFoco}
      // O hover do React Aria ignora o toque: os atrasos só valem para o mouse.
      onHoverStart={aoEntrar}
      onHoverEnd={aoSair}
      onPress={aoPressionar}
      onKeyDown={(evento) => {
        if (aoTeclar(evento.key)) evento.preventDefault();
        else evento.continuePropagation();
      }}
    >
      <Icone icone={modulo.icone} tamanho={Math.round(tamanho * 0.48)} />
      {atual && <span className={estilos.ponto} data-parte="ponto" aria-hidden="true" />}
    </Button>
  );
  // Num item com menu, o nome aparece no topo do menu; sem menu, numa dica.
  return modulo.menu ? (
    botao
  ) : (
    <Dica texto={modulo.nome} posicao={ladoDaDica}>
      {botao}
    </Dica>
  );
}

/** Mesma regra do CSS dos tokens: sem atributo, vale o sistema; "reduzido" força a redução. */
function movimentoReduzido(): boolean {
  const escolhido = document.documentElement.getAttribute('data-motion');
  if (escolhido !== null) return escolhido === 'reduzido';
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Fração do caminho até o alvo que a ampliação anda a cada quadro. */
const SUAVIZACAO = 0.3;

interface OpcoesDaAmpliacao {
  itensRef: RefObject<HTMLDivElement | null>;
  fundoRef: RefObject<HTMLDivElement | null>;
  tamanho: number;
  posicao: PosicaoDoDock;
  ativa: boolean;
}

/**
 * Ampliação sob o ponteiro (design, decisão 7): um laço por quadro escreve só transform nos
 * itens e estende o fundo, sem renderizar o React nem mudar o layout da janela.
 */
/** Para que lado o fundo cresce na direção cruzada: para dentro da tela, a partir da borda. */
const SENTIDO_DO_CRESCIMENTO = { embaixo: -1, esquerda: 1, direita: -1 } as const;

function useAmpliacao({ itensRef, fundoRef, tamanho, posicao, ativa }: OpcoesDaAmpliacao) {
  const vertical = posicao !== 'embaixo';
  const estado = useRef({
    ponteiro: null as number | null,
    centros: [] as number[],
    escalas: [] as number[],
    deslocamentos: [] as number[],
    quadro: 0,
  });

  const itens = () =>
    Array.from(itensRef.current?.querySelectorAll<HTMLElement>('[data-parte="item"]') ?? []);

  /** Centros em repouso no eixo do dock; o transform não afeta offsetLeft e offsetTop. */
  const medir = () => {
    const caixa = itensRef.current;
    if (!caixa) return [];
    return itens().map((item) =>
      vertical
        ? item.offsetTop - caixa.offsetTop + item.offsetHeight / 2
        : item.offsetLeft - caixa.offsetLeft + item.offsetWidth / 2,
    );
  };

  const desenhar = () => {
    const s = estado.current;
    const alvo = ampliar(s.centros, tamanho, s.ponteiro);
    let parado = true;
    const aproximar = (atual: number, destino: number, tolerancia: number) => {
      const proximo = atual + (destino - atual) * SUAVIZACAO;
      if (Math.abs(destino - proximo) < tolerancia) return destino;
      parado = false;
      return proximo;
    };
    s.escalas = alvo.escalas.map((escala, i) => aproximar(s.escalas[i] ?? 1, escala, 0.002));
    s.deslocamentos = alvo.deslocamentos.map((d, i) => aproximar(s.deslocamentos[i] ?? 0, d, 0.1));

    // Quanto o fundo precisa se estender além das pontas em repouso para cobrir os ampliados.
    const pontaInicial = (s.centros[0] ?? 0) - tamanho / 2;
    const pontaFinal = (s.centros.at(-1) ?? 0) + tamanho / 2;
    let estenderInicio = 0;
    let estenderFim = 0;
    // Os itens crescem a partir da borda do dock; o fundo cresce junto, para dentro da tela.
    let estenderAltura = 0;
    itens().forEach((item, i) => {
      const escala = s.escalas[i] ?? 1;
      const deslocamento = s.deslocamentos[i] ?? 0;
      item.style.transform =
        escala === 1 && deslocamento === 0
          ? ''
          : `${vertical ? 'translateY' : 'translateX'}(${deslocamento}px) scale(${escala})`;
      const centro = (s.centros[i] ?? 0) + deslocamento;
      const metade = (escala * tamanho) / 2;
      estenderInicio = Math.max(estenderInicio, pontaInicial - (centro - metade));
      estenderFim = Math.max(estenderFim, centro + metade - pontaFinal);
      estenderAltura = Math.max(estenderAltura, (escala - 1) * tamanho);
    });
    fundoRef.current?.style.setProperty('--estender-inicio', `${estenderInicio}px`);
    fundoRef.current?.style.setProperty('--estender-fim', `${estenderFim}px`);
    fundoRef.current?.style.setProperty('--estender-altura', `${estenderAltura}px`);

    // O separador segue a borda do item antes dele e fica no meio do dock que cresceu.
    const separador = itensRef.current?.querySelector<HTMLElement>('[data-parte="separador"]');
    if (separador) {
      const i = itens().indexOf(separador.previousElementSibling as HTMLElement);
      const noEixo =
        i < 0 ? 0 : (s.deslocamentos[i] ?? 0) + (((s.escalas[i] ?? 1) - 1) * tamanho) / 2;
      const cruzado = (SENTIDO_DO_CRESCIMENTO[posicao] * estenderAltura) / 2;
      separador.style.transform =
        noEixo === 0 && cruzado === 0
          ? ''
          : vertical
            ? `translate(${cruzado}px, ${noEixo}px)`
            : `translate(${noEixo}px, ${cruzado}px)`;
    }
    s.quadro = parado ? 0 : requestAnimationFrame(desenhar);
  };

  const animar = () => {
    if (!estado.current.quadro) estado.current.quadro = requestAnimationFrame(desenhar);
  };

  useEffect(() => {
    const s = estado.current;
    return () => cancelAnimationFrame(s.quadro);
  }, []);

  // Desligada pela preferência: volta todos os itens ao repouso.
  useEffect(() => {
    if (!ativa && estado.current.ponteiro !== null) {
      estado.current.ponteiro = null;
      animar();
    }
  });

  return {
    aoMoverPonteiro(evento: PointerEvent) {
      if (!ativa || evento.pointerType === 'touch' || movimentoReduzido()) return;
      const caixa = itensRef.current?.getBoundingClientRect();
      if (!caixa) return;
      const s = estado.current;
      if (s.ponteiro === null) s.centros = medir();
      s.ponteiro = vertical ? evento.clientY - caixa.top : evento.clientX - caixa.left;
      animar();
    },
    aoSairPonteiro() {
      estado.current.ponteiro = null;
      animar();
    },
  };
}

/** Liga os menus do dock à máquina pura (design, decisão 8). */
function useMenusDoDock(): [string | null, MenusDoDock] {
  const [aberto, definirAberto] = useState<string | null>(null);
  const menus = useRef<MenusDoDock | null>(null);
  if (menus.current === null) menus.current = criarMenusDoDock({ aoMudar: definirAberto });
  useEffect(() => () => menus.current?.descartar(), []);
  return [aberto, menus.current];
}

/** Liga o ocultar automático à máquina pura (design, decisão 8). */
function useOcultar(ligado: boolean): { visivel: boolean; maquina: OcultarDoDock } {
  const [visivel, definirVisivel] = useState(!ligado);
  const maquina = useRef<OcultarDoDock | null>(null);
  if (maquina.current === null) {
    maquina.current = criarOcultarDoDock({ ligado, aoMudar: definirVisivel });
  }
  useEffect(() => {
    maquina.current?.ligar(ligado);
  }, [ligado]);
  useEffect(() => () => maquina.current?.descartar(), []);
  return { visivel, maquina: maquina.current };
}
