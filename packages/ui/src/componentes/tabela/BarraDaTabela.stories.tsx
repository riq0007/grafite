import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Botao } from '../botao/Botao.tsx';
import { CampoDeTexto } from '../campo/CampoDeTexto.tsx';
import { FiltrosAtivos } from '../filtros/FiltrosAtivos.tsx';
import { BarraDaTabela, type PropsDaBarraDaTabela } from './BarraDaTabela.tsx';
import { LinhaDaVisao } from './LinhaDaVisao.tsx';

const meta: Meta = { title: 'Componentes/Barra da tabela' };
export default meta;

type Historia = StoryObj<{ aoImprimir?: () => void; aoLimpar?: () => void }>;

const semAcao = () => {};

const filtros = (
  <FiltrosAtivos
    filtros={[{ id: 'tipo', rotulo: 'Tipo', valor: 'Impressora' }]}
    aoLimpar={semAcao}
    aoLimparTodos={semAcao}
  />
);

/** A barra como a tela dos ativos a usa, com a primeira faixa de controles. */
function Barra(props: Omit<PropsDaBarraDaTabela, 'children'>) {
  return (
    <BarraDaTabela {...props}>
      <Botao>Todos os ativos</Botao>
      <CampoDeTexto type="search" rotulo="Buscar ativos" />
      <Botao>Filtros</Botao>
      <Botao>Colunas</Botao>
    </BarraDaTabela>
  );
}

const tela = (canvas: HTMLElement) => within(canvas);

/** A contagem à direita da primeira faixa, e os filtros ativos na segunda. */
export const ComFiltros: Historia = {
  tags: ['captura'],
  render: () => <Barra contagem="1.204 ativos" filtros={filtros} />,
  play: async ({ canvasElement }) => {
    await expect(tela(canvasElement).getByText('1.204 ativos')).toBeVisible();
    await expect(tela(canvasElement).getByRole('group', { name: 'Filtros ativos' })).toBeVisible();
    await expect(tela(canvasElement).queryByRole('toolbar')).toBeNull();
  },
};

/** Com linhas selecionadas, a segunda faixa vira a barra das ações em lote, no lugar dos filtros. */
export const ComSelecao: Historia = {
  tags: ['captura'],
  args: { aoImprimir: fn(), aoLimpar: fn() },
  render: (args) => (
    <Barra
      contagem="1.204 ativos"
      filtros={filtros}
      selecao={{
        quantas: 3,
        acoes: [
          { id: 'etiquetas', rotulo: 'Imprimir etiquetas', aoEscolher: args.aoImprimir ?? semAcao },
          { id: 'copiar', rotulo: 'Copiar linhas', aoEscolher: semAcao },
          { id: 'previa', rotulo: 'Prévia', aoEscolher: semAcao },
        ],
        aoLimpar: args.aoLimpar ?? semAcao,
      }}
    />
  ),
  play: async ({ args, canvasElement }) => {
    const acoes = tela(canvasElement).getByRole('toolbar', { name: 'Ações da seleção' });
    await expect(within(acoes).getByText('3 selecionados')).toBeVisible();
    await expect(
      within(acoes)
        .getAllByRole('button')
        .map((botao) => botao.textContent),
    ).toEqual(['Imprimir etiquetas', 'Copiar linhas', 'Prévia', 'Limpar seleção']);
    await expect(tela(canvasElement).queryByRole('group', { name: 'Filtros ativos' })).toBeNull();
    await userEvent.click(within(acoes).getByRole('button', { name: 'Imprimir etiquetas' }));
    await expect(args.aoImprimir).toHaveBeenCalledOnce();
    await userEvent.click(within(acoes).getByRole('button', { name: 'Limpar seleção' }));
    await expect(args.aoLimpar).toHaveBeenCalledOnce();
  },
};

/** Uma linha só selecionada, no singular. */
export const UmaSelecionada: Historia = {
  render: () => <Barra selecao={{ quantas: 1, acoes: [], aoLimpar: semAcao }} />,
  play: async ({ canvasElement }) => {
    await expect(tela(canvasElement).getByText('1 selecionado')).toBeVisible();
  },
};

/** Sem filtro ativo nem seleção, a segunda faixa some. */
export const SoAPrimeiraFaixa: Historia = {
  render: () => <Barra contagem="12 ativos" />,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-faixa="segunda"]')).toBeNull();
    await expect(tela(canvasElement).queryByRole('toolbar')).toBeNull();
  },
};

/** O estado da visão, entre as duas faixas. */
export const ComOEstadoDaVisao: Historia = {
  render: () => (
    <Barra
      contagem="1.204 ativos"
      filtros={filtros}
      linhaDaVisao={
        <LinhaDaVisao
          estado="do-link"
          aoRestaurar={semAcao}
          aoSalvarComoNova={semAcao}
          aoVoltar={semAcao}
        />
      }
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(tela(canvasElement).getByRole('group', { name: 'Estado da visão' })).toBeVisible();
  },
};
