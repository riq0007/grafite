import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Selecao } from '../selecao/Selecao.tsx';
import { Formulario } from './Formulario.tsx';
import { LinkDeCadastro, type PropsDoLinkDeCadastro } from './LinkDeCadastro.tsx';

const meta: Meta<PropsDoLinkDeCadastro> = {
  title: 'Componentes/Link de cadastro',
  component: LinkDeCadastro,
  args: { texto: 'Cadastrar novo local', campo: 'Local', aoPressionar: fn() },
  render: (args) => (
    <Formulario>
      <Selecao
        rotulo="Local"
        opcoes={[
          { id: 'almoxarifado', rotulo: 'Almoxarifado' },
          { id: 'sede', rotulo: 'Sede' },
        ]}
        isDisabled={args.campoBloqueado}
      />
      <LinkDeCadastro {...args} />
    </Formulario>
  ),
};
export default meta;

type Historia = StoryObj<PropsDoLinkDeCadastro>;

/**
 * O link vem logo depois do campo na ordem do teclado, e o leitor de tela o anuncia com o nome do
 * campo; o Enter abre o cadastro.
 */
export const AnunciadoComOCampo: Historia = {
  play: async ({ args, canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.tab();
    await expect(tela.getByRole('button', { name: /Local/ })).toHaveFocus();
    await userEvent.tab();
    const link = tela.getByRole('button', { name: 'Cadastrar novo local' });
    await expect(link).toHaveFocus();
    await expect(link).toHaveAccessibleDescription('Campo Local');
    await userEvent.keyboard('{Enter}');
    await expect(args.aoPressionar).toHaveBeenCalledOnce();
  },
};

/**
 * O link na fonte da interface, como o rótulo do campo, e não na fonte de fábrica do botão do
 * navegador (docs/ANTISLOP.md, seção 14).
 */
export const NaFonteDaInterface: Historia = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const link = tela.getByRole('button', { name: 'Cadastrar novo local' });
    const rotulo = tela.getByText('Local');
    await expect(getComputedStyle(link).fontFamily).toBe(getComputedStyle(rotulo).fontFamily);
  },
};

/** Com o campo desabilitado ou só para leitura, o link não aparece. */
export const CampoSoParaLeitura: Historia = {
  args: { campoBloqueado: true },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.getByText('Local')).toBeVisible();
    await expect(tela.queryByRole('button', { name: 'Cadastrar novo local' })).toBeNull();
  },
};
