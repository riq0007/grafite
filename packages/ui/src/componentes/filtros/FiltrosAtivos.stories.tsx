import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ReactNode, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { type FiltroAtivo, FiltrosAtivos } from './FiltrosAtivos.tsx';

const SITUACAO: FiltroAtivo = { id: 'situacao', rotulo: 'Situação', valor: 'Inativas' };
const LOCAL: FiltroAtivo = { id: 'local', rotulo: 'Local', valor: 'Jundiaí' };
const CONTA: FiltroAtivo = { id: 'conta', rotulo: 'Conta', valor: 'Com conta' };

interface Args {
  filtros: FiltroAtivo[];
  aoLimpar: (id: string) => void;
  aoLimparTodos: () => void;
  editor?: (id: string, fechar: () => void) => ReactNode;
}

/** A lista filtrada de verdade: limpar tira o filtro, como a tela faria. */
function ListaFiltrada({ filtros: iniciais, aoLimpar, aoLimparTodos, editor }: Args) {
  const [filtros, definirFiltros] = useState(iniciais);
  return (
    <FiltrosAtivos
      filtros={filtros}
      editor={editor}
      aoLimpar={(id) => {
        definirFiltros((atuais) => atuais.filter((filtro) => filtro.id !== id));
        aoLimpar(id);
      }}
      aoLimparTodos={() => {
        definirFiltros([]);
        aoLimparTodos();
      }}
    />
  );
}

const meta: Meta<Args> = {
  title: 'Componentes/Filtros ativos',
  args: { filtros: [SITUACAO, LOCAL], aoLimpar: fn(), aoLimparTodos: fn() },
  render: (args) => <ListaFiltrada {...args} />,
};
export default meta;

type Historia = StoryObj<Args>;

const filtros = (canvas: HTMLElement) =>
  within(canvas).queryByRole('group', { name: 'Filtros ativos' });

export const Padrao: Historia = {};

/** Cada filtro mostra o nome e o valor, e cada botão de limpar diz qual filtro limpa. */
export const NomesAcessiveis: Historia = {
  play: async ({ canvasElement }) => {
    const linha = filtros(canvasElement) as HTMLElement;
    const itens = within(linha).getAllByRole('listitem');
    await expect(itens.map((item) => item.textContent)).toEqual([
      'Situação · Inativas',
      'Local · Jundiaí',
    ]);
    await expect(
      within(linha).getByRole('button', { name: 'Limpar o filtro Situação: Inativas' }),
    ).toBeVisible();
    await expect(
      within(linha).getByRole('button', { name: 'Limpar o filtro Local: Jundiaí' }),
    ).toBeVisible();
    await expect(within(linha).getByRole('button', { name: 'Limpar filtros' })).toBeVisible();
  },
};

/** Filtrada por situação e local, limpar o local deixa só a situação. */
export const LimparUmFiltro: Historia = {
  play: async ({ args, canvasElement }) => {
    const linha = filtros(canvasElement) as HTMLElement;
    await userEvent.click(
      within(linha).getByRole('button', { name: 'Limpar o filtro Local: Jundiaí' }),
    );
    await expect(args.aoLimpar).toHaveBeenCalledWith('local');
    await expect(
      within(linha)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Situação · Inativas']);
    await expect(args.aoLimparTodos).not.toHaveBeenCalled();
  },
};

/** "Limpar filtros" limpa todos; sem filtro ativo, a linha some. */
export const LimparFiltros: Historia = {
  play: async ({ args, canvasElement }) => {
    const linha = filtros(canvasElement) as HTMLElement;
    await userEvent.click(within(linha).getByRole('button', { name: 'Limpar filtros' }));
    await expect(args.aoLimparTodos).toHaveBeenCalledOnce();
    await expect(args.aoLimpar).not.toHaveBeenCalled();
    await expect(filtros(canvasElement)).toBeNull();
  },
};

/**
 * Pelo teclado, o foco não se perde ao limpar: vai para o filtro que ficou no lugar ou, no fim
 * da linha, para o anterior.
 */
export const FocoAoLimparPeloTeclado: Historia = {
  args: { filtros: [SITUACAO, LOCAL, CONTA] },
  play: async ({ canvasElement }) => {
    const linha = filtros(canvasElement) as HTMLElement;
    const limpar = (filtro: FiltroAtivo) =>
      within(linha).getByRole('button', {
        name: `Limpar o filtro ${filtro.rotulo}: ${filtro.valor}`,
      });
    await userEvent.tab();
    await expect(limpar(SITUACAO)).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(limpar(LOCAL)).toHaveFocus();
    await userEvent.tab();
    await expect(limpar(CONTA)).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(limpar(LOCAL)).toHaveFocus();
  },
};

/** Sem filtro ativo, não há linha nem "Limpar filtros". */
export const SemFiltros: Historia = {
  args: { filtros: [] },
  play: async ({ canvasElement }) => {
    await expect(filtros(canvasElement)).toBeNull();
    await expect(
      within(canvasElement).queryByRole('button', { name: 'Limpar filtros' }),
    ).toBeNull();
  },
};

const HOSTNAME: FiltroAtivo = {
  id: 'hostname',
  rotulo: 'Hostname',
  operador: 'contém',
  valor: 'almox',
};
const GARANTIA: FiltroAtivo = {
  id: 'garantia',
  rotulo: 'Garantia até',
  valor: 'de 01/01/2026 até 31/12/2026',
};

/** O operador entre a coluna e o valor, quando a coluna tem mais de um; o limpar diz os três. */
export const ComOperador: Historia = {
  args: { filtros: [HOSTNAME, GARANTIA] },
  play: async ({ canvasElement }) => {
    const linha = filtros(canvasElement) as HTMLElement;
    await expect(
      within(linha)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Hostname · contém · almox', 'Garantia até · de 01/01/2026 até 31/12/2026']);
    await expect(
      within(linha).getByRole('button', { name: 'Limpar o filtro Hostname: contém almox' }),
    ).toBeVisible();
  },
};

/** O editor do filtro, num popover preso ao rótulo dele, como a tela o dá. */
const editor = (id: string, fechar: () => void): ReactNode => (
  <div>
    <p>Editor do filtro {id}</p>
    <button type="button" onClick={fechar}>
      Pronto
    </button>
  </div>
);

/** Clicar no rótulo abre o editor daquele filtro preso a ele; Esc fecha e o foco volta. */
export const EditarNoLugar: Historia = {
  render: (args) => <ListaFiltrada {...args} filtros={[HOSTNAME, GARANTIA]} editor={editor} />,
  play: async ({ canvasElement }) => {
    const linha = filtros(canvasElement) as HTMLElement;
    const rotulo = within(linha).getByRole('button', {
      name: 'Editar o filtro Hostname: contém almox',
    });
    await userEvent.click(rotulo);
    const popover = await within(document.body).findByRole('dialog', {
      name: 'Filtro de Hostname',
    });
    // O popover entra com a animação de abrir: o conteúdo fica visível no fim dela.
    await waitFor(() =>
      expect(within(popover).getByText('Editor do filtro hostname')).toBeVisible(),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
    await expect(rotulo).toHaveFocus();
    await userEvent.click(rotulo);
    const deNovo = await within(document.body).findByRole('dialog', { name: 'Filtro de Hostname' });
    await userEvent.click(within(deNovo).getByRole('button', { name: 'Pronto' }));
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
  },
};

/** Backspace com o foco no rótulo tira o filtro, e o foco vai para o que ficou no lugar. */
export const BackspaceTira: Historia = {
  render: (args) => <ListaFiltrada {...args} filtros={[HOSTNAME, GARANTIA]} editor={editor} />,
  play: async ({ args, canvasElement }) => {
    const linha = filtros(canvasElement) as HTMLElement;
    within(linha).getByRole('button', { name: 'Editar o filtro Hostname: contém almox' }).focus();
    await userEvent.keyboard('{Backspace}');
    await expect(args.aoLimpar).toHaveBeenCalledWith('hostname');
    await expect(
      within(linha).getByRole('button', {
        name: 'Editar o filtro Garantia até: de 01/01/2026 até 31/12/2026',
      }),
    ).toHaveFocus();
  },
};
