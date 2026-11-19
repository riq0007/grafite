import type { ReactNode } from 'react';
import { TituloDaJanela } from '../../casca/Casca.tsx';
import estilos from './CabecalhoDaPagina.module.css';

export interface PropsDoCabecalhoDaPagina {
  /** O título da janela, que recebe o foco ao abrir a tela; aceita a contagem ao lado. */
  titulo: ReactNode;
  /**
   * A seta de voltar, antes do título e na linha dele, como a do chamado aberto. Ela fica fora do
   * título da janela, para o leitor de tela ler o título sem ela.
   */
  voltar?: ReactNode;
  /** A trilha, numa linha só dela, em cima do título, como "Chamados › Acesso e senha › #1041". */
  trilha?: ReactNode;
  /** O ícone do tipo ou a foto, antes do título. */
  marca?: ReactNode;
  /** Os selos ao lado do título, como a situação e o patrimônio. */
  selos?: ReactNode;
  /** Uma linha embaixo do título, no texto secundário. */
  detalhe?: ReactNode;
  /** Um apoio ao lado do título, e fora dele, como a dica de uma tela. */
  apoio?: ReactNode;
  /**
   * Um quadro à direita do título e das ações, como o do prazo do chamado. Com ele, as ações vão
   * embaixo do título, a partir da esquerda.
   */
  quadro?: ReactNode;
  /** As ações da tela, à direita, na ordem dada; com o quadro, embaixo do título. */
  acoes?: ReactNode;
  /** O título some quando a janela tem abas, como o do TituloDaJanela. */
  ocultarComAbas?: boolean;
}

/**
 * O cabeçalho da página (change cabecalhos-e-fichas, design, decisão 1): à esquerda, a marca, o
 * título com os selos e o detalhe; à direita, as ações, juntas, que quebram para baixo quando a
 * largura não comporta. O título continua o da janela, de nível 1. A trilha vai numa linha em cima
 * e o quadro, à direita do título e das ações, que descem para baixo do título (change
 * chamados-da-ti, design, "O chamado aberto, o cabeçalho (tarefa 5.10)"). A seta de voltar fica
 * antes do título, na linha dele (tarefa 5.32).
 */
export function CabecalhoDaPagina({
  titulo,
  voltar,
  trilha,
  marca,
  selos,
  detalhe,
  apoio,
  quadro,
  acoes,
  ocultarComAbas,
}: PropsDoCabecalhoDaPagina) {
  // Só com o título que a barra das abas esconde, o cabeçalho some junto com ele (change
  // cabecalho-em-toda-tela, design, decisão 6).
  const soOTitulo =
    !voltar && !trilha && !marca && !selos && !detalhe && !apoio && !quadro && !acoes;
  const tituloDaJanela = (
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
  );
  const identificacao = (
    <div className={estilos.identificacao}>
      {marca && <span className={estilos.marca}>{marca}</span>}
      <div className={estilos.textos}>
        {voltar ? (
          <div className={estilos.linhaComVoltar}>
            {voltar}
            {tituloDaJanela}
          </div>
        ) : (
          tituloDaJanela
        )}
        {detalhe && <div className={estilos.detalhe}>{detalhe}</div>}
      </div>
      {apoio && <div className={estilos.apoio}>{apoio}</div>}
    </div>
  );
  const grupoDasAcoes = acoes && <div className={estilos.acoes}>{acoes}</div>;
  return (
    // Um div, e não um header: a barra de cima já é o banner da página.
    <div
      className={estilos.cabecalho}
      data-cabecalho-da-pagina=""
      data-some-com-abas={(ocultarComAbas && soOTitulo) || undefined}
    >
      {trilha && <div className={estilos.trilha}>{trilha}</div>}
      {quadro ? (
        <>
          <div className={estilos.principal}>
            {identificacao}
            {grupoDasAcoes}
          </div>
          <div className={estilos.quadro}>{quadro}</div>
        </>
      ) : (
        <>
          {identificacao}
          {grupoDasAcoes}
        </>
      )}
    </div>
  );
}
