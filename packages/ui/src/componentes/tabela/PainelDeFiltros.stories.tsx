import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { type ColunaDoPainelDeFiltros, PainelDeFiltros } from './PainelDeFiltros.tsx';

const meta: Meta = { title: 'Componentes/Painel de filtros' };
export default meta;

type Historia = StoryObj;

const COLUNAS: ColunaDoPainelDeFiltros[] = [
  { chave: 'ativo.tipo', rotulo: 'Tipo', grupo: 'Identificação', filtrada: true },
  { chave: 'ativo.modelo', rotulo: 'Modelo', grupo: 'Identificação' },
  { chave: 'ativo.patrimonio', rotulo: 'Patrimônio', grupo: 'Identificação' },
  { chave: 'ativo.local', rotulo: 'Local', grupo: 'Uso' },
  { chave: 'ip', rotulo: 'IP', grupo: 'Rede' },
  { chave: 'memoria', rotulo: 'Memória (GB)', grupo: 'Outros tipos' },
  { chave: 'processador', rotulo: 'Processador', grupo: 'Outros tipos' },
];

/** O painel como a tela o usa: a coluna escolhida abre o editor dela à direita. */
function Painel({
  inicial = null,
  estreito = false,
}: {
  inicial?: string | null;
  estreito?: boolean;
}) {
  const [escolhida, definirEscolhida] = useState<string | null>(inicial);
  const coluna = COLUNAS.find((uma) => uma.chave === escolhida);
  return (
    <PainelDeFiltros
      colunas={COLUNAS}
      escolhida={escolhida}
      aoEscolher={definirEscolhida}
      recolhidos={['Outros tipos']}
      estreito={estreito}
      editor={coluna ? <p>Editor do filtro de {coluna.rotulo}</p> : null}
    />
  );
}

const tela = (canvas: HTMLElement) => within(canvas);
const lista = (canvas: HTMLElement) =>
  tela(canvas).getByRole('listbox', { name: 'Colunas que se filtram' });
const nomes = (canvas: HTMLElement) =>
  within(lista(canvas))
    .getAllByRole('option')
    .map((opcao) => opcao.textContent);

/** As colunas nos grupos, à esquerda, com "Filtrada" em texto; a escolhida abre o editor à direita. */
export const DuasColunas: Historia = {
  render: () => <Painel />,
  play: async ({ canvasElement }) => {
    await expect(nomes(canvasElement)).toEqual([
      'TipoFiltrada',
      'Modelo',
      'Patrimônio',
      'Local',
      'IP',
    ]);
    await expect(within(lista(canvasElement)).getAllByRole('group').length).toBe(3);
    await expect(tela(canvasElement).getByText('Escolha uma coluna para filtrar.')).toBeVisible();
    await userEvent.click(within(lista(canvasElement)).getByRole('option', { name: /^Modelo/ }));
    await expect(tela(canvasElement).getByText('Editor do filtro de Modelo')).toBeVisible();
    await expect(
      within(lista(canvasElement)).getByRole('option', { name: /^Modelo/ }),
    ).toHaveAttribute('aria-selected', 'true');
  },
};

/** O campo filtra a lista sem diferenciar acento e maiúsculas, e diz quando nada casa. */
export const Busca: Historia = {
  render: () => <Painel />,
  play: async ({ canvasElement }) => {
    const campo = tela(canvasElement).getByRole('searchbox', { name: 'Buscar colunas' });
    await userEvent.type(campo, 'PATRIMONIO');
    await expect(nomes(canvasElement)).toEqual(['Patrimônio']);
    await userEvent.clear(campo);
    await userEvent.type(campo, 'memo');
    // A busca acha também nos grupos recolhidos.
    await expect(nomes(canvasElement)).toEqual(['Memória (GB)']);
    await userEvent.clear(campo);
    await userEvent.type(campo, 'zzz');
    await expect(tela(canvasElement).getByText('Nenhuma coluna com “zzz”.')).toBeVisible();
  },
};

/** "Outros tipos" abre recolhido, com quantas colunas tem, e se mostra pelo botão. */
export const OutrosTiposRecolhido: Historia = {
  render: () => <Painel />,
  play: async ({ canvasElement }) => {
    await expect(nomes(canvasElement)).not.toContain('Processador');
    await userEvent.click(
      tela(canvasElement).getByRole('button', { name: 'Mostrar Outros tipos (2)' }),
    );
    await expect(nomes(canvasElement)).toContain('Processador');
    await userEvent.click(
      tela(canvasElement).getByRole('button', { name: 'Esconder Outros tipos' }),
    );
    await expect(nomes(canvasElement)).not.toContain('Processador');
  },
};

/** Na janela estreita, a lista e depois o editor, com "Voltar". */
export const Estreito: Historia = {
  render: () => <Painel estreito />,
  play: async ({ canvasElement }) => {
    await expect(tela(canvasElement).queryByText('Escolha uma coluna para filtrar.')).toBeNull();
    await userEvent.click(within(lista(canvasElement)).getByRole('option', { name: /^IP/ }));
    await expect(tela(canvasElement).getByText('Editor do filtro de IP')).toBeVisible();
    await expect(tela(canvasElement).queryByRole('listbox')).toBeNull();
    await userEvent.click(tela(canvasElement).getByRole('button', { name: 'Voltar' }));
    await expect(lista(canvasElement)).toBeVisible();
  },
};

/** O painel com uma coluna escolhida, para a captura: a lista e o editor lado a lado. */
export const ComOEditor: Historia = {
  render: () => <Painel inicial="ativo.modelo" />,
};
