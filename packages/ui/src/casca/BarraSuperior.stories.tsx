import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { BarraSuperior } from './BarraSuperior.tsx';
import { MENUS_DA_BARRA_DE_EXEMPLO } from './exemplos.tsx';

const meta: Meta<typeof BarraSuperior> = {
  title: 'Casca/Barra superior',
  component: BarraSuperior,
  args: {
    modulo: 'Ativos',
    menus: MENUS_DA_BARRA_DE_EXEMPLO,
    aoEscolherItem: fn(),
    status: <span>Itens de status (exemplo)</span>,
    usuario: { itens: [{ id: 'ajustes', rotulo: 'Ajustes do Sistema' }], aoEscolherItem: fn() },
  },
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Historia = StoryObj<typeof BarraSuperior>;

const corpo = () => within(document.body);

/** Marca, nome do módulo e os menus dele à esquerda; itens de status à direita. */
export const Padrao: Historia = {};

/** Com a sessão valendo, o item de usuário mostra as iniciais da conta, com o nome dela. */
export const ComAConta: Historia = {
  args: {
    usuario: {
      nome: 'Ana Souza',
      itens: [
        { id: '/ajustes/conta', rotulo: 'Conta' },
        { id: '/ajustes', rotulo: 'Ajustes do Sistema' },
        { id: 'sair', rotulo: 'Sair', separadoAntes: true },
      ],
      aoEscolherItem: fn(),
    },
  },
};

/** Um módulo sem menus na barra mostra só o nome, que não é um botão. */
export const SemMenus: Historia = {
  args: { modulo: 'Início', menus: [] },
  play: async ({ canvasElement }) => {
    const barra = within(canvasElement).getByRole('banner');
    await expect(within(barra).getByText('Início')).toBeInTheDocument();
    await expect(within(barra).queryByRole('button', { name: 'Início' })).toBeNull();
    await expect(within(barra).queryByRole('button', { name: 'Visualizar' })).toBeNull();
  },
};

/**
 * O menu do usuário com a sessão valendo: as iniciais à vista, o nome como nome acessível, e
 * "Conta", "Ajustes do Sistema" e "Sair", com a linha antes de "Sair".
 */
export const MenuDaConta: Historia = {
  args: {
    usuario: {
      nome: 'Ana Souza',
      itens: [
        { id: '/ajustes/conta', rotulo: 'Conta' },
        { id: '/ajustes', rotulo: 'Ajustes do Sistema' },
        { id: 'sair', rotulo: 'Sair', separadoAntes: true },
      ],
      aoEscolherItem: fn(),
    },
  },
  play: async ({ args, canvasElement }) => {
    const usuario = within(canvasElement).getByRole('button', { name: 'Ana Souza' });
    await expect(usuario).toHaveTextContent('AS');
    await userEvent.click(usuario);
    const menu = await corpo().findByRole('menu', { name: 'Ana Souza' });
    const itens = within(menu).getAllByRole('menuitem');
    await expect(itens.map((item) => item.textContent)).toEqual([
      'Conta',
      'Ajustes do Sistema',
      'Sair',
    ]);
    const separador = within(menu).getByRole('separator');
    // A linha fica entre "Ajustes do Sistema" e "Sair".
    await expect(
      itens[1]?.compareDocumentPosition(separador) === Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(true);
    await expect(
      separador.compareDocumentPosition(itens[2] as Node) === Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(true);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Sair' }));
    await expect(args.usuario?.aoEscolherItem).toHaveBeenCalledWith('sair');
  },
};

/**
 * Sem a sessão conhecida (o servidor não respondeu), o avatar é neutro, sem nome nem iniciais
 * inventados, e o menu oferece só Ajustes do Sistema.
 */
export const MenuDoUsuario: Historia = {
  play: async ({ args, canvasElement }) => {
    const usuario = within(canvasElement).getByRole('button', { name: 'Usuário' });
    await expect(usuario.textContent).toBe('');
    await userEvent.click(usuario);
    const menu = await corpo().findByRole('menu', { name: 'Usuário' });
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Ajustes do Sistema' }));
    await expect(args.usuario?.aoEscolherItem).toHaveBeenCalledWith('ajustes');
    await waitFor(() => expect(corpo().queryAllByRole('menu')).toHaveLength(0));
  },
};

/** Os menus da barra abrem pelo clique, e escolher um item avisa o módulo. */
export const MenusPeloClique: Historia = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Visualizar' }));
    const menu = await corpo().findByRole('menu', { name: 'Visualizar' });
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Galeria' }));
    await expect(args.aoEscolherItem).toHaveBeenCalledWith('visualizar', 'visualizar/galeria');
    await waitFor(() => expect(corpo().queryAllByRole('menu')).toHaveLength(0));
  },
};

/** Pelo teclado: Tab até o menu, Enter abre com o foco no primeiro item. */
export const MenusPeloTeclado: Historia = {
  play: async ({ args }) => {
    await userEvent.tab();
    await expect(document.activeElement).toHaveAccessibleName('Visualizar');
    await userEvent.keyboard('{Enter}');
    const menu = await corpo().findByRole('menu', { name: 'Visualizar' });
    await waitFor(() =>
      expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: 'Lista' })),
    );
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(args.aoEscolherItem).toHaveBeenCalledWith('visualizar', 'visualizar/galeria');
  },
};

/** Numa barra de 900 px, os menus do módulo se reúnem no nome dele e continuam utilizáveis. */
export const Estreita: Historia = {
  render: (args) => (
    <div style={{ width: 900 }}>
      <BarraSuperior {...args} />
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.queryByRole('button', { name: 'Visualizar' })).toBeNull();
    await userEvent.click(tela.getByRole('button', { name: 'Ativos' }));
    const menu = await corpo().findByRole('menu', { name: 'Ativos' });
    // Aberto pelo mouse: o submenu abre ao parar o ponteiro sobre o item.
    await userEvent.hover(within(menu).getByRole('menuitem', { name: 'Visualizar' }));
    const submenu = await corpo().findByRole('menu', { name: 'Visualizar' });
    await userEvent.click(within(submenu).getByRole('menuitem', { name: 'Galeria' }));
    await expect(args.aoEscolherItem).toHaveBeenCalledWith('visualizar', 'visualizar/galeria');
  },
};
