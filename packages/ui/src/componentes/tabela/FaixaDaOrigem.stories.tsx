import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Checkbox } from '../escolhas/Checkbox.tsx';
import { FaixaDaOrigem } from './FaixaDaOrigem.tsx';

const meta: Meta = { title: 'Componentes/Faixa da origem' };
export default meta;

type Historia = StoryObj<{ aoLimpar: () => void; aoIncluir: (incluir: boolean) => void }>;

/** A origem do local, com "Incluir os locais de dentro" e "Limpar origem". */
export const DoLocal: Historia = {
  args: { aoLimpar: fn(), aoIncluir: fn() },
  render: ({ aoLimpar, aoIncluir }) => {
    const [incluir, definirIncluir] = useState(false);
    return (
      <FaixaDaOrigem
        descricao="Ativos de Jundiaí › Expedição (vindo do local)"
        opcao={
          <Checkbox
            isSelected={incluir}
            onChange={(marcado) => {
              definirIncluir(marcado);
              aoIncluir(marcado);
            }}
          >
            Incluir os locais de dentro
          </Checkbox>
        }
        aoLimpar={aoLimpar}
      />
    );
  },
  play: async ({ args, canvasElement }) => {
    const faixa = within(canvasElement).getByRole('group', { name: 'Origem da tabela' });
    await expect(faixa).toHaveTextContent('Ativos de Jundiaí › Expedição (vindo do local)');
    await userEvent.click(
      within(faixa).getByRole('checkbox', { name: 'Incluir os locais de dentro' }),
    );
    await expect(args.aoIncluir).toHaveBeenCalledWith(true);
    await userEvent.click(within(faixa).getByRole('button', { name: 'Limpar origem' }));
    await expect(args.aoLimpar).toHaveBeenCalledTimes(1);
  },
};

/** A origem de uma pessoa, sem opção. */
export const DaPessoa: Historia = {
  args: { aoLimpar: fn() },
  render: ({ aoLimpar }) => (
    <FaixaDaOrigem descricao="Ativos sob responsabilidade de Ana Souza" aoLimpar={aoLimpar} />
  ),
};
