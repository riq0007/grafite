import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { iconesDeAtivo } from '../../icones/ativos.ts';
import { centro, criarPonteiro } from '../../teste/ponteiro.ts';
import { Botao } from '../botao/Botao.tsx';
import { ItemDeMenu, Menu, Separador, Submenu } from './Menu.tsx';

const meta: Meta = { title: 'Componentes/Menu' };
export default meta;

type Historia = StoryObj;

function MenuDeAtivos() {
  return (
    <Menu rotulo="Ativos" gatilho={<Botao>Ativos</Botao>}>
      <ItemDeMenu>Inventário</ItemDeMenu>
      <Submenu rotulo="Rede">
        <ItemDeMenu>Switches</ItemDeMenu>
        <ItemDeMenu>Roteadores</ItemDeMenu>
        <ItemDeMenu>Pontos de acesso</ItemDeMenu>
        <ItemDeMenu>Racks</ItemDeMenu>
      </Submenu>
      <ItemDeMenu>Relatórios</ItemDeMenu>
      <ItemDeMenu>Movimentações</ItemDeMenu>
      <Separador />
      <ItemDeMenu destrutivo>Dar baixa</ItemDeMenu>
    </Menu>
  );
}

const corpoDe = (elemento: HTMLElement) => within(elemento.ownerDocument.body);

/** Cenário da spec: seta para a direita abre o submenu no primeiro item; Esc volta à origem. */
export const SubmenuPeloTeclado: Historia = {
  render: () => <MenuDeAtivos />,
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    await corpo.findByRole('menu', { name: 'Ativos' });
    await waitFor(() => expect(corpo.getByRole('menuitem', { name: 'Inventário' })).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}');
    const rede = corpo.getByRole('menuitem', { name: 'Rede' });
    await expect(rede).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    await corpo.findByRole('menu', { name: 'Rede' });
    await waitFor(() => expect(corpo.getByRole('menuitem', { name: 'Switches' })).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpo.queryByRole('menu', { name: 'Rede' })).toBeNull());
    await expect(corpo.getByRole('menu', { name: 'Ativos' })).toBeVisible();
    await waitFor(() => expect(rede).toHaveFocus());
  },
};

/** Abre o menu com o mouse e o submenu de "Rede" parando o ponteiro sobre o item. */
async function abrirRedePeloMouse(canvasElement: HTMLElement) {
  const corpo = corpoDe(canvasElement);
  const ponteiro = criarPonteiro();
  await ponteiro.usuario.click(within(canvasElement).getByRole('button', { name: 'Ativos' }));
  await corpo.findByRole('menu', { name: 'Ativos' });
  const rede = corpo.getByRole('menuitem', { name: 'Rede' });
  const r = rede.getBoundingClientRect();
  const noFimDeRede = { x: r.right - 12, y: r.top + r.height / 2 };
  await ponteiro.mover({ x: r.left + 12, y: noFimDeRede.y }, noFimDeRede, { passos: 4 });
  await corpo.findByRole('menu', { name: 'Rede' }, { timeout: 1000 });
  return { corpo, ponteiro, noFimDeRede };
}

/**
 * Cenário da spec: do item "Rede" até o submenu, na diagonal, passando sobre o item seguinte;
 * o submenu fica aberto até o ponteiro chegar a ele.
 */
export const MovimentoDiagonal: Historia = {
  render: () => <MenuDeAtivos />,
  play: async ({ canvasElement }) => {
    const { corpo, ponteiro, noFimDeRede } = await abrirRedePeloMouse(canvasElement);
    const destino = centro(corpo.getByRole('menuitem', { name: 'Racks' }).getBoundingClientRect());
    let fechou = false;
    await ponteiro.mover(noFimDeRede, destino, {
      passos: 14,
      intervalo: 20,
      aCadaPasso: () => {
        if (!corpo.queryByRole('menu', { name: 'Rede' })) fechou = true;
      },
    });
    await expect(fechou).toBe(false);
    await waitFor(() => expect(corpo.getByRole('menuitem', { name: 'Racks' })).toHaveFocus());
  },
};

/**
 * Apêndice B: a tolerância decide em 150 ms. O ponteiro segue rumo ao submenu (a tolerância
 * engata: são 8 passos de 25 ms, e ela amostra a cada 50 ms) e para sobre o item vizinho sem
 * chegar ao submenu: o vizinho assume logo. A folga cobre a amostragem e o redisparo.
 */
export const ToleranciaDecideRapido: Historia = {
  render: () => <MenuDeAtivos />,
  play: async ({ canvasElement }) => {
    const { corpo, ponteiro, noFimDeRede } = await abrirRedePeloMouse(canvasElement);
    const relatorios = corpo.getByRole('menuitem', { name: 'Relatórios' });
    const r = relatorios.getBoundingClientRect();
    const sobreRelatorios = { x: r.right - 6, y: r.top + r.height / 2 };
    await ponteiro.mover(noFimDeRede, sobreRelatorios, { passos: 8, intervalo: 25 });
    await expect(corpo.queryByRole('menu', { name: 'Rede' })).not.toBeNull();
    await waitFor(() => expect(corpo.queryByRole('menu', { name: 'Rede' })).toBeNull(), {
      timeout: 450,
    });
    await expect(relatorios).toHaveFocus();
  },
};

/**
 * Controle dos testes acima: afastando-se do submenu (para a esquerda), não há tolerância, e o
 * item vizinho assume na hora. Prova que o fechamento seria percebido se a tolerância faltasse.
 */
export const AfastarDoSubmenuTrocaNaHora: Historia = {
  render: () => <MenuDeAtivos />,
  play: async ({ canvasElement }) => {
    const { corpo, ponteiro } = await abrirRedePeloMouse(canvasElement);
    const rede = corpo.getByRole('menuitem', { name: 'Rede' }).getBoundingClientRect();
    const r = corpo.getByRole('menuitem', { name: 'Relatórios' }).getBoundingClientRect();
    await ponteiro.mover(
      { x: rede.left + rede.width / 2, y: rede.top + rede.height / 2 },
      { x: r.left + 10, y: r.top + r.height / 2 },
      { passos: 8, intervalo: 25 },
    );
    await waitFor(() => expect(corpo.queryByRole('menu', { name: 'Rede' })).toBeNull(), {
      timeout: 300,
    });
  },
};

/** O ícone antes do nome, como o de cada tipo em "Por tipo", decorativo para o leitor de tela. */
export const ItensComIcone: Historia = {
  render: () => (
    <Menu rotulo="Por tipo" gatilho={<Botao>Por tipo</Botao>}>
      <ItemDeMenu icone={iconesDeAtivo.impressora}>Impressora</ItemDeMenu>
      <ItemDeMenu icone={iconesDeAtivo.notebook}>Notebook</ItemDeMenu>
      <ItemDeMenu icone={iconesDeAtivo.switch}>Switch</ItemDeMenu>
    </Menu>
  ),
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Por tipo' }));
    const menu = await corpo.findByRole('menu', { name: 'Por tipo' });
    const itens = within(menu).getAllByRole('menuitem');
    await expect(itens.map((item) => item.textContent)).toEqual([
      'Impressora',
      'Notebook',
      'Switch',
    ]);
    for (const item of itens) {
      const icone = item.querySelector('svg');
      await expect(icone).not.toBeNull();
      await expect(icone).toHaveAttribute('aria-hidden', 'true');
      await expect(item).toHaveAccessibleName(item.textContent ?? '');
    }
    await userEvent.keyboard('{Escape}');
  },
};
