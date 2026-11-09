// A faixa da origem da tabela (spec cadastro-de-ativos, "Tabela a partir de uma origem"; change
// relacoes-vivas, decisão 3): de onde a tabela veio, como "Ativos de Jundiaí › Expedição (vindo do
// local)", uma opção da origem, como "Incluir os locais de dentro", e "Limpar origem".
import type { ReactNode } from 'react';
import { Botao } from '../botao/Botao.tsx';
import estilos from './FaixaDaOrigem.module.css';

export interface PropsDaFaixaDaOrigem {
  descricao: string;
  /** Uma opção da origem, como a caixa "Incluir os locais de dentro" do local. */
  opcao?: ReactNode;
  aoLimpar: () => void;
}

export function FaixaDaOrigem({ descricao, opcao, aoLimpar }: PropsDaFaixaDaOrigem) {
  return (
    <fieldset aria-label="Origem da tabela" className={estilos.faixa}>
      <p className={estilos.descricao}>{descricao}</p>
      {opcao}
      <Botao nivel="terciario" onPress={aoLimpar}>
        Limpar origem
      </Botao>
    </fieldset>
  );
}
