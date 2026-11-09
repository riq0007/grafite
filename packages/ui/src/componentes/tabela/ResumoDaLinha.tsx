// O resumo da linha (spec tabelas-configuraveis e componentes-base): a camada junto da linha com as
// colunas que estão fora da área visível, o rótulo e o valor de cada uma. Não recebe o foco nem o
// ponteiro: o mouse passa por ela até as linhas, e o resumo fecha quando ele vai para outra linha.
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import estilos from './ResumoDaLinha.module.css';

export interface ItemDoResumo {
  /** O id da coluna. */
  coluna: string;
  rotulo: string;
  /** O valor como a célula o mostra; o vazio aparece como "—". */
  valor: ReactNode;
}

/** Onde o mouse parou, na horizontal, e o alto e o pé da linha, nas coordenadas da janela. */
export interface PosicaoDoResumo {
  x: number;
  topo: number;
  base: number;
}

export interface PropsDoResumoDaLinha {
  itens: readonly ItemDoResumo[];
  posicao: PosicaoDoResumo;
}

/** O respiro entre o resumo e a linha, e entre ele e a borda da janela, em px. */
const RESPIRO = 8;

/** Com muitas colunas, o resumo se divide em até três partes lado a lado para caber na janela. */
const PARTES_NO_MAXIMO = 3;

const vazio = (valor: ReactNode) =>
  valor === null || valor === undefined || valor === false || valor === '';

interface Lugar {
  left: number;
  top: number;
  acima: boolean;
  partes: number;
}

/**
 * Abaixo da linha, a partir do ponto onde o mouse parou; sem espaço abaixo, acima dela. Ele nunca
 * cobre a linha que resume.
 */
export function ResumoDaLinha({ itens, posicao }: PropsDoResumoDaLinha) {
  const painel = useRef<HTMLDivElement>(null);
  const [lugar, definirLugar] = useState<Lugar | null>(null);
  // Mede antes de pintar: o primeiro quadro já sai no lugar, e cada parte a mais mede de novo.
  useLayoutEffect(() => {
    const elemento = painel.current;
    if (!elemento) return;
    const { offsetWidth: largura, offsetHeight: altura } = elemento;
    const abaixo = window.innerHeight - posicao.base - 2 * RESPIRO;
    const emCima = posicao.topo - 2 * RESPIRO;
    const acima = altura > abaixo && emCima > abaixo;
    const espaco = acima ? emCima : abaixo;
    const partes = lugar?.partes ?? 1;
    const novo: Lugar = {
      left: Math.max(RESPIRO, Math.min(posicao.x, window.innerWidth - largura - RESPIRO)),
      top: acima ? Math.max(RESPIRO, posicao.topo - RESPIRO - altura) : posicao.base + RESPIRO,
      acima,
      partes: altura > espaco && partes < PARTES_NO_MAXIMO ? partes + 1 : partes,
    };
    if (
      !lugar ||
      lugar.left !== novo.left ||
      lugar.top !== novo.top ||
      lugar.acima !== novo.acima ||
      lugar.partes !== novo.partes
    ) {
      definirLugar(novo);
    }
  });
  return createPortal(
    <div
      ref={painel}
      role="tooltip"
      className={estilos.resumo}
      data-acima={lugar?.acima ? '' : undefined}
      data-medindo={lugar ? undefined : ''}
      style={{ left: lugar?.left ?? 0, top: lugar?.top ?? 0 }}
    >
      <dl
        className={estilos.lista}
        style={{ '--partes-do-resumo': lugar?.partes ?? 1 } as CSSProperties}
      >
        {itens.map((item) => (
          <div key={item.coluna} className={estilos.item}>
            <dt className={estilos.rotulo}>{item.rotulo}</dt>
            <dd className={estilos.valor}>{vazio(item.valor) ? '—' : item.valor}</dd>
          </div>
        ))}
      </dl>
    </div>,
    document.body,
  );
}
