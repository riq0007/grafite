// O cartão do resumo de um registro (change relacoes-vivas, design, decisão 2): a imagem, a foto ou
// o ícone, o nome, o que o registro é, os detalhes em texto e até quatro ações, como "Abrir" e "Ver
// ativos". Enquanto o resumo não chega, ou quando a busca falha, o cartão diz isso em texto e
// mantém as ações, para a ficha continuar a um clique.
import type { ReactNode } from 'react';
import estilos from './CartaoDoRegistro.module.css';

export type EstadoDoCartao = 'carregando' | 'erro' | 'pronto';

export interface PropsDoCartaoDoRegistro {
  /** O nome do registro, que a referência já mostra. */
  nome: string;
  /** O que o registro é, como "Pessoa" ou "Impressora · PAT-00412". */
  tipo?: string;
  /** A foto, a miniatura ou o ícone, à esquerda do nome. */
  midia?: ReactNode;
  /** As linhas do resumo, como "Jundiaí › Expedição" e "3 ativos sob responsabilidade". */
  detalhes?: readonly ReactNode[];
  /** Até quatro ações, desenhadas pela tela como links; a primeira é o "Abrir". */
  acoes: ReactNode;
  estado?: EstadoDoCartao;
}

const MENSAGENS = {
  carregando: 'Carregando o resumo…',
  erro: 'Não deu para carregar o resumo.',
} as const;

export function CartaoDoRegistro({
  nome,
  tipo,
  midia,
  detalhes = [],
  acoes,
  estado = 'pronto',
}: PropsDoCartaoDoRegistro) {
  return (
    <div className={estilos.cartao} data-estado={estado}>
      <div className={estilos.cabecalho}>
        {midia && <span className={estilos.midia}>{midia}</span>}
        <div className={estilos.nomes}>
          <p className={estilos.nome}>{nome}</p>
          {tipo && <p className={estilos.tipo}>{tipo}</p>}
        </div>
      </div>
      {estado === 'pronto' ? (
        detalhes.length > 0 && (
          <ul className={estilos.detalhes}>
            {detalhes.map((detalhe, posicao) => (
              // Os detalhes não mudam de lugar enquanto o cartão está aberto.
              // biome-ignore lint/suspicious/noArrayIndexKey: a posição é a identidade da linha.
              <li key={posicao}>{detalhe}</li>
            ))}
          </ul>
        )
      ) : (
        <p role="status" className={estilos.estado}>
          {MENSAGENS[estado]}
        </p>
      )}
      <div className={estilos.acoes}>{acoes}</div>
    </div>
  );
}
