import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, type Mock, userEvent, within } from 'storybook/test';
import { CampoDeData, type PropsDoCampoDeData } from './CampoDeData.tsx';

const meta: Meta<typeof CampoDeData> = {
  title: 'Componentes/Campo de data',
  component: CampoDeData,
  args: { rotulo: 'Data de admissão', aoMudar: fn() },
  decorators: [
    (Historia) => (
      <div style={{ maxWidth: 360 }}>
        <Historia />
      </div>
    ),
  ],
};
export default meta;

type Historia = StoryObj<typeof CampoDeData>;

const caixa = (canvas: HTMLElement) =>
  within(canvas).getByRole('group', { name: 'Data de admissão' });

const dia = (canvas: HTMLElement) => within(canvas).getByRole('spinbutton', { name: /^dia/ });

export const Padrao: Historia = {
  args: { descricao: 'O primeiro dia na empresa.' },
};

/**
 * Digitar 01102026 mostra 01/10/2026, e o valor é 1º de outubro, em aaaa-mm-dd. O formato é o
 * do pt-BR qualquer que seja o idioma do navegador: em inglês, seria 10 de janeiro. Enquanto o
 * ano é digitado, cada data completa já chega (0002, 0020, 0202 e 2026), sempre em 1º de outubro.
 */
export const DigitarUmaData: Historia = {
  play: async ({ args, canvasElement }) => {
    await userEvent.tab();
    await expect(dia(canvasElement)).toHaveFocus();
    await expect(caixa(canvasElement)).toHaveTextContent('dd/mm/aaaa');
    await userEvent.keyboard('01102026');
    await expect(caixa(canvasElement)).toHaveTextContent('01/10/2026');
    await expect(args.aoMudar).toHaveBeenLastCalledWith('2026-10-01');
    for (const [valor] of (args.aoMudar as Mock<NonNullable<PropsDoCampoDeData['aoMudar']>>).mock
      .calls) {
      await expect(valor).toMatch(/^\d{4}-10-01$/);
    }
  },
};

/**
 * 31/02/2026 não existe: o campo diz isso por texto e não aceita a data. Ao sair dele, ela não
 * vira 28/02/2026; o campo volta ao valor de antes, ainda dizendo o que recusou. Corrigida, a
 * data é aceita e o erro some. Quem aplica o valor, como um filtro, sabe da data recusada.
 */
export const DataInexistenteRecusada: Historia = {
  args: { aoRecusar: fn() },
  play: async ({ args, canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.tab();
    await userEvent.keyboard('31022026');
    await expect(tela.getByText('A data 31/02/2026 não existe.')).toBeVisible();
    await expect(args.aoRecusar).toHaveBeenLastCalledWith('31/02/2026');
    await expect(caixa(canvasElement)).toHaveAccessibleDescription(
      /A data 31\/02\/2026 não existe/,
    );

    await userEvent.tab();
    await expect(dia(canvasElement)).not.toHaveFocus();
    await expect(args.aoMudar).not.toHaveBeenCalled();
    await expect(caixa(canvasElement)).not.toHaveTextContent('28/02/2026');
    await expect(caixa(canvasElement)).toHaveTextContent('dd/mm/aaaa');
    await expect(tela.getByText('A data 31/02/2026 não existe.')).toBeVisible();

    await userEvent.click(dia(canvasElement));
    await userEvent.keyboard('28022026');
    await expect(args.aoMudar).toHaveBeenLastCalledWith('2026-02-28');
    await expect(tela.queryByText(/não existe/)).toBeNull();
    await expect(args.aoRecusar).toHaveBeenLastCalledWith(null);
  },
};

/** O rótulo nomeia o campo, e a descrição e o erro vindo de fora ficam ligados a ele. */
export const RotuloDescricaoEErro: Historia = {
  args: {
    descricao: 'O primeiro dia na empresa.',
    erro: 'A data de admissão não pode ser futura.',
    obrigatorio: true,
  },
  play: async ({ canvasElement }) => {
    const grupo = caixa(canvasElement);
    await expect(grupo).toHaveAccessibleDescription(/O primeiro dia na empresa\./);
    await expect(grupo).toHaveAccessibleDescription(/A data de admissão não pode ser futura\./);
    await expect(
      within(canvasElement).getByText('A data de admissão não pode ser futura.'),
    ).toBeVisible();
    await expect(dia(canvasElement)).toHaveAttribute('aria-invalid', 'true');
    await expect(within(canvasElement).getByText('obrigatório')).toBeVisible();
  },
};

function DataControlada(props: PropsDoCampoDeData) {
  const [valor, definirValor] = useState<string | null>('2026-10-01');
  return (
    <form aria-label="Pessoa">
      <CampoDeData
        {...props}
        valor={valor}
        aoMudar={(novo) => {
          definirValor(novo);
          props.aoMudar?.(novo);
        }}
      />
    </form>
  );
}

/** O valor entra e sai em aaaa-mm-dd, e o formulário recebe o mesmo texto. */
export const ValorEmAaaaMmDd: Historia = {
  args: { name: 'admissao' },
  render: (args) => <DataControlada {...args} />,
  play: async ({ args, canvasElement }) => {
    await expect(caixa(canvasElement)).toHaveTextContent('01/10/2026');
    const formulario = within(canvasElement).getByRole('form', { name: 'Pessoa' });
    const valorEnviado = () => new FormData(formulario as HTMLFormElement).get('admissao');
    await expect(valorEnviado()).toBe('2026-10-01');
    await userEvent.click(dia(canvasElement));
    await userEvent.keyboard('{ArrowUp}');
    await expect(args.aoMudar).toHaveBeenLastCalledWith('2026-10-02');
    await expect(caixa(canvasElement)).toHaveTextContent('02/10/2026');
    await expect(valorEnviado()).toBe('2026-10-02');
  },
};
