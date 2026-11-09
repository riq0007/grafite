import { X } from 'lucide-react';
import { type CSSProperties, type ReactNode, type RefObject, useLayoutEffect, useRef } from 'react';
import {
  type AriaTabListProps,
  mergeProps,
  useFocusRing,
  useHover,
  useTab,
  useTabList,
  useTabPanel,
} from 'react-aria';
import { Button } from 'react-aria-components';
import { Item, type Node, type TabListState, useTabListState } from 'react-stately';
import { Icone } from '../icones/Icone.tsx';
import estilos from './AbasDaJanela.module.css';
import { RolagemDaJanela } from './RolagemDaJanela.tsx';

export interface AbaNaJanela {
  id: string;
  titulo: string;
  /** Se a aba tem o botão de fechar; a primeira, a da tela, não tem. */
  fechavel?: boolean;
  /**
   * A chave do conteúdo, como o caminho da tela da primeira aba: quando ela muda, a aba volta ao
   * começo da rolagem, porque é outra tela.
   */
  chave?: string;
  conteudo: ReactNode;
}

export interface PropsDasAbasDaJanela {
  abas: readonly AbaNaJanela[];
  /** O id da aba da frente. */
  frente: string;
  /** A aba escolhida pelo mouse, pelo toque ou pelo Enter e o espaço. */
  aoEscolher: (id: string) => void;
  /** O botão de fechar da aba foi escolhido; quem usa a barra decide se ela fecha. */
  aoFechar: (id: string) => void;
}

/**
 * As abas da janela de conteúdo: a barra no topo, só com mais de uma aba, e o painel de cada aba,
 * na área que rola abaixo dela. Todos os painéis ficam montados, sempre no mesmo lugar da árvore, e
 * os de trás ficam escondidos e inertes, com o que foi preenchido neles e o ponto da rolagem. As
 * setas, o Home e o End andam entre as abas, e o Enter e o espaço trazem a escolhida para a frente.
 *
 * O botão de fechar não cabe dentro da aba, que não aceita elementos interativos, nem na lista,
 * que só aceita abas: os botões ficam na mesma grade da lista, cada um na coluna logo depois da
 * aba dele, e o teclado chega a eles depois da lista.
 */
export function AbasDaJanela({ abas, frente, aoEscolher, aoFechar }: PropsDasAbasDaJanela) {
  const propsDaLista: AriaTabListProps<AbaNaJanela> = {
    'aria-label': 'Abas da janela',
    items: abas,
    children: (aba) => <Item key={aba.id}>{aba.titulo}</Item>,
    selectedKey: frente,
    onSelectionChange: (id) => aoEscolher(String(id)),
    keyboardActivation: 'manual',
  };
  const estado = useTabListState(propsDaLista);
  const lista = useRef<HTMLDivElement>(null);
  const { tabListProps } = useTabList(propsDaLista, estado, lista);
  const barra = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const comBarra = abas.length > 1;
  useRolagemDeCadaAba(area, abas, frente);

  // A aba da frente fica à vista, também quando a barra aparece já com muitas abas.
  useLayoutEffect(() => {
    if (comBarra && barra.current) mostrarNaBarra(barra.current, frente);
  }, [comBarra, frente]);

  return (
    <>
      {comBarra && (
        <div ref={barra} className={estilos.barra} data-barra-de-abas="">
          <div
            className={estilos.trilho}
            style={{ '--colunas-das-abas': abas.length * 2 } as CSSProperties}
          >
            <div {...tabListProps} ref={lista} className={estilos.lista}>
              {[...estado.collection].map((item, indice) => (
                <Aba
                  key={item.key}
                  item={item}
                  estado={estado}
                  posicao={indice + 1}
                  total={abas.length}
                  fechavel={Boolean(abas[indice]?.fechavel)}
                  barra={barra}
                />
              ))}
            </div>
            {abas.map((aba, indice) =>
              aba.fechavel ? (
                <Button
                  key={aba.id}
                  aria-label={`Fechar ${aba.titulo}`}
                  className={estilos.fechar}
                  data-da-aba={aba.id}
                  data-frente={aba.id === frente || undefined}
                  style={{ gridColumn: indice * 2 + 2 }}
                  onPress={() => aoFechar(aba.id)}
                  onFocus={() => barra.current && mostrarNaBarra(barra.current, aba.id)}
                >
                  <Icone icone={X} tamanho={14} />
                </Button>
              ) : null,
            )}
          </div>
        </div>
      )}
      <RolagemDaJanela ref={area} comBarra={comBarra}>
        {abas.map((aba) => (
          <Painel
            key={aba.id}
            id={aba.id}
            estado={estado}
            naFrente={aba.id === frente}
            comBarra={comBarra}
          >
            {aba.conteudo}
          </Painel>
        ))}
      </RolagemDaJanela>
    </>
  );
}

/**
 * O ponto da rolagem de cada aba: gravado a cada rolagem da aba da frente e aplicado quando outra
 * aba vem para a frente. A aba que vem pela primeira vez, ou a da frente cuja chave mudou, começa
 * no topo. Roda depois de os painéis trocarem e antes de a tela ser desenhada.
 */
function useRolagemDeCadaAba(
  area: RefObject<HTMLDivElement | null>,
  abas: readonly AbaNaJanela[],
  frente: string,
) {
  const posicoes = useRef(new Map<string, number>());
  const chaves = useRef(new Map<string, string | undefined>());
  const naFrente = useRef(frente);

  useLayoutEffect(() => {
    const elemento = area.current;
    if (!elemento) return;
    const gravar = () => posicoes.current.set(naFrente.current, elemento.scrollTop);
    elemento.addEventListener('scroll', gravar, { passive: true });
    return () => elemento.removeEventListener('scroll', gravar);
  }, [area]);

  useLayoutEffect(() => {
    let aplicar = naFrente.current !== frente;
    for (const aba of abas) {
      if (chaves.current.has(aba.id) && chaves.current.get(aba.id) !== aba.chave) {
        posicoes.current.delete(aba.id);
        if (aba.id === frente) aplicar = true;
      }
      chaves.current.set(aba.id, aba.chave);
    }
    const abertas = new Set(abas.map((aba) => aba.id));
    for (const id of [...chaves.current.keys()]) {
      if (!abertas.has(id)) {
        chaves.current.delete(id);
        posicoes.current.delete(id);
      }
    }
    naFrente.current = frente;
    if (aplicar && area.current) area.current.scrollTop = posicoes.current.get(frente) ?? 0;
  }, [area, abas, frente]);
}

interface PropsDaAba {
  item: Node<AbaNaJanela>;
  estado: TabListState<AbaNaJanela>;
  posicao: number;
  total: number;
  fechavel: boolean;
  barra: RefObject<HTMLDivElement | null>;
}

/** Uma aba da barra, com a posição dela para o leitor de tela. */
function Aba({ item, estado, posicao, total, fechavel, barra }: PropsDaAba) {
  const ref = useRef<HTMLDivElement>(null);
  const { tabProps, isSelected } = useTab({ key: item.key }, estado, ref);
  const { focusProps, isFocusVisible } = useFocusRing();
  const { hoverProps, isHovered } = useHover({});
  const id = String(item.key);
  return (
    <div
      {...mergeProps(tabProps, focusProps, hoverProps, {
        'aria-posinset': posicao,
        'aria-setsize': total,
        onFocus: () => barra.current && mostrarNaBarra(barra.current, id),
      })}
      ref={ref}
      className={estilos.aba}
      data-da-aba={id}
      data-frente={isSelected || undefined}
      data-fechavel={fechavel || undefined}
      data-focus-visible={isFocusVisible || undefined}
      data-hovered={isHovered || undefined}
      style={{ gridColumn: posicao * 2 - 1 }}
    >
      {item.rendered}
    </div>
  );
}

interface PropsDoPainel {
  id: string;
  estado: TabListState<AbaNaJanela>;
  naFrente: boolean;
  comBarra: boolean;
  children: ReactNode;
}

/**
 * O painel de uma aba, marcado com o id dela para quem usa a barra achar o conteúdo, como o título
 * que recebe o foco. Só o da frente é o painel das abas, ligado à aba dele; o de trás fica
 * escondido pelo `hidden`, que o tira da tela e do leitor de tela, e inerte. Sem a barra, o
 * painel único é só o conteúdo.
 */
function Painel({ id, estado, naFrente, comBarra, children }: PropsDoPainel) {
  const ref = useRef<HTMLDivElement>(null);
  // O id do painel vem da aba dele, e não da escolhida: o painel montado atrás, que vem para a
  // frente depois, continua com o id que a aba dele aponta.
  const { tabPanelProps } = useTabPanel({ id }, estado, ref);
  return (
    <div
      {...(comBarra && naFrente ? tabPanelProps : {})}
      ref={ref}
      data-aba-da-janela={id}
      className={estilos.painel}
      hidden={!naFrente || undefined}
      inert={!naFrente || undefined}
    >
      {children}
    </div>
  );
}

/** Rola a barra só de lado, até a aba, com o botão de fechar dela, ficar inteira à vista. */
function mostrarNaBarra(barra: HTMLElement, id: string) {
  const partes = [...barra.querySelectorAll<HTMLElement>(`[data-da-aba="${CSS.escape(id)}"]`)];
  if (partes.length === 0) return;
  const area = barra.getBoundingClientRect();
  const esquerda = Math.min(...partes.map((parte) => parte.getBoundingClientRect().left));
  const direita = Math.max(...partes.map((parte) => parte.getBoundingClientRect().right));
  if (esquerda < area.left) barra.scrollLeft -= area.left - esquerda;
  else if (direita > area.right) barra.scrollLeft += direita - area.right;
}
