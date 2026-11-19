// A faixa da aba (change chamados-da-ti, design, decisão 16): o alto da tela da aba, na cor da
// aba, com a trilha em pílulas, o passo e, quando há, em nome de quem o chamado vai.
import { Avatar, Icone } from '@grafite/ui';
import { ArrowLeftRight, ChevronRight } from 'lucide-react';
import estilos from './Aba.module.css';

export interface QuemPedeNaAba {
  nome: string;
  /** Se é a própria conta, que lê "(você)" depois do nome. */
  voce: boolean;
}

export interface PropsDaFaixaDaAba {
  /** Os passos até a tela, do primeiro ao atual, como "Aba", "Abrir chamado" e "Impressora". */
  trilha: readonly string[];
  /** Onde a pessoa está no envio, como "1 de 3". */
  passo: string;
  /** Em nome de quem o chamado vai; sem ele, a faixa não diz. */
  quem?: QuemPedeNaAba;
  /** Trocar a pessoa; sem a ação, o "Trocar" não aparece, porque o botão que não faz nada engana. */
  aoTrocar?: () => void;
}

export function FaixaDaAba({ trilha, passo, quem, aoTrocar }: PropsDaFaixaDaAba) {
  return (
    <div className={estilos.faixa}>
      <div className={estilos.alto}>
        {/* Nenhum passo é um link: a trilha é a lista nomeada, e não um marco de navegação. */}
        <ol className={estilos.trilha} aria-label="Onde você está">
          {trilha.map((nome, indice) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: a trilha não muda de ordem, e a posição é o passo.
              key={indice}
              className={estilos.passoDaTrilha}
              aria-current={indice === trilha.length - 1 ? 'step' : undefined}
            >
              {indice > 0 && <Icone icone={ChevronRight} tamanho={12} />}
              <span className={estilos.pilula}>{nome}</span>
            </li>
          ))}
        </ol>
        <span className={estilos.passo}>{passo}</span>
      </div>
      {quem && (
        <div className={estilos.quem}>
          <Avatar nome={quem.nome} tamanho="linha" decorativo />
          <span>
            No nome de <b>{quem.nome}</b>
            {quem.voce && ' (você)'}
          </span>
          {aoTrocar && (
            <button type="button" className={estilos.trocar} onClick={aoTrocar}>
              <Icone icone={ArrowLeftRight} tamanho={14} />
              Trocar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
