import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { comTelaPorTras } from '../teste/tela.tsx';
import './carregamento.css';
import { marcacaoDoCarregamento, type SituacaoDoCarregamento } from './carregamento.ts';

/** A mesma marcação que o plugin do apps/web injeta no index.html, antes do JavaScript. */
function Carregamento(situacao: SituacaoDoCarregamento) {
  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: é a marcação do index.html, gerada por marcacaoDoCarregamento, que escapa a etapa
    <div dangerouslySetInnerHTML={{ __html: marcacaoDoCarregamento(situacao) }} />
  );
}

const meta: Meta<typeof Carregamento> = {
  title: 'Chegada/Carregamento',
  component: Carregamento,
  args: { etapa: 'Carregando suas preferências', progresso: 1 / 3, visivel: true },
  argTypes: { progresso: { control: { type: 'range', min: 0, max: 1, step: 0.05 } } },
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Historia = StoryObj<typeof Carregamento>;

/**
 * Uma chegada que passou de 500 ms, na segunda das três etapas do F1c: a marca, a barra com a
 * etapa concluída e a etapa em andamento, anunciada ao leitor de tela. A referência da regressão
 * visual.
 */
export const EtapaEmAndamento: Historia = {
  tags: ['captura'],
  decorators: [comTelaPorTras],
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const barra = tela.getByRole('progressbar', { name: 'Carregamento do Grafite' });
    await expect(barra).toHaveAttribute('aria-valuenow', '33');
    await expect(tela.getByRole('status')).toHaveTextContent('Carregando suas preferências');
    await expect(tela.getByRole('img', { name: 'Grafite' })).toBeVisible();
  },
};
