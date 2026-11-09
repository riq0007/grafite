import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { lapisDoContraste, trilhaDasMatizes } from '../../tokens/personalizado.ts';
import { ControleDeslizante } from './ControleDeslizante.tsx';

const meta: Meta<typeof ControleDeslizante> = {
  title: 'Componentes/Controle deslizante',
  component: ControleDeslizante,
};
export default meta;

type Historia = StoryObj<typeof ControleDeslizante>;

const coluna = { display: 'grid', gap: 'var(--esp-5)', maxWidth: 320 } as const;

/** Estados estáticos: valor com a unidade à vista; foco e arraste aparecem na interação. */
export const Estados: Historia = {
  render: () => (
    <div style={coluna}>
      <ControleDeslizante
        rotulo="Tamanho dos itens"
        unidade="px"
        minValue={28}
        maxValue={64}
        defaultValue={48}
      />
      <ControleDeslizante
        rotulo="Cantos"
        unidade="px"
        minValue={0}
        maxValue={24}
        defaultValue={12}
      />
      <ControleDeslizante
        rotulo="Suavização"
        unidade="%"
        minValue={0}
        maxValue={100}
        defaultValue={95}
      />
      <ControleDeslizante
        rotulo="Desabilitado"
        unidade="px"
        minValue={28}
        maxValue={64}
        defaultValue={40}
        isDisabled
      />
    </div>
  ),
};

/** Setas mudam um passo; Home e End vão ao mínimo e ao máximo; o valor não sai do intervalo. */
export const PeloTeclado: Historia = {
  render: () => (
    <div style={coluna}>
      <ControleDeslizante
        rotulo="Tamanho dos itens"
        unidade="px"
        minValue={28}
        maxValue={64}
        defaultValue={48}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const controle = tela.getByRole('slider', { name: 'Tamanho dos itens' });
    const valor = () => tela.getByText(/\d+ px/);
    await userEvent.tab();
    await expect(controle).toHaveFocus();
    await expect(valor()).toHaveTextContent('48 px');

    await userEvent.keyboard('{ArrowRight}');
    await expect(valor()).toHaveTextContent('49 px');
    await expect(controle).toHaveAttribute('aria-valuetext', '49 px');

    await userEvent.keyboard('{End}');
    await expect(valor()).toHaveTextContent('64 px');
    await userEvent.keyboard('{ArrowRight}');
    await expect(valor()).toHaveTextContent('64 px');

    await userEvent.keyboard('{Home}');
    await expect(valor()).toHaveTextContent('28 px');
    await expect(controle).toHaveAttribute('aria-valuetext', '28 px');
  },
};

/** O porcentual segue a escrita do pt-BR: "95%", sem espaço. */
export const Porcentagem: Historia = {
  render: () => (
    <div style={coluna}>
      <ControleDeslizante
        rotulo="Suavização"
        unidade="%"
        minValue={0}
        maxValue={100}
        defaultValue={95}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const controle = within(canvasElement).getByRole('slider', { name: 'Suavização' });
    await expect(controle).toHaveAttribute('aria-valuetext', '95%');
    await expect(within(canvasElement).getByText('95%')).toBeInTheDocument();
  },
};

/**
 * O texto do valor dado por quem usa, como a dureza do lápis no contraste do tema personalizado, e o
 * texto que o leitor de tela anuncia.
 */
export const TextoDoValor: Historia = {
  render: () => (
    <div style={coluna}>
      <ControleDeslizante
        rotulo="Contraste"
        unidade="%"
        minValue={0}
        maxValue={100}
        defaultValue={45}
        textoDoValor={(valor) => `${lapisDoContraste(valor)} · ${valor}`}
        textoParaLeitor={(valor) => `${lapisDoContraste(valor)}, ${valor} de 100`}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const controle = tela.getByRole('slider', { name: 'Contraste' });
    await expect(tela.getByText('HB · 45')).toBeInTheDocument();
    await expect(controle).toHaveAttribute('aria-valuetext', 'HB, 45 de 100');
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight>10/}');
    await expect(tela.getByText('B · 55')).toBeInTheDocument();
    await expect(controle).toHaveAttribute('aria-valuetext', 'B, 55 de 100');
  },
};

/** A matiz em graus, com a trilha pintada da volta das matizes no lugar do preenchimento. */
export const Matiz: Historia = {
  render: () => (
    <div style={coluna}>
      <ControleDeslizante
        rotulo="Matiz"
        unidade="°"
        minValue={0}
        maxValue={359}
        defaultValue={265}
        trilha={trilhaDasMatizes(0.7, 0.12)}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.getByRole('slider', { name: 'Matiz' })).toHaveAttribute(
      'aria-valuetext',
      '265°',
    );
    await expect(tela.getByText('265°')).toBeInTheDocument();
    const trilha = canvasElement.querySelector('[data-parte="trilha"]') as HTMLElement;
    await expect(getComputedStyle(trilha, '::before').backgroundImage).toMatch(/gradient/);
  },
};

/** Clicar na ponta da trilha leva o valor ao máximo. */
export const CliqueNaTrilha: Historia = {
  render: () => (
    <div style={coluna}>
      <ControleDeslizante
        rotulo="Cantos"
        unidade="px"
        minValue={0}
        maxValue={24}
        defaultValue={12}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const trilha = canvasElement.querySelector('[data-parte="trilha"]');
    await expect(trilha).not.toBeNull();
    const caixa = (trilha as HTMLElement).getBoundingClientRect();
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: trilha as HTMLElement,
      coords: { clientX: caixa.right - 1, clientY: caixa.top + caixa.height / 2 },
    });
    await expect(within(canvasElement).getByText('24 px')).toBeInTheDocument();
  },
};

/** Desabilitado: não recebe foco nem muda pelo teclado. */
export const Desabilitado: Historia = {
  render: () => (
    <div style={coluna}>
      <ControleDeslizante
        rotulo="Tamanho dos itens"
        unidade="px"
        minValue={28}
        maxValue={64}
        defaultValue={40}
        isDisabled
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const controle = within(canvasElement).getByRole('slider', { name: 'Tamanho dos itens' });
    await expect(controle).toBeDisabled();
    await userEvent.tab();
    await expect(controle).not.toHaveFocus();
  },
};
