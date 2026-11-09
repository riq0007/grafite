import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Botao } from '../componentes/botao/Botao.tsx';
import { MODULOS_DE_EXEMPLO } from './exemplos.tsx';
import { PainelDeBaixo, type PropsDoPainelDeBaixo } from './PainelDeBaixo.tsx';

const ATIVOS = MODULOS_DE_EXEMPLO.find((modulo) => modulo.id === 'ativos');

/** Painel controlado por um botão, como a barra de abas e o nome do módulo fazem no celular. */
function Demonstracao(props: Omit<PropsDoPainelDeBaixo, 'aberto' | 'aoMudarAberto'>) {
  const [aberto, definirAberto] = useState(false);
  return (
    <>
      <Botao onPress={() => definirAberto(true)}>Abrir o menu de Ativos</Botao>
      <PainelDeBaixo {...props} aberto={aberto} aoMudarAberto={definirAberto} />
    </>
  );
}

const meta: Meta<typeof Demonstracao> = {
  title: 'Casca/Painel de baixo',
  component: Demonstracao,
  args: { titulo: 'Ativos', itens: ATIVOS?.menu ?? [], aoEscolher: fn() },
};
export default meta;

type Historia = StoryObj<typeof Demonstracao>;

const corpo = () => within(document.body);

async function abrir(canvasElement: HTMLElement) {
  await userEvent.click(
    within(canvasElement).getByRole('button', { name: 'Abrir o menu de Ativos' }),
  );
  return corpo().findByRole('dialog', { name: 'Ativos' });
}

export const Padrao: Historia = {};

/** Um item com submenu abre o nível no próprio painel; Voltar retorna, com o foco no item. */
export const NiveisEVoltar: Historia = {
  play: async ({ canvasElement }) => {
    const painel = await abrir(canvasElement);
    await userEvent.click(within(painel).getByRole('button', { name: 'Rede' }));
    const nivel = await corpo().findByRole('dialog', { name: 'Rede' });
    await expect(within(nivel).getByRole('button', { name: 'Switches' })).toBeInTheDocument();
    await userEvent.click(within(nivel).getByRole('button', { name: 'Voltar' }));
    const raiz = await corpo().findByRole('dialog', { name: 'Ativos' });
    await waitFor(() => expect(within(raiz).getByRole('button', { name: 'Rede' })).toHaveFocus());
  },
};

/** Área de toque de um elemento: o tamanho de layout, sem a animação de subir. */
const areaDe = (elemento: HTMLElement) => [elemento.offsetWidth, elemento.offsetHeight];

/** Todo alvo do painel tem pelo menos 44 × 44 px: Fechar, os itens e o Voltar de um nível. */
export const AlvosDeToque: Historia = {
  play: async ({ canvasElement }) => {
    const painel = await abrir(canvasElement);
    await userEvent.click(within(painel).getByRole('button', { name: 'Rede' }));
    const nivel = await corpo().findByRole('dialog', { name: 'Rede' });
    for (const alvo of within(nivel).getAllByRole('button')) {
      const [largura = 0, altura = 0] = areaDe(alvo);
      await expect(largura, alvo.textContent ?? '').toBeGreaterThanOrEqual(44);
      await expect(altura, alvo.textContent ?? '').toBeGreaterThanOrEqual(44);
    }
  },
};

/** Escolher um item avisa quem abriu e fecha o painel. */
export const EscolherFecha: Historia = {
  play: async ({ args, canvasElement }) => {
    const painel = await abrir(canvasElement);
    await userEvent.click(within(painel).getByRole('button', { name: 'Todos os ativos' }));
    await expect(args.aoEscolher).toHaveBeenCalledWith('ativos/todos');
    await waitFor(() => expect(corpo().queryByRole('dialog')).toBeNull());
  },
};

/** Pelo teclado: o foco fica preso no painel, e Esc fecha e devolve o foco a quem abriu. */
export const FocoPresoEEsc: Historia = {
  play: async ({ canvasElement }) => {
    const gatilho = within(canvasElement).getByRole('button', { name: 'Abrir o menu de Ativos' });
    await userEvent.tab();
    await waitFor(() => expect(gatilho).toHaveFocus());
    await userEvent.keyboard('{Enter}');
    const painel = await corpo().findByRole('dialog', { name: 'Ativos' });
    for (let i = 0; i < 8; i++) {
      await userEvent.tab();
      await expect(painel.contains(document.activeElement)).toBe(true);
    }
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpo().queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(gatilho).toHaveFocus());
  },
};
