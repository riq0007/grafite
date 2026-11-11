import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { desvioDoCentro } from '../../teste/alinhamento.ts';
import { MiniaturaDeAtivo } from '../miniatura/MiniaturaDeAtivo.tsx';
import { ATIVOS } from './exemplos.ts';
import {
  CabecalhoDaTabela,
  Celula,
  CelulaDaMiniatura,
  Coluna,
  ColunaDaMiniatura,
  CorpoDaTabela,
  Linha,
  Tabela,
} from './Tabela.tsx';
import estilos from './TabelaComMiniaturas.module.css';

// A miniatura no meio da linha (spec componentes-base, "Tabela base", cenário "Miniatura no meio da
// linha"; change miniatura-alinhada-na-linha, design, decisão 2): o centro da miniatura fica no
// centro da linha, a até 1 px, na tabela base e na que desenha só as linhas visíveis, nas três
// densidades. A conferência mede a tela, e não o CSS.
const meta: Meta = { title: 'Componentes/Tabela com miniaturas' };
export default meta;

type Historia = StoryObj;

const DENSIDADES = ['compacta', 'normal', 'confortavel'] as const;

/** Os quatro primeiros ativos de exemplo, cada um com a imagem genérica do tipo. */
const ITENS = ATIVOS.slice(0, 4);

function TabelaDeAtivos({ virtualizada }: { virtualizada: boolean }) {
  return (
    <div className={virtualizada ? estilos.virtualizada : undefined}>
      <Tabela
        rotulo={virtualizada ? 'Ativos, só as linhas visíveis' : 'Ativos'}
        redimensionavel
        virtualizada={virtualizada}
      >
        <CabecalhoDaTabela>
          <ColunaDaMiniatura />
          <Coluna id="nome" principal largura={220}>
            Equipamento
          </Coluna>
          <Coluna id="patrimonio" largura={140}>
            Patrimônio
          </Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela itens={ITENS}>
          {(ativo) => (
            <Linha id={ativo.id}>
              <CelulaDaMiniatura>
                <MiniaturaDeAtivo tipo={ativo.tipo} />
              </CelulaDaMiniatura>
              <Celula>{ativo.nome}</Celula>
              <Celula mono>{ativo.patrimonio}</Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
    </div>
  );
}

function NasTresDensidades({ virtualizada }: { virtualizada: boolean }) {
  return (
    <div className={estilos.faixas}>
      {DENSIDADES.map((densidade) => (
        <div key={densidade} data-density={densidade} data-faixa={densidade}>
          <TabelaDeAtivos virtualizada={virtualizada} />
        </div>
      ))}
    </div>
  );
}

const linhasDe = (faixa: HTMLElement) =>
  within(faixa)
    .getAllByRole('row')
    .filter((linha) => !linha.querySelector('[role="columnheader"]'));

/** O centro de cada miniatura a até 1 px do centro da linha dela, em cada densidade. */
async function conferirOAlinhamento(canvasElement: HTMLElement) {
  for (const densidade of DENSIDADES) {
    const faixa = canvasElement.querySelector(`[data-faixa="${densidade}"]`) as HTMLElement;
    await waitFor(() => expect(linhasDe(faixa)).toHaveLength(ITENS.length));
    for (const linha of linhasDe(faixa)) {
      const miniatura = linha.querySelector('[data-origem]') as HTMLElement;
      await expect(miniatura).toBeInTheDocument();
      await expect(Math.abs(desvioDoCentro(miniatura, linha))).toBeLessThanOrEqual(1);
    }
  }
}

/** Na tabela base, a miniatura fica no meio da linha, na altura do texto das outras células. */
export const NoMeioDaLinha: Historia = {
  render: () => <NasTresDensidades virtualizada={false} />,
  play: async ({ canvasElement }) => conferirOAlinhamento(canvasElement),
};

/** Na tabela que desenha só as linhas visíveis, a miniatura também fica no meio da linha. */
export const NoMeioDaLinhaSoComAsLinhasVisiveis: Historia = {
  render: () => <NasTresDensidades virtualizada />,
  play: async ({ canvasElement }) => conferirOAlinhamento(canvasElement),
};
