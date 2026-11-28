import { Botao } from '../componentes/botao/Botao.tsx';
import estilos from './Entrada.module.css';

export interface PropsDoPassoNoNavegador {
  titulo: string;
  /** Por que o passo não se resolve aqui e onde ele se resolve. */
  texto: string;
  /** O rótulo do botão que abre o Grafite no navegador. */
  rotulo: string;
  aoAbrir: () => void;
}

/**
 * O passo que esta tela não resolve, como o da senha temporária no chat da aba: a explicação e o
 * botão que abre o Grafite no navegador, onde o passo se resolve.
 */
export function PassoNoNavegador({ titulo, texto, rotulo, aoAbrir }: PropsDoPassoNoNavegador) {
  return (
    <>
      <h1 className={estilos.titulo}>{titulo}</h1>
      <p className={estilos.texto}>{texto}</p>
      <div className={estilos.acoes}>
        <Botao onPress={aoAbrir}>{rotulo}</Botao>
      </div>
    </>
  );
}
