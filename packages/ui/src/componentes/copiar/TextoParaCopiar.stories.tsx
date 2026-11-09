import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Botao } from '../botao/Botao.tsx';
import { TextoParaCopiar } from './TextoParaCopiar.tsx';

const meta: Meta<typeof TextoParaCopiar> = {
  title: 'Componentes/Texto para copiar',
  component: TextoParaCopiar,
  args: { rotulo: 'Senha temporária', valor: 'k7Q2-mX9p-L4zw', copiar: fn(async () => {}) },
  decorators: [
    (Historia) => (
      <div style={{ maxWidth: 420 }}>
        <Historia />
      </div>
    ),
  ],
};
export default meta;

type Historia = StoryObj<typeof TextoParaCopiar>;

const grupo = (canvas: HTMLElement) =>
  within(canvas).getByRole('group', { name: 'Senha temporária' });

export const Padrao: Historia = {};

/** "Copiar" leva o valor à área de transferência e passa a dizer "Copiado", por texto. */
export const CopiarViraCopiado: Historia = {
  play: async ({ args, canvasElement }) => {
    const senha = within(grupo(canvasElement)).getByText('k7Q2-mX9p-L4zw');
    await expect(getComputedStyle(senha).fontFamily).toContain('JetBrains Mono');
    await userEvent.click(within(grupo(canvasElement)).getByRole('button', { name: 'Copiar' }));
    await expect(args.copiar).toHaveBeenCalledWith('k7Q2-mX9p-L4zw');
    await expect(
      await within(grupo(canvasElement)).findByRole('button', { name: 'Copiado' }),
    ).toBeVisible();
    await expect(within(grupo(canvasElement)).getByRole('status')).toHaveTextContent('Copiado.');
  },
};

/** Sem permissão do navegador, o texto pede para selecionar e copiar; o botão segue "Copiar". */
export const CopiaRecusada: Historia = {
  args: {
    copiar: fn(async () => {
      throw new Error('negado');
    }),
  },
  play: async ({ canvasElement }) => {
    const tela = within(grupo(canvasElement));
    await userEvent.click(tela.getByRole('button', { name: 'Copiar' }));
    await waitFor(() =>
      expect(tela.getByText('Não foi possível copiar. Selecione o texto e copie.')).toBeVisible(),
    );
    await expect(tela.getByRole('button', { name: 'Copiar' })).toBeVisible();
  },
};

function SenhaQueMuda(props: { copiar?: (texto: string) => Promise<void> }) {
  const [senha, definirSenha] = useState('k7Q2-mX9p-L4zw');
  return (
    <>
      <TextoParaCopiar rotulo="Senha temporária" valor={senha} copiar={props.copiar} />
      <Botao onPress={() => definirSenha('Wq8r-2Lp5-tZ3k')}>Gerar outra</Botao>
    </>
  );
}

/** Com outro valor, o botão volta a dizer "Copiar". */
export const OutroValorVoltaACopiar: Historia = {
  render: (args) => <SenhaQueMuda copiar={args.copiar} />,
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.click(within(grupo(canvasElement)).getByRole('button', { name: 'Copiar' }));
    await within(grupo(canvasElement)).findByRole('button', { name: 'Copiado' });
    await userEvent.click(tela.getByRole('button', { name: 'Gerar outra' }));
    await expect(within(grupo(canvasElement)).getByText('Wq8r-2Lp5-tZ3k')).toBeVisible();
    await expect(
      within(grupo(canvasElement)).getByRole('button', { name: 'Copiar' }),
    ).toBeVisible();
    await expect(within(grupo(canvasElement)).getByRole('status')).toBeEmptyDOMElement();
  },
};

/** O valor pode aparecer de outro jeito, como os códigos numa lista; copia-se o valor dado. */
export const ConteudoProprio: Historia = {
  args: { rotulo: 'Códigos de recuperação', valor: 'a7k2m-9qx4t\nb3n8p-2wr6y' },
  render: (args) => (
    <TextoParaCopiar {...args}>
      <ol>
        <li>a7k2m-9qx4t</li>
        <li>b3n8p-2wr6y</li>
      </ol>
    </TextoParaCopiar>
  ),
  play: async ({ args, canvasElement }) => {
    const codigos = within(canvasElement).getByRole('group', { name: 'Códigos de recuperação' });
    await expect(within(codigos).getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(within(codigos).getByRole('button', { name: 'Copiar' }));
    await expect(args.copiar).toHaveBeenCalledWith('a7k2m-9qx4t\nb3n8p-2wr6y');
  },
};
