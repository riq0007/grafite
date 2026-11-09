import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { RotuloDeSituacao } from './RotuloDeSituacao.tsx';

const meta: Meta<typeof RotuloDeSituacao> = {
  title: 'Componentes/Rótulo de situação',
  component: RotuloDeSituacao,
};
export default meta;

type Historia = StoryObj<typeof RotuloDeSituacao>;

/** Rótulos vivem sobre superfícies (tabelas e painéis), onde o contraste é verificado. */
const superficie = {
  padding: 'var(--esp-4)',
  borderRadius: 'var(--raio-janela)',
  background: 'var(--cor-superficie)',
} as const;

export const Situacoes: Historia = {
  render: () => (
    <div style={{ ...superficie, display: 'flex', flexWrap: 'wrap', gap: 'var(--esp-2)' }}>
      <RotuloDeSituacao situacao="neutra">Em estoque</RotuloDeSituacao>
      <RotuloDeSituacao situacao="sucesso">Em uso</RotuloDeSituacao>
      <RotuloDeSituacao situacao="info">Em trânsito</RotuloDeSituacao>
      <RotuloDeSituacao situacao="atencao">Em manutenção</RotuloDeSituacao>
      <RotuloDeSituacao situacao="critico">Extraviado</RotuloDeSituacao>
    </div>
  ),
};

/** Cenário da spec: numa coluna estreita o rótulo não quebra nem é cortado; a coluna rola. */
export const ColunaEstreita: Historia = {
  render: () => (
    <div style={superficie}>
      <div style={{ width: 'fit-content' }}>
        <RotuloDeSituacao situacao="atencao">Em manutenção</RotuloDeSituacao>
      </div>
      <section
        aria-label="Coluna estreita"
        data-coluna=""
        // biome-ignore lint/a11y/noNoninteractiveTabindex: área rolável precisa ser alcançável pelo teclado
        tabIndex={0}
        style={{ width: 64, marginTop: 'var(--esp-2)', overflowX: 'auto' }}
      >
        <RotuloDeSituacao situacao="atencao">Em manutenção</RotuloDeSituacao>
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const [referencia, estreito] = within(canvasElement)
      .getAllByText('Em manutenção')
      .map((texto) => (texto.closest('[data-situacao]') as HTMLElement).getBoundingClientRect());
    const coluna = canvasElement.querySelector('[data-coluna]') as HTMLElement;
    // Uma linha só, e a largura natural: nada quebra, nada é cortado.
    await expect(estreito?.height).toBe(referencia?.height);
    await expect(estreito?.width).toBe(referencia?.width);
    // Quem cede é a coluna, que rola na horizontal.
    await expect(coluna.scrollWidth).toBeGreaterThan(coluna.clientWidth);
  },
};
