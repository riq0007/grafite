import type { Meta, StoryObj } from '@storybook/react-vite';
import { Download, SlidersHorizontal } from 'lucide-react';
import { useRef, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { BotaoDeIcone } from '../../icones/Icone.tsx';
import { Botao } from '../botao/Botao.tsx';
import { CampoDeTexto } from '../campo/CampoDeTexto.tsx';
import { Checkbox } from '../escolhas/Checkbox.tsx';
import { Dica } from './Dica.tsx';
import { Popover } from './Popover.tsx';

const meta: Meta = { title: 'Componentes/Dica e popover' };
export default meta;

type Historia = StoryObj<{ aoMudarAberto?: (aberto: boolean) => void }>;

const corpoDe = (elemento: HTMLElement) => within(elemento.ownerDocument.body);

/** Tempo em que as dicas continuam "aquecidas" depois de uma fechar (constante do React Aria). */
const RESFRIAMENTO_DAS_DICAS = 500;

/** Pelo teclado a dica aparece na hora, fica ligada ao gatilho e some com Esc. */
export const DicaPeloTeclado: Historia = {
  render: () => (
    <Dica texto="Salva as alterações e fecha a ficha">
      <Botao nivel="primario">Salvar</Botao>
    </Dica>
  ),
  play: async ({ canvasElement }) => {
    const botao = within(canvasElement).getByRole('button', { name: 'Salvar' });
    await userEvent.tab();
    await expect(botao).toHaveFocus();
    const dica = await corpoDe(canvasElement).findByRole('tooltip');
    await expect(dica).toHaveTextContent('Salva as alterações e fecha a ficha');
    await expect(botao).toHaveAccessibleDescription('Salva as alterações e fecha a ficha');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpoDe(canvasElement).queryByRole('tooltip')).toBeNull());
  },
};

/** Com o mouse, a dica espera o ponteiro parar e some ao sair. */
export const DicaPeloMouse: Historia = {
  render: () => (
    <Dica texto="Salva as alterações e fecha a ficha">
      <Botao nivel="primario">Salvar</Botao>
    </Dica>
  ),
  play: async ({ canvasElement }) => {
    const botao = within(canvasElement).getByRole('button', { name: 'Salvar' });
    // Depois que uma dica fecha, o React Aria mantém as dicas "aquecidas" por 500 ms: a próxima
    // abre na hora, como no macOS. A história anterior abre uma; esperamos esfriar para medir o
    // atraso a partir do estado normal.
    await new Promise((resolver) => setTimeout(resolver, RESFRIAMENTO_DAS_DICAS + 100));
    // O React Aria só mostra dica no hover de quem está usando o mouse (a última interação
    // foi de ponteiro); quem navega pelo teclado não vê dicas pipocando sob o cursor parado.
    await userEvent.click(canvasElement);
    await userEvent.hover(botao);
    await expect(corpoDe(canvasElement).queryByRole('tooltip')).toBeNull();
    await corpoDe(canvasElement).findByRole('tooltip', {}, { timeout: 1500 });
    await userEvent.unhover(botao);
    await waitFor(() => expect(corpoDe(canvasElement).queryByRole('tooltip')).toBeNull());
  },
};

/** O botão só de ícone mostra o próprio nome como dica. */
export const BotaoDeIconeComDica: Historia = {
  render: () => <BotaoDeIcone icone={Download} rotulo="Exportar planilha" />,
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    const dica = await corpoDe(canvasElement).findByRole('tooltip');
    await expect(dica).toHaveTextContent('Exportar planilha');
  },
};

function FiltrosDeAtivos() {
  return (
    <Popover
      titulo="Filtros"
      gatilho={
        <Botao icone={SlidersHorizontal} nivel="secundario">
          Filtros
        </Botao>
      }
    >
      <div style={{ display: 'grid', gap: 'var(--esp-3)' }}>
        <CampoDeTexto rotulo="Local" />
        <Checkbox>Só ativos em garantia</Checkbox>
      </div>
    </Popover>
  );
}

/** O popover abre com o foco dentro, fecha com Esc e devolve o foco ao gatilho. */
export const PopoverAbreEFecha: Historia = {
  render: () => <FiltrosDeAtivos />,
  play: async ({ canvasElement }) => {
    const gatilho = within(canvasElement).getByRole('button', { name: 'Filtros' });
    await userEvent.click(gatilho);
    const dialogo = await corpoDe(canvasElement).findByRole('dialog', { name: 'Filtros' });
    await waitFor(() => expect(dialogo.contains(document.activeElement)).toBe(true));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpoDe(canvasElement).queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(gatilho).toHaveFocus());
  },
};

/** Clicar fora fecha o popover. */
export const PopoverFechaAoClicarFora: Historia = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--esp-6)', justifyItems: 'start' }}>
      <FiltrosDeAtivos />
      <p data-fora="">Área fora do popover</p>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Filtros' }));
    await corpoDe(canvasElement).findByRole('dialog', { name: 'Filtros' });
    await userEvent.click(canvasElement.ownerDocument.body);
    await waitFor(() => expect(corpoDe(canvasElement).queryByRole('dialog')).toBeNull());
  },
};

/** Um filtro escolhido num menu: o popover abre por fora, preso ao botão do menu. */
function FiltroEscolhido({ aoMudarAberto }: { aoMudarAberto?: (aberto: boolean) => void }) {
  const ancora = useRef<HTMLButtonElement>(null);
  const [aberto, definirAberto] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 'var(--esp-3)' }}>
      <Botao ref={ancora}>Filtros</Botao>
      <Botao onPress={() => definirAberto(true)}>Filtrar o local</Botao>
      <Popover
        titulo="Filtro de Local"
        ancora={ancora}
        aberto={aberto}
        aoMudarAberto={(valor) => {
          definirAberto(valor);
          aoMudarAberto?.(valor);
        }}
      >
        <CampoDeTexto rotulo="Local" />
      </Popover>
    </div>
  );
}

/** Aberto por fora, o popover se prende à âncora, e Esc o fecha pelo `aoMudarAberto`. */
export const PopoverAbertoPorFora: Historia = {
  args: { aoMudarAberto: fn() },
  render: (args) => <FiltroEscolhido aoMudarAberto={args.aoMudarAberto} />,
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Filtrar o local' }));
    const dialogo = await corpoDe(canvasElement).findByRole('dialog', { name: 'Filtro de Local' });
    const filtros = within(canvasElement).getByRole('button', { name: 'Filtros' });
    await waitFor(() =>
      expect(dialogo.getBoundingClientRect().top).toBeGreaterThan(
        filtros.getBoundingClientRect().bottom,
      ),
    );
    await waitFor(() => expect(dialogo.contains(document.activeElement)).toBe(true));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpoDe(canvasElement).queryByRole('dialog')).toBeNull());
    await expect(args.aoMudarAberto).toHaveBeenCalledWith(false);
  },
};
