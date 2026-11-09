import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { QuickLook } from '../previa/QuickLook.tsx';
import { usePrevia } from '../previa/usePrevia.ts';
import { CabecalhoDaTabela, Celula, Coluna, CorpoDaTabela, Linha, Tabela } from './Tabela.tsx';

const meta: Meta = { title: 'Componentes/Tabela com prévia paginada' };
export default meta;

type Historia = StoryObj;

interface Item {
  id: string;
  nome: string;
  patrimonio: string;
}

const itens = (quantos: number, inicio = 0): Item[] =>
  Array.from({ length: quantos }, (_, indice) => {
    const numero = inicio + indice + 1;
    return {
      id: String(numero),
      nome: `Equipamento ${numero}`,
      patrimonio: `PAT-${String(numero).padStart(5, '0')}`,
    };
  });

const TOTAL = 30;

/**
 * Os 12 primeiros de 30 equipamentos, com a página seguinte em 300 ms, a seleção e a prévia ligada
 * pelo `usePrevia`, como a tabela dos ativos.
 */
function TabelaPaginadaComPrevia({ selecaoInicial = [] }: { selecaoInicial?: string[] }) {
  const [lista, definirLista] = useState(() => itens(12));
  const [carregando, definirCarregando] = useState(false);
  const [selecao, definirSelecao] = useState<ReadonlySet<string>>(new Set(selecaoInicial));
  const carregarMais = {
    haMais: lista.length < TOTAL,
    carregando,
    aoCarregar: () => {
      definirCarregando(true);
      setTimeout(() => {
        definirLista((atual) => [...atual, ...itens(12, atual.length)].slice(0, TOTAL));
        definirCarregando(false);
      }, 300);
    },
  };
  const previa = usePrevia(lista, (item) => item.id, { total: TOTAL, carregarMais, selecao });
  const item = previa.item;
  return (
    <>
      <Tabela
        rotulo="Equipamentos"
        alturaMaxima="320px"
        aoAbrirLinha={() => {}}
        aoPreverLinha={previa.aoPreverLinha}
        carregarMais={carregarMais}
        selecao={selecao}
        aoMudarSelecao={definirSelecao}
      >
        <CabecalhoDaTabela>
          <Coluna id="nome" principal>
            Equipamento
          </Coluna>
          <Coluna id="patrimonio">Patrimônio</Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela itens={lista}>
          {(equipamento) => (
            <Linha id={equipamento.id}>
              <Celula>{equipamento.nome}</Celula>
              <Celula mono>{equipamento.patrimonio}</Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
      {item && (
        <QuickLook
          aberta={previa.aberta}
          aoFechar={previa.aoFechar}
          titulo={previa.carregando ? 'Carregando' : item.nome}
          posicao={previa.posicao}
          total={previa.total}
          visual={{ tipo: 'computador' }}
          estado={previa.carregando ? 'carregando' : 'pronto'}
          campos={[{ rotulo: 'Patrimônio', valor: item.patrimonio, mono: true }]}
          aoAnterior={previa.aoAnterior}
          aoSeguinte={previa.aoSeguinte}
        />
      )}
    </>
  );
}

const linha = (canvas: HTMLElement, chave: string) =>
  canvas.querySelector<HTMLElement>(`[role="row"][data-key="${chave}"]`) as HTMLElement;

const previa = (nome: string) =>
  within(document.body).findByRole('dialog', { name: `Prévia: ${nome}` });

/**
 * No último carregado, "12 de 30", a seta para baixo traz a página seguinte, com o esqueleto
 * enquanto ela chega, e mostra "13 de 30".
 */
export const PaginaSeguinte: Historia = {
  render: () => <TabelaPaginadaComPrevia />,
  play: async ({ canvasElement }) => {
    linha(canvasElement, '12').focus();
    await userEvent.keyboard(' ');
    const aberta = await previa('Equipamento 12');
    await expect(within(aberta).getByText('12 de 30')).toBeInTheDocument();
    await waitFor(() => expect(aberta.contains(document.activeElement)).toBe(true));
    await userEvent.keyboard('{ArrowDown}');
    const esperando = await previa('Carregando');
    await expect(within(esperando).getByText('13 de 30')).toBeInTheDocument();
    await expect(esperando.querySelector('[aria-busy="true"]')).not.toBeNull();
    const seguinte = await previa('Equipamento 13');
    await expect(within(seguinte).getByText('13 de 30')).toBeInTheDocument();
    await expect(within(seguinte).getByText('PAT-00013')).toBeInTheDocument();
  },
};

/** Com a segunda, a quinta e a nona selecionadas, a prévia na quinta mostra "2 de 3" e vai à nona. */
export const SoOsSelecionados: Historia = {
  render: () => <TabelaPaginadaComPrevia selecaoInicial={['2', '5', '9']} />,
  play: async ({ canvasElement }) => {
    linha(canvasElement, '5').focus();
    await userEvent.keyboard(' ');
    const aberta = await previa('Equipamento 5');
    await expect(within(aberta).getByText('2 de 3')).toBeInTheDocument();
    await waitFor(() => expect(aberta.contains(document.activeElement)).toBe(true));
    await userEvent.keyboard('{ArrowDown}');
    const nona = await previa('Equipamento 9');
    await expect(within(nona).getByText('3 de 3')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowDown}');
    await expect(within(await previa('Equipamento 9')).getByText('3 de 3')).toBeInTheDocument();
  },
};

/** 200 equipamentos na tabela virtualizada, todos carregados, com a prévia. */
function VirtualizadaComPrevia() {
  const [lista] = useState(() => itens(200));
  const previa = usePrevia(lista, (item) => item.id);
  const item = previa.item;
  return (
    <div style={{ height: '280px', display: 'flex', flexDirection: 'column' }}>
      <Tabela
        rotulo="Equipamentos"
        virtualizada
        redimensionavel
        aoAbrirLinha={() => {}}
        aoPreverLinha={previa.aoPreverLinha}
      >
        <CabecalhoDaTabela>
          <Coluna id="nome" principal largura={260}>
            Equipamento
          </Coluna>
          <Coluna id="patrimonio" largura={160}>
            Patrimônio
          </Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela itens={lista}>
          {(equipamento) => (
            <Linha id={equipamento.id}>
              <Celula>{equipamento.nome}</Celula>
              <Celula mono>{equipamento.patrimonio}</Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
      {item && (
        <QuickLook
          aberta={previa.aberta}
          aoFechar={previa.aoFechar}
          titulo={item.nome}
          posicao={previa.posicao}
          total={previa.total}
          visual={{ tipo: 'computador' }}
          aoAnterior={previa.aoAnterior}
          aoSeguinte={previa.aoSeguinte}
        />
      )}
    </div>
  );
}

/**
 * Na tabela virtualizada, a prévia que fecha num registro cuja linha não está desenhada leva o foco a
 * ela: a tabela rola até a linha.
 */
export const FocoNaLinhaNaoDesenhada: Historia = {
  render: () => <VirtualizadaComPrevia />,
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(linha(canvasElement, '1')).not.toBeNull());
    linha(canvasElement, '1').focus();
    await userEvent.keyboard(' ');
    const aberta = await previa('Equipamento 1');
    await waitFor(() => expect(aberta.contains(document.activeElement)).toBe(true));
    await userEvent.keyboard('{ArrowDown>60/}');
    await previa('Equipamento 61');
    await expect(linha(canvasElement, '61')).toBeNull();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(linha(canvasElement, '61')));
  },
};
