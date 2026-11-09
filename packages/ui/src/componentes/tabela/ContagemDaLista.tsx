import estilos from './ContagemDaLista.module.css';

const numero = new Intl.NumberFormat('pt-BR');

export interface PropsDaContagemDaLista {
  quantos: number;
  /** O nome de um item, como "perfil". */
  singular: string;
  /** O nome de vários, como "perfis". */
  plural: string;
}

/**
 * Quantos itens a lista tem, acima da tabela, como "4 pessoas" (change tabelas-consistentes, design,
 * decisão 3): o mesmo texto e o mesmo lugar em toda lista.
 */
export function ContagemDaLista({ quantos, singular, plural }: PropsDaContagemDaLista) {
  return (
    <p className={estilos.contagem}>
      {numero.format(quantos)} {quantos === 1 ? singular : plural}
    </p>
  );
}
