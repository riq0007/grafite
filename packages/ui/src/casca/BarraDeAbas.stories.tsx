import type { Meta, StoryObj } from '@storybook/react-vite';
import { Map as Mapa, Users, Vault } from 'lucide-react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { BarraDeAbas } from './BarraDeAbas.tsx';
import { AJUSTES_DE_EXEMPLO, MODULOS_DE_EXEMPLO } from './exemplos.tsx';
import type { ModuloDaCasca } from './tipos.ts';

const CINCO: readonly ModuloDaCasca[] = [...MODULOS_DE_EXEMPLO, ...AJUSTES_DE_EXEMPLO];
const SETE: readonly ModuloDaCasca[] = [
  ...CINCO,
  { id: 'mapa', nome: 'Mapa', icone: Mapa, prioridadeNoCelular: 4 },
  { id: 'cofre', nome: 'Cofre', icone: Vault, prioridadeNoCelular: 7 },
];

const meta: Meta<typeof BarraDeAbas> = {
  title: 'Casca/Barra de abas',
  component: BarraDeAbas,
  args: { modulos: CINCO.slice(0, 3), atual: 'inicio', aoAbrirModulo: fn() },
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Historia = StoryObj<typeof BarraDeAbas>;

const nomesDasAbas = (canvasElement: HTMLElement) =>
  within(within(canvasElement).getByRole('navigation', { name: 'Módulos' }))
    .getAllByRole('button')
    .map((aba) => aba.getAttribute('aria-label') ?? aba.textContent);

/** Até cinco módulos: uma aba para cada, sem "Mais". */
export const TresModulos: Historia = {
  play: async ({ args, canvasElement }) => {
    await expect(nomesDasAbas(canvasElement)).toEqual(['Início', 'Ativos', 'Operação']);
    const ativos = within(canvasElement).getByRole('button', { name: 'Ativos' });
    await userEvent.click(ativos);
    await expect(args.aoAbrirModulo).toHaveBeenCalledWith('ativos');
    await expect(within(canvasElement).getByRole('button', { name: 'Início' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  },
};

/** Mais de cinco módulos: os quatro de maior prioridade e "Mais", que lista os outros. */
export const SeteModulos: Historia = {
  args: { modulos: SETE },
  play: async ({ args, canvasElement }) => {
    await expect(nomesDasAbas(canvasElement)).toEqual([
      'Início',
      'Ativos',
      'Operação',
      'Mapa',
      'Mais',
    ]);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Mais' }));
    const painel = await within(document.body).findByRole('dialog', { name: 'Mais' });
    const outros = within(painel)
      .getAllByRole('button')
      .map((botao) => botao.textContent)
      .filter((texto) => texto !== '');
    await expect(outros).toEqual(['Rede', 'Cofre', 'Ajustes']);
    await userEvent.click(within(painel).getByRole('button', { name: 'Cofre' }));
    await expect(args.aoAbrirModulo).toHaveBeenCalledWith('cofre');
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
  },
};

/**
 * Um módulo que fica sempre em "Mais", como a Administração: a barra mostra "Mais" mesmo com
 * menos de cinco módulos, e as abas são os outros.
 */
export const ModuloQueFicaEmMais: Historia = {
  args: {
    modulos: [
      ...CINCO.slice(0, 1),
      { id: 'administracao', nome: 'Administração', icone: Users, prioridadeNoCelular: 'mais' },
      ...AJUSTES_DE_EXEMPLO,
    ],
  },
  play: async ({ args, canvasElement }) => {
    await expect(nomesDasAbas(canvasElement)).toEqual(['Início', 'Ajustes', 'Mais']);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Mais' }));
    const painel = await within(document.body).findByRole('dialog', { name: 'Mais' });
    await userEvent.click(within(painel).getByRole('button', { name: 'Administração' }));
    await expect(args.aoAbrirModulo).toHaveBeenCalledWith('administracao');
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
  },
};

/** Com mais de cinco módulos e um que fica em "Mais", ele entra depois dos que não cabem. */
export const SeteModulosEUmEmMais: Historia = {
  args: {
    modulos: [
      ...SETE,
      { id: 'administracao', nome: 'Administração', icone: Users, prioridadeNoCelular: 'mais' },
    ],
  },
  play: async ({ canvasElement }) => {
    await expect(nomesDasAbas(canvasElement)).toEqual([
      'Início',
      'Ativos',
      'Operação',
      'Mapa',
      'Mais',
    ]);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Mais' }));
    const painel = await within(document.body).findByRole('dialog', { name: 'Mais' });
    const outros = within(painel)
      .getAllByRole('button')
      .map((botao) => botao.textContent)
      .filter((texto) => texto !== '');
    await expect(outros).toEqual(['Rede', 'Cofre', 'Ajustes', 'Administração']);
  },
};
