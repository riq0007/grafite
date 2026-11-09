// Liga a prévia (Quick Look) a uma tabela base (spec quick-look; design do F1b, decisão 8, e do
// P1c, decisão 9): o espaço na linha em foco abre, as setas trocam de registro na ordem da tabela, e
// ao fechar o foco vai à linha do registro que estava na prévia. Numa lista paginada, a posição conta
// o total, e a seta que passa do último carregado traz a página seguinte; com linhas selecionadas, a
// prévia passa só por elas.
import { useEffect, useRef, useState } from 'react';
import { PEDIDO_DE_FOCO_DA_LINHA } from '../tabela/pedidoDeFoco.ts';

export interface ControleDaPrevia<T> {
  aberta: boolean;
  /** O registro na prévia; durante a espera da página seguinte, o último carregado. */
  item: T | undefined;
  /** Posição do registro na lista, a partir de 1. */
  posicao: number;
  total: number;
  /** A página seguinte está a caminho: a prévia mostra o esqueleto até o registro chegar. */
  carregando: boolean;
  /** Para o `aoPreverLinha` da tabela. */
  aoPreverLinha: (chave: string) => void;
  aoFechar: () => void;
  /** Sem ele, é o primeiro registro. */
  aoAnterior: (() => void) | undefined;
  /** Sem ele, é o último registro. */
  aoSeguinte: (() => void) | undefined;
}

export interface OpcoesDaPrevia {
  /** O total da lista paginada: a posição o conta, e não só os registros carregados. */
  total?: number;
  /** A página seguinte da lista paginada, como a tabela a pede. */
  carregarMais?: { haMais: boolean; carregando: boolean; aoCarregar: () => void };
  /** As linhas selecionadas: aberta numa delas, com mais de uma, a prévia passa só por elas. */
  selecao?: ReadonlySet<string>;
}

/** A tabela de onde a prévia abre: a grade do React Aria, virtualizada ou não. */
const GRADE = '[role="grid"], [role="treegrid"], table';

export function usePrevia<T>(
  itens: readonly T[],
  chaveDe: (item: T) => string,
  { total, carregarMais, selecao }: OpcoesDaPrevia = {},
): ControleDaPrevia<T> {
  const [atual, definirAtual] = useState<string | null>(null);
  /** Aberta numa linha da seleção, com mais de uma: a prévia passa só pelos selecionados. */
  const [soSelecao, definirSoSelecao] = useState(false);
  /** O último registro carregado, enquanto a página seguinte não chega. */
  const [esperando, definirEsperando] = useState<string | null>(null);
  /** A tabela de onde a prévia foi aberta: é nela que o foco volta à linha. */
  const tabela = useRef<Element | null>(null);
  /** A chave do registro que estava na prévia quando ela fechou. */
  const aoFecharVoltaA = useRef<string | null>(null);

  const lista = soSelecao && selecao ? itens.filter((item) => selecao.has(chaveDe(item))) : itens;
  const indice = atual === null ? -1 : lista.findIndex((item) => chaveDe(item) === atual);
  const aberta = indice >= 0;
  const irPara = (posicao: number) => {
    const item = lista[posicao];
    return item === undefined ? undefined : () => definirAtual(chaveDe(item));
  };

  // A página seguinte chegou com o registro depois do último: a prévia passa a ele. A carga que
  // termina sem ele, ou o fim da lista, encerra a espera no registro de antes.
  const carregando = carregarMais?.carregando ?? false;
  const carregandoAntes = useRef(carregando);
  useEffect(() => {
    const antes = carregandoAntes.current;
    carregandoAntes.current = carregando;
    if (esperando === null) return;
    const ultimo = itens.findIndex((item) => chaveDe(item) === esperando);
    const seguinte = ultimo < 0 ? undefined : itens[ultimo + 1];
    if (seguinte !== undefined) {
      definirAtual(chaveDe(seguinte));
      definirEsperando(null);
    } else if (!carregarMais?.haMais || (antes && !carregando)) {
      definirEsperando(null);
    }
  });

  // Depois do render em que a prévia começa a sair, o foco vai à linha do registro mostrado. Fora
  // da camada, o React Aria não o devolve à linha de origem quando ela termina de sair. A linha que
  // a tabela virtualizada não desenha é pedida à tabela, que rola até ela.
  useEffect(() => {
    if (aberta || aoFecharVoltaA.current === null) return;
    const chave = aoFecharVoltaA.current;
    aoFecharVoltaA.current = null;
    const grade = tabela.current;
    const linha = grade?.querySelector<HTMLElement>(
      `[role="row"][data-key="${CSS.escape(chave)}"]`,
    );
    if (linha) linha.focus();
    else
      grade?.dispatchEvent(
        new CustomEvent(PEDIDO_DE_FOCO_DA_LINHA, { bubbles: true, detail: chave }),
      );
  }, [aberta]);

  const seguinte = aberta ? lista[indice + 1] : undefined;
  const podeCarregar = aberta && !soSelecao && seguinte === undefined && carregarMais?.haMais;
  return {
    aberta,
    item: aberta ? lista[indice] : undefined,
    posicao: indice + (esperando === null ? 1 : 2),
    total: soSelecao ? lista.length : Math.max(total ?? 0, itens.length),
    carregando: esperando !== null,
    aoPreverLinha: (chave) => {
      const linha = document.querySelector(`[role="row"][data-key="${CSS.escape(chave)}"]`);
      tabela.current = document.activeElement?.closest(GRADE) ?? linha?.closest(GRADE) ?? null;
      definirSoSelecao(selecao !== undefined && selecao.size > 1 && selecao.has(chave));
      definirEsperando(null);
      definirAtual(chave);
    },
    aoFechar: () => {
      aoFecharVoltaA.current = atual;
      definirEsperando(null);
      definirAtual(null);
    },
    aoAnterior: !aberta
      ? undefined
      : esperando !== null
        ? () => definirEsperando(null)
        : irPara(indice - 1),
    aoSeguinte:
      !aberta || esperando !== null
        ? undefined
        : seguinte !== undefined
          ? () => definirAtual(chaveDe(seguinte))
          : podeCarregar
            ? () => {
                definirEsperando(atual);
                if (!carregarMais.carregando) carregarMais.aoCarregar();
              }
            : undefined,
  };
}
