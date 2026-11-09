import type { ReactElement } from 'react';
import { Tooltip, type TooltipProps, TooltipTrigger } from 'react-aria-components';
import { tempos } from '../../tokens/tempos.ts';
import estilos from './Flutuante.module.css';

export interface PropsDaDica {
  /** Texto curto que complementa o gatilho; nunca é a única fonte de uma informação. */
  texto: string;
  /** Um componente focável da biblioteca, como o botão. */
  children: ReactElement;
  posicao?: TooltipProps['placement'];
}

/**
 * Dica ao parar o mouse sobre o gatilho ou focá-lo pelo teclado. No mouse, espera o ponteiro
 * parar; some ao sair, ao perder o foco ou com Esc.
 */
export function Dica({ texto, children, posicao = 'top' }: PropsDaDica) {
  return (
    <TooltipTrigger delay={tempos.dica.atraso} closeDelay={0}>
      {children}
      <Tooltip placement={posicao} offset={6} className={estilos.dica}>
        {texto}
      </Tooltip>
    </TooltipTrigger>
  );
}
