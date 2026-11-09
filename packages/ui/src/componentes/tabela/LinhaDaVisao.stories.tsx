import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { LinhaDaVisao, type PropsDaLinhaDaVisao } from './LinhaDaVisao.tsx';

type Args = Pick<PropsDaLinhaDaVisao, 'aoRestaurar' | 'aoSalvarComoNova' | 'aoVoltar'>;

const meta: Meta<Args> = {
  title: 'Componentes/Linha da visão',
  args: { aoRestaurar: fn(), aoSalvarComoNova: fn(), aoVoltar: fn() },
};
export default meta;

type Historia = StoryObj<Args>;

const linha = (canvas: HTMLElement) =>
  within(canvas).getByRole('group', { name: 'Estado da visão' });

/** A visão personalizada diz o que a conta mudou, e que fica guardado, com as ações à vista. */
export const Personalizada: Historia = {
  tags: ['captura'],
  render: (args) => <LinhaDaVisao estado="personalizada" mudou={['colunas', 'ordem']} {...args} />,
  play: async ({ args, canvasElement }) => {
    const grupo = linha(canvasElement);
    await expect(grupo).toHaveTextContent(
      'Você mudou as colunas e a ordem. As mudanças ficam guardadas para você.',
    );
    await userEvent.click(within(grupo).getByRole('button', { name: 'Restaurar a visão' }));
    await expect(args.aoRestaurar).toHaveBeenCalledOnce();
    await userEvent.click(within(grupo).getByRole('button', { name: 'Salvar como nova visão…' }));
    await expect(args.aoSalvarComoNova).toHaveBeenCalledOnce();
  },
};

/** As colunas, a ordem e os filtros, numa frase só. */
export const TudoMudado: Historia = {
  render: (args) => (
    <LinhaDaVisao estado="personalizada" mudou={['colunas', 'ordem', 'filtros']} {...args} />
  ),
  play: async ({ canvasElement }) => {
    await expect(linha(canvasElement)).toHaveTextContent(
      'Você mudou as colunas, a ordem e os filtros.',
    );
  },
};

/** A tabela de um link diz de onde veio e volta à tabela da conta. */
export const DoLink: Historia = {
  tags: ['captura'],
  render: (args) => <LinhaDaVisao estado="do-link" {...args} />,
  play: async ({ args, canvasElement }) => {
    const grupo = linha(canvasElement);
    await expect(grupo).toHaveTextContent('Esta tabela veio de um link.');
    await expect(within(grupo).queryByRole('button', { name: 'Restaurar a visão' })).toBeNull();
    await userEvent.click(within(grupo).getByRole('button', { name: 'Voltar à minha tabela' }));
    await expect(args.aoVoltar).toHaveBeenCalledOnce();
  },
};

/** A visão salva não tem linha. */
export const Salva: Historia = {
  render: (args) => <LinhaDaVisao estado="salva" {...args} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('group')).toBeNull();
  },
};
