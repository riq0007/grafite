// A barra da tabela (spec tabelas-configuraveis, "Barra da tabela"; change filtros-e-barra-da-tabela,
// design, decisão 5): a primeira faixa com a escolha da visão, a busca e os controles da tabela, e
// quantos registros ela tem à direita; a linha do estado da visão, quando há; e a segunda faixa, com
// os filtros ativos ou, com linhas selecionadas, a barra das ações em lote. A segunda faixa some sem
// filtro nem seleção, e tem a mesma altura com um ou com outro.
import type { ReactNode } from 'react';
import { Toolbar } from 'react-aria-components';
import { Botao } from '../botao/Botao.tsx';
import estilos from './BarraDaTabela.module.css';

/** Uma ação que vale para as linhas selecionadas, como "Imprimir etiquetas". */
export interface AcaoEmLote {
  id: string;
  rotulo: string;
  aoEscolher: () => void;
}

export interface SelecaoDaBarra {
  quantas: number;
  /** As ações do menu de contexto que aceitam várias linhas, na mesma ordem. */
  acoes: readonly AcaoEmLote[];
  aoLimpar: () => void;
}

export interface PropsDaBarraDaTabela {
  /** A primeira faixa: a escolha da visão, a busca e os controles da tabela. */
  children: ReactNode;
  /** Quantos registros a tabela tem com a busca e os filtros, como "1.204 ativos". */
  contagem?: string | null;
  /** A faixa da origem da tabela, logo abaixo da primeira faixa. */
  origem?: ReactNode;
  /** A linha do estado da visão, entre as duas faixas. */
  linhaDaVisao?: ReactNode;
  /** Os filtros ativos; a tela os passa só quando há algum. */
  filtros?: ReactNode;
  /** A seleção: com alguma linha, a segunda faixa mostra as ações em lote no lugar dos filtros. */
  selecao?: SelecaoDaBarra;
}

const selecionados = (quantas: number) =>
  quantas === 1 ? '1 selecionado' : `${quantas.toLocaleString('pt-BR')} selecionados`;

export function BarraDaTabela({
  children,
  contagem,
  origem,
  linhaDaVisao,
  filtros,
  selecao,
}: PropsDaBarraDaTabela) {
  const comSelecao = selecao !== undefined && selecao.quantas > 0;
  return (
    <div className={estilos.barra}>
      <div className={estilos.faixa} data-faixa="primeira">
        {children}
        {contagem && <p className={estilos.contagem}>{contagem}</p>}
      </div>
      {origem}
      {linhaDaVisao}
      {comSelecao ? (
        <Toolbar aria-label="Ações da seleção" className={estilos.faixa} data-faixa="segunda">
          <span role="status" className={estilos.selecionados}>
            {selecionados(selecao.quantas)}
          </span>
          {selecao.acoes.map((acao) => (
            <Botao key={acao.id} onPress={acao.aoEscolher}>
              {acao.rotulo}
            </Botao>
          ))}
          <Botao nivel="terciario" onPress={selecao.aoLimpar}>
            Limpar seleção
          </Botao>
        </Toolbar>
      ) : filtros ? (
        <div className={estilos.faixa} data-faixa="segunda">
          {filtros}
        </div>
      ) : null}
    </div>
  );
}
