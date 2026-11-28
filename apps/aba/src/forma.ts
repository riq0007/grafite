import { type RefObject, useEffect } from 'react';
import { informarForma, type RetanguloDaForma } from './nativo.ts';

const px = (valor: string) => Number.parseFloat(valor) || 0;

/**
 * O retângulo da forma na janela, pela caixa do layout: a escala do mouse em cima não conta, para a
 * forma não crescer sob o ponteiro. O raio sai do CSS, limitado à meia altura.
 */
export function retanguloDe(elemento: HTMLElement): RetanguloDaForma {
  let x = 0;
  let y = 0;
  for (let atual: HTMLElement | null = elemento; atual; ) {
    x += atual.offsetLeft;
    y += atual.offsetTop;
    atual = atual.offsetParent as HTMLElement | null;
  }
  const largura = elemento.offsetWidth;
  const altura = elemento.offsetHeight;
  const estilo = getComputedStyle(elemento);
  const limite = Math.min(largura, altura) / 2;
  return {
    x,
    y,
    largura,
    altura,
    raioDeCima: Math.min(px(estilo.borderTopLeftRadius), limite),
    raioDeBaixo: Math.min(px(estilo.borderBottomLeftRadius), limite),
  };
}

/**
 * Informa ao lado nativo a forma da aba, a cada mudança de tamanho ou de lugar, sem repetir a mesma.
 * `chave` muda quando o lugar pode ter mudado sem o tamanho mudar. Sem `clicavel`, como a linha
 * da apresentação, a forma é vazia, e todo clique passa para a janela de baixo.
 */
export function useFormaInformada(
  ref: RefObject<HTMLElement | null>,
  chave: string,
  clicavel = true,
) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: mede de novo a cada forma, tela ou lugar.
  useEffect(() => {
    const elemento = ref.current;
    if (!clicavel) {
      informarForma([]).catch(() => undefined);
      return;
    }
    if (!elemento) return;
    let ultima = '';
    const informar = () => {
      const retangulos = [retanguloDe(elemento)];
      const texto = JSON.stringify(retangulos);
      if (texto === ultima) return;
      ultima = texto;
      informarForma(retangulos).catch(() => undefined);
    };
    informar();
    const observador = new ResizeObserver(informar);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [ref, chave, clicavel]);
}
