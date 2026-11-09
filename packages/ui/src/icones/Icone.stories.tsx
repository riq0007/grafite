import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bell, Search, Settings2 } from 'lucide-react';
import { expect, within } from 'storybook/test';
import { BotaoDeIcone, Icone } from './Icone.tsx';

const meta: Meta<typeof BotaoDeIcone> = {
  title: 'Ícones/Botão de ícone',
  component: BotaoDeIcone,
  args: { icone: Search, rotulo: 'Buscar' },
};
export default meta;

type Historia = StoryObj<typeof BotaoDeIcone>;

export const Padrao: Historia = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.getByRole('button', { name: 'Buscar' })).toBeVisible();
  },
};

export const EmBarra: Historia = {
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--esp-1)', color: 'var(--cor-texto-2)' }}>
      <BotaoDeIcone icone={Search} rotulo="Buscar" />
      <BotaoDeIcone icone={Bell} rotulo="Notificações" />
      <BotaoDeIcone icone={Settings2} rotulo="Ajustes" />
      <Icone icone={Bell} rotulo="3 alertas" />
    </div>
  ),
};
