import type { ReactNode } from 'react';
import { TituloDaJanela } from '../../casca/Casca.tsx';
import estilos from './CabecalhoDaPagina.module.css';

export interface PropsDoCabecalhoDaPagina {
  /** O título da janela, que recebe o foco ao abrir a tela; aceita a contagem ao lado. */
  titulo: ReactNode;
  /** O ícone do tipo ou a foto, antes do título. */
  marca?: ReactNode;
  /** Os selos ao lado do título, como a situação e o patrimônio. */
  selos?: ReactNode;
  /** Uma linha embaixo do título, no texto secundário. */
  detalhe?: ReactNode;
  /** As ações da tela, à direita, na ordem dada. */
  acoes?: ReactNode;
  /** O título some quando a janela tem abas, como o do TituloDaJanela. */
  ocultarComAbas?: boolean;
}

/**
 * O cabeçalho da página (change cabecalhos-e-fichas, design, decisão 1): à esquerda, a marca, o
 * título com os selos e o detalhe; à direita, as ações, juntas, que quebram para baixo quando a
 * largura não comporta. O título continua o da janela, de nível 1.
 */
export function CabecalhoDaPagina({
  titulo,
  marca,
  selos,
  detalhe,
  acoes,
  ocultarComAbas,
}: PropsDoCabecalhoDaPagina) {
  // Só com o título que a barra das abas esconde, o cabeçalho some junto com ele (change
  // cabecalho-em-toda-tela, design, decisão 6).
  const soOTitulo = !marca && !selos && !detalhe && !acoes;
  return (
    // Um div, e não um header: a barra de cima já é o banner da página.
    <div
      className={estilos.cabecalho}
      data-cabecalho-da-pagina=""
      data-some-com-abas={(ocultarComAbas && soOTitulo) || undefined}
    >
      <div className={estilos.identificacao}>
        {marca && <span className={estilos.marca}>{marca}</span>}
        <div className={estilos.textos}>
          <TituloDaJanela ocultarComAbas={ocultarComAbas}>
            {selos ? (
              <span className={estilos.linhaDoTitulo}>
                <span>{titulo}</span>
                {selos}
              </span>
            ) : (
              titulo
            )}
          </TituloDaJanela>
          {detalhe && <div className={estilos.detalhe}>{detalhe}</div>}
        </div>
      </div>
      {acoes && <div className={estilos.acoes}>{acoes}</div>}
    </div>
  );
}
