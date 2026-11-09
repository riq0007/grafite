import type { Meta, StoryObj } from '@storybook/react-vite';
import { Marca } from './Marca.tsx';

const meta: Meta<typeof Marca> = {
  title: 'Identidade/Marca',
  component: Marca,
};
export default meta;

type Historia = StoryObj<typeof Marca>;

/** As duas versões nos tamanhos de uso: barra superior (14 px), carregamento e ícones. */
export const Versoes: Historia = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--esp-6)', justifyItems: 'start' }}>
      <Marca altura={14} />
      <Marca altura={32} />
      <div style={{ display: 'flex', gap: 'var(--esp-6)', alignItems: 'center' }}>
        <Marca variante="simbolo" altura={16} />
        <Marca variante="simbolo" altura={32} />
        <Marca variante="simbolo" altura={64} />
      </div>
    </div>
  ),
};
