// A tabela dos tipos (change chamados-da-ti, design, "A tela dos tipos (tarefa 5.19)"; m07): a
// alça, o tipo com o ícone e o selo da exceção, o prazo da resolução em mono, quem atende e os
// abertos. A linha escolhida é o tipo do editor; a alça muda a ordem, com o ponteiro ou o teclado.
import { type ColunaQueSeOrdena, TabelaQueSeOrdena } from '@grafite/ui';
import { IconeDoTipo, Selo } from '../Pecas.tsx';
import {
  prazoNaTabela,
  quemAtendeNaTabela,
  reordenar,
  seloDoTipo,
  type TipoDeChamado,
} from './edicao.ts';
import estilos from './Tipos.module.css';

export interface PropsDaTabelaDosTipos {
  tipos: readonly TipoDeChamado[];
  /** O id do título da coluna, que dá o nome da tabela. */
  idDoTitulo: string;
  escolhido: string;
  aoEscolher: (id: string) => void;
  /** A ordem nova, com todos os ids. */
  aoReordenar: (ids: string[]) => void;
}

const COLUNAS: readonly ColunaQueSeOrdena<TipoDeChamado>[] = [
  {
    id: 'tipo',
    titulo: 'Tipo',
    nomeDaLinha: true,
    celula: (tipo) => {
      const selo = seloDoTipo(tipo);
      return (
        <span className={estilos.tipoNaLinha}>
          <span className={estilos.nomeNaLinha}>
            <IconeDoTipo icone={tipo.icone} nome={tipo.nome} decorativo />
            <span>{tipo.nome}</span>
          </span>
          {selo && <Selo selo={selo} />}
        </span>
      );
    },
  },
  { id: 'prazo', titulo: 'Prazo', largura: 54, mono: true, celula: prazoNaTabela },
  { id: 'atende', titulo: 'Atende', largura: 68, celula: quemAtendeNaTabela },
  { id: 'abertos', titulo: 'Abertos', largura: 70, mono: true, celula: (tipo) => tipo.abertos },
];

export function TabelaDosTipos({
  tipos,
  idDoTitulo,
  escolhido,
  aoEscolher,
  aoReordenar,
}: PropsDaTabelaDosTipos) {
  return (
    <TabelaQueSeOrdena
      aria-labelledby={idDoTitulo}
      itens={tipos}
      idDe={(tipo) => tipo.id}
      nomeDe={(tipo) => tipo.nome}
      colunas={COLUNAS}
      escolhido={escolhido}
      aoEscolher={aoEscolher}
      aoSoltar={({ movidos, alvo, posicao }) => {
        const ids = tipos.map((tipo) => tipo.id);
        const nova = reordenar(ids, movidos, alvo, posicao);
        if (nova.some((id, indice) => id !== ids[indice])) aoReordenar(nova);
      }}
      alta={(tipo) => seloDoTipo(tipo) !== null}
    />
  );
}
