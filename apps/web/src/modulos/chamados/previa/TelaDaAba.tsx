// A tela da aba (change chamados-da-ti, design, decisão 16): a moldura, com a faixa no alto, o
// miolo neutro do tema e, quando há, o rodapé com a frase e a ação.
import type { ReactNode } from 'react';
import estilos from './Aba.module.css';
import { FaixaDaAba, type PropsDaFaixaDaAba } from './FaixaDaAba.tsx';

export interface PropsDaTelaDaAba extends PropsDaFaixaDaAba {
  /** O nome da região, como "Como o colaborador vê". */
  rotulo: string;
  children: ReactNode;
  /** O rodapé de duas pontas: a frase à esquerda e a ação à direita. */
  rodape?: { frase: ReactNode; acao: ReactNode };
}

export function TelaDaAba({ rotulo, children, rodape, ...faixa }: PropsDaTelaDaAba) {
  return (
    <section aria-label={rotulo} className={estilos.tela}>
      <FaixaDaAba {...faixa} />
      <div className={estilos.miolo}>{children}</div>
      {rodape && (
        <div className={estilos.rodape}>
          <span>{rodape.frase}</span>
          <span className={estilos.acaoDoRodape}>{rodape.acao}</span>
        </div>
      )}
    </section>
  );
}
