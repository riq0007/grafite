import { Children, type ReactNode } from 'react';
import estilos from './ValorComposto.module.css';

export interface PropsDoValorComposto {
  /** O que nunca encolhe: os rótulos de situação, o número ou o medidor. */
  fixo: ReactNode;
  /** O texto que acompanha o fixo, como a idade da leitura: é o primeiro a ser cortado. */
  children?: ReactNode;
}

/**
 * O valor de uma célula com mais de uma parte (spec componentes-base, "Célula numa linha só"): as
 * partes ficam lado a lado, numa linha só. Quando a coluna é estreita, o fixo fica inteiro, e o
 * resto encolhe e termina em reticências. No resumo da linha, que mostra o valor inteiro, as mesmas
 * partes quebram a linha (`ResumoDaLinha.module.css`). Fora das tabelas, onde a linha pode quebrar,
 * as telas montam as partes do jeito delas.
 */
export function ValorComposto({ fixo, children }: PropsDoValorComposto) {
  const temResto = Children.toArray(children).length > 0;
  return (
    <span className={estilos.composto} data-composto="">
      <span className={estilos.fixo} data-parte="fixo">
        {fixo}
      </span>
      {temResto && (
        <span className={estilos.resto} data-parte="resto">
          {children}
        </span>
      )}
    </span>
  );
}
