import type { Meta, StoryObj } from '@storybook/react-vite';
import { Carimbo } from './Carimbo.tsx';

const meta: Meta<typeof Carimbo> = {
  title: 'Componentes/Carimbo',
  component: Carimbo,
};
export default meta;

type Historia = StoryObj<typeof Carimbo>;

/** Os títulos de seção da ficha de uma impressora, como os carimbos de uma prancha. */
export const Secoes: Historia = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--esp-6)', maxWidth: 640 }}>
      <Carimbo>Suprimentos</Carimbo>
      <Carimbo nivel={3}>Contadores</Carimbo>
      <Carimbo nivel={3}>Condições</Carimbo>
    </div>
  ),
};
