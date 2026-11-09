import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { ListaDeDados } from './ListaDeDados.tsx';

// A lista de dados de uma ficha (change cabecalhos-e-fichas, design, decisão 3).
const meta: Meta = { title: 'Componentes/Lista de dados' };
export default meta;

type Historia = StoryObj;

const ITENS = [
  { rotulo: 'Ativo', valor: 'Impressora 139 · PAT-00139' },
  { rotulo: 'Local', valor: 'Jundiaí › Expedição' },
  { rotulo: 'Problema', valor: 'Mancha na impressão depois da troca do toner.' },
  { rotulo: 'Aberta', valor: '28/10/2026 17:21, por Administrador' },
];

/** Os dados da ficha de uma OS: o rótulo numa coluna e o valor ao lado. */
export const DadosDaOrdem: Historia = {
  tags: ['captura'],
  render: () => (
    <div style={{ padding: 'var(--esp-4)', background: 'var(--cor-superficie)', maxWidth: 720 }}>
      <ListaDeDados itens={ITENS} />
    </div>
  ),
};

/** Na largura estreita, o rótulo fica em cima do valor. */
export const LarguraEstreita: Historia = {
  render: () => (
    <div style={{ padding: 'var(--esp-4)', background: 'var(--cor-superficie)', width: 320 }}>
      <ListaDeDados itens={ITENS} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const [termo] = within(canvasElement).getAllByRole('term') as [HTMLElement];
    const [definicao] = within(canvasElement).getAllByRole('definition') as [HTMLElement];
    await expect(definicao.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      termo.getBoundingClientRect().bottom - 1,
    );
  },
};
