import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { EtiquetaDoAtivo, FORMATOS_DE_ETIQUETA } from './EtiquetaDoAtivo.tsx';

const meta: Meta<typeof EtiquetaDoAtivo> = {
  title: 'Componentes/Etiqueta do ativo',
  component: EtiquetaDoAtivo,
  args: {
    endereco: 'https://empresa.exemplo/ativos/0199a3f0-0000-7000-8000-000000000412',
    patrimonio: 'PAT-00412',
    nome: 'HP LaserJet M404',
    organizacao: 'Empresa de exemplo',
    formato: 'folha-a4',
  },
};
export default meta;

type Historia = StoryObj<typeof EtiquetaDoAtivo>;

const etiqueta = (canvas: HTMLElement) => canvas.querySelector('[data-etiqueta]') as HTMLElement;

/** A medida de um lado, em milímetros, pelo tamanho em pixels (96 px por polegada). */
const emMilimetros = (pixels: number) => Math.round(((pixels * 25.4) / 96) * 10) / 10;

/** A etiqueta da folha A4: 63,5 × 38,1 mm, com o QR à esquerda e o texto à direita. */
export const FolhaA4: Historia = {
  tags: ['captura'],
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const caixa = etiqueta(canvasElement).getBoundingClientRect();
    await expect(emMilimetros(caixa.width)).toBe(63.5);
    await expect(emMilimetros(caixa.height)).toBe(38.1);
    const qr = tela.getByRole('img', { name: 'QR code da ficha de PAT-00412' });
    await expect(qr.getBoundingClientRect().left).toBeLessThan(
      tela.getByText('PAT-00412').getBoundingClientRect().left,
    );
    await expect(tela.getByText('HP LaserJet M404')).toBeInTheDocument();
    await expect(tela.getByText('Empresa de exemplo')).toBeInTheDocument();
    // O endereço que o QR code leva também fica no elemento, para quem confere a etiqueta.
    await expect(etiqueta(canvasElement).dataset.endereco).toBe(
      'https://empresa.exemplo/ativos/0199a3f0-0000-7000-8000-000000000412',
    );
  },
};

/** A etiqueta da impressora de etiquetas: 50 × 30 mm. */
export const ImpressoraDeEtiquetas: Historia = {
  tags: ['captura'],
  args: { formato: 'impressora' },
  play: async ({ canvasElement }) => {
    const caixa = etiqueta(canvasElement).getBoundingClientRect();
    await expect(emMilimetros(caixa.width)).toBe(50);
    await expect(emMilimetros(caixa.height)).toBe(30);
  },
};

/** O ativo sem patrimônio diz isso no lugar dele. */
export const SemPatrimonio: Historia = {
  tags: ['captura'],
  args: { patrimonio: null, nome: 'Switch do rack 2' },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.getByText('Sem patrimônio')).toBeInTheDocument();
    await expect(
      tela.getByRole('img', { name: 'QR code da ficha de Switch do rack 2' }),
    ).toBeInTheDocument();
  },
};

/** O nome longo fica em duas linhas, cortado com reticências, sem passar da borda. */
export const NomeLongo: Historia = {
  tags: ['captura'],
  args: {
    formato: 'impressora',
    nome: 'Impressora multifuncional colorida do segundo andar, ao lado da sala de reuniões',
  },
  play: async ({ canvasElement }) => {
    const borda = etiqueta(canvasElement).getBoundingClientRect();
    for (const filho of etiqueta(canvasElement).querySelectorAll('*')) {
      const caixa = filho.getBoundingClientRect();
      await expect(caixa.right).toBeLessThanOrEqual(borda.right + 0.5);
      await expect(caixa.bottom).toBeLessThanOrEqual(borda.bottom + 0.5);
    }
  },
};

/** As medidas das folhas que se compram: a A4 de 21 etiquetas e a impressora de etiquetas. */
export const Formatos: Historia = {
  play: async () => {
    const { 'folha-a4': folha, impressora } = FORMATOS_DE_ETIQUETA;
    await expect(folha.colunas * folha.linhas).toBe(21);
    await expect(
      folha.margem.esquerda * 2 +
        folha.colunas * folha.etiqueta.largura +
        (folha.colunas - 1) * folha.espaco.colunas,
    ).toBeCloseTo(folha.pagina.largura, 1);
    await expect(
      folha.margem.topo * 2 +
        folha.linhas * folha.etiqueta.altura +
        (folha.linhas - 1) * folha.espaco.linhas,
    ).toBeCloseTo(folha.pagina.altura, 1);
    await expect(impressora.pagina).toEqual(impressora.etiqueta);
  },
};
