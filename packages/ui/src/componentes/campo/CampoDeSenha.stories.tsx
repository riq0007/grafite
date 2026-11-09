import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { CampoDeSenha } from './CampoDeSenha.tsx';

const meta: Meta<typeof CampoDeSenha> = {
  title: 'Componentes/Campo de senha',
  component: CampoDeSenha,
  args: { rotulo: 'Senha', autoComplete: 'current-password' },
  decorators: [
    (Historia) => (
      <div style={{ maxWidth: 360 }}>
        <Historia />
      </div>
    ),
  ],
};
export default meta;

type Historia = StoryObj<typeof CampoDeSenha>;

export const Padrao: Historia = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const campo = tela.getByLabelText('Senha');
    await expect(campo).toHaveAttribute('type', 'password');
    await expect(campo).toHaveAttribute('autocomplete', 'current-password');
    await userEvent.type(campo, 'cavalo bateria');
    // O clique mostra a senha sem tirar o foco da digitação, e a senha continua a mesma.
    await userEvent.click(tela.getByRole('button', { name: 'Mostrar senha' }));
    await expect(campo).toHaveAttribute('type', 'text');
    await expect(campo).toHaveFocus();
    await expect(campo).toHaveValue('cavalo bateria');
    await userEvent.click(tela.getByRole('button', { name: 'Ocultar senha' }));
    await expect(campo).toHaveAttribute('type', 'password');
  },
};

export const PeloTeclado: Historia = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.tab();
    await expect(tela.getByLabelText('Senha')).toHaveFocus();
    await userEvent.tab();
    const botao = tela.getByRole('button', { name: 'Mostrar senha' });
    await expect(botao).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(tela.getByLabelText('Senha')).toHaveAttribute('type', 'text');
    await expect(tela.getByRole('button', { name: 'Ocultar senha' })).toHaveFocus();
  },
};

export const SenhaNova: Historia = {
  args: {
    rotulo: 'Senha nova',
    autoComplete: 'new-password',
    descricao: 'Use pelo menos 12 caracteres. Uma frase longa é uma boa senha.',
  },
  play: async ({ canvasElement }) => {
    const campo = within(canvasElement).getByLabelText('Senha nova');
    await expect(campo).toHaveAttribute('autocomplete', 'new-password');
    await expect(campo).toHaveAccessibleDescription(
      'Use pelo menos 12 caracteres. Uma frase longa é uma boa senha.',
    );
  },
};

/** O erro vindo de fora (da API ou da regra da senha) fica ligado ao campo e é lido com ele. */
export const ComErro: Historia = {
  args: {
    rotulo: 'Senha nova',
    autoComplete: 'new-password',
    erro: 'A senha não pode conter o seu usuário.',
  },
  play: async ({ canvasElement }) => {
    const campo = within(canvasElement).getByLabelText('Senha nova');
    await expect(campo).toHaveAttribute('aria-invalid', 'true');
    await expect(campo).toHaveAccessibleDescription('A senha não pode conter o seu usuário.');
  },
};
