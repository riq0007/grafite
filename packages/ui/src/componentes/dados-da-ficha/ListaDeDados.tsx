import type { ReactNode } from 'react';
import estilos from './ListaDeDados.module.css';

export interface DadoDaFicha {
  rotulo: string;
  valor: ReactNode;
}

export interface PropsDaListaDeDados {
  itens: readonly DadoDaFicha[];
}

/**
 * Os dados de uma ficha, só para leitura (change cabecalhos-e-fichas, design, decisão 3): o rótulo
 * no texto secundário, numa coluna de largura fixa, e o valor ao lado; na largura estreita, o
 * rótulo fica em cima. Para o leitor de tela, cada par é um termo e a definição dele.
 */
export function ListaDeDados({ itens }: PropsDaListaDeDados) {
  return (
    <div className={estilos.conteiner} data-lista-de-dados="">
      <dl className={estilos.lista}>
        {itens.map(({ rotulo, valor }) => (
          <div key={rotulo} className={estilos.par}>
            <dt className={estilos.rotulo}>{rotulo}</dt>
            <dd className={estilos.valor}>{valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
