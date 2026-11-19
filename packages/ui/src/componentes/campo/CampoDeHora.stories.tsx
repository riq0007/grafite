import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { CampoDeHora, type PropsDoCampoDeHora } from './CampoDeHora.tsx';

/** O campo com o valor que ele mesmo avisa, como numa tela. */
function Controlado(props: PropsDoCampoDeHora) {
  const [valor, definirValor] = useState(props.valor);
  return (
    <CampoDeHora
      {...props}
      valor={valor}
      aoMudar={(novo) => {
        definirValor(novo);
        props.aoMudar(novo);
      }}
    />
  );
}

const meta: Meta<typeof CampoDeHora> = {
  title: 'Componentes/Campo de hora',
  component: CampoDeHora,
  args: { rotulo: 'Início', valor: 8 * 60, aoMudar: fn() },
  render: (args) => <Controlado {...args} />,
  decorators: [
    (Historia) => (
      <div style={{ maxWidth: 200 }}>
        <Historia />
      </div>
    ),
  ],
};
export default meta;

type Historia = StoryObj<typeof CampoDeHora>;

const caixa = (canvas: HTMLElement) => within(canvas).getByRole('group', { name: 'Início' });

export const Padrao: Historia = {
  args: { descricao: 'Em 24 h, no fuso do horário.' },
};

/**
 * Digitar 1745 nas horas mostra 17:45, sem manhã nem tarde, qualquer que seja o idioma do
 * navegador, e o valor é o minuto do dia.
 */
export const DigitarUmaHora: Historia = {
  play: async ({ args, canvasElement }) => {
    await userEvent.tab();
    await userEvent.keyboard('1745');
    await expect(caixa(canvasElement)).toHaveTextContent('17:45');
    await expect(args.aoMudar).toHaveBeenLastCalledWith(17 * 60 + 45);
  },
};

export const ComErro: Historia = {
  args: { rotulo: 'Fim', valor: 8 * 60, erro: 'O fim vem depois do início.' },
};
