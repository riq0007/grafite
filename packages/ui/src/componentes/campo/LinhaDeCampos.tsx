import type { ReactNode } from 'react';
import estilos from './Campo.module.css';

export interface PropsDaLinhaDeCampos {
  /** Os campos da linha, pensada para dois ou três. */
  children: ReactNode;
  className?: string;
}

/**
 * Campos lado a lado, em colunas da mesma largura, quando o lugar onde a linha está tem pelo menos
 * 480 px, e um abaixo do outro quando tem menos. A linha é o próprio container: ela se arranja pela
 * largura que recebe (janela, painel ou coluna), e não pela largura da tela.
 */
export function LinhaDeCampos({ children, className }: PropsDaLinhaDeCampos) {
  return (
    <div className={[estilos.linha, className].filter(Boolean).join(' ')}>
      <div className={estilos.camposDaLinha}>{children}</div>
    </div>
  );
}
