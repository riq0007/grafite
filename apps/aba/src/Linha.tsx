import { type Ref, type RefObject, useRef } from 'react';
import estilos from './Linha.module.css';
import { type FormaMedida, useEntradaDaForma } from './movimento.ts';

interface Props {
  /** A aba fechada de onde a linha encolhe em 160 ms. */
  de: FormaMedida | null;
  semConexao: boolean;
  ref?: Ref<HTMLDivElement>;
}

/**
 * A linha da apresentação (spec aba-dos-colaboradores, "Aba durante uma apresentação"; m10): com um
 * programa em tela cheia, a aba encolhe para a linha de 96×4 na borda de cima. Ela não abre pelo
 * clique, que passa para a janela de baixo, nem avisa; o atalho segue abrindo o painel.
 */
export function Linha({ de, semConexao, ref }: Props) {
  const propria = useRef<HTMLDivElement | null>(null);
  const guardar = (elemento: HTMLDivElement | null) => {
    propria.current = elemento;
    if (typeof ref === 'function') ref(elemento);
    else if (ref) (ref as RefObject<HTMLDivElement | null>).current = elemento;
  };
  useEntradaDaForma(propria, de, 'fechar');
  return (
    <div
      ref={guardar}
      className={`${estilos.linha} ${semConexao ? estilos.semConexao : ''}`}
      data-linha=""
      aria-hidden="true"
    />
  );
}
