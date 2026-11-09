import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { expect, waitFor } from 'storybook/test';
import { MiniaturaDeAtivo } from './MiniaturaDeAtivo.tsx';

// Imagens de exemplo no papel de fotos de produto; a larga cobre o cenário da imagem retangular.
const impressora = new URL('./exemplos/impressora.svg', import.meta.url).href;
const switchLargo = new URL('./exemplos/switch.svg', import.meta.url).href;

const meta: Meta<typeof MiniaturaDeAtivo> = {
  title: 'Componentes/Miniatura de ativo',
  component: MiniaturaDeAtivo,
};
export default meta;

type Historia = StoryObj<typeof MiniaturaDeAtivo>;

const linha = { display: 'flex', alignItems: 'center', gap: 'var(--esp-4)' } as const;

function Figura({ legenda, children }: { legenda: string; children: ReactNode }) {
  return (
    <figure
      style={{ display: 'grid', justifyItems: 'center', gap: 'var(--esp-2)', margin: 0 }}
      data-legenda={legenda}
    >
      {children}
      <figcaption style={{ fontSize: 'var(--texto-dado)', color: 'var(--cor-texto-2)' }}>
        {legenda}
      </figcaption>
    </figure>
  );
}

/** Prioridade: imagem do ativo, depois a do modelo, depois a genérica do tipo. */
export const Prioridade: Historia = {
  render: () => (
    <div style={linha}>
      <Figura legenda="Imagem do ativo">
        <MiniaturaDeAtivo
          tipo="impressora"
          imagemDoAtivo={impressora}
          imagemDoModelo={switchLargo}
        />
      </Figura>
      <Figura legenda="Imagem do modelo">
        <MiniaturaDeAtivo tipo="switch" imagemDoModelo={switchLargo} />
      </Figura>
      <Figura legenda="Genérica do tipo">
        <MiniaturaDeAtivo tipo="nobreak" />
      </Figura>
      <Figura legenda="Imagem que não carrega">
        <MiniaturaDeAtivo tipo="camera" imagemDoAtivo="/imagem-que-nao-existe.png" />
      </Figura>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const origem = (legenda: string) =>
      canvasElement
        .querySelector(`[data-legenda="${legenda}"] [data-origem]`)
        ?.getAttribute('data-origem');
    await expect(origem('Imagem do ativo')).toBe('ativo');
    await expect(origem('Imagem do modelo')).toBe('modelo');
    await expect(origem('Genérica do tipo')).toBe('generica');
    await waitFor(() => expect(origem('Imagem que não carrega')).toBe('generica'));
  },
};

const LADO_POR_DENSIDADE = { compacta: 24, normal: 30, confortavel: 36 } as const;
const NOME_DA_DENSIDADE = {
  compacta: 'Compacta',
  normal: 'Normal',
  confortavel: 'Confortável',
} as const;

/**
 * Tarefa 7.3: a genérica e a imagem real encaixam no quadrado da miniatura nas três densidades,
 * sem distorção e com a mesma margem interna.
 */
export const NasTresDensidades: Historia = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--esp-3)' }}>
      {Object.keys(LADO_POR_DENSIDADE).map((densidade) => (
        <div key={densidade} data-density={densidade} data-faixa={densidade} style={linha}>
          <MiniaturaDeAtivo tipo="nobreak" />
          <MiniaturaDeAtivo tipo="switch" imagemDoModelo={switchLargo} />
          <span style={{ color: 'var(--cor-texto-2)' }}>
            {NOME_DA_DENSIDADE[densidade as keyof typeof NOME_DA_DENSIDADE]}
          </span>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const [densidade, lado] of Object.entries(LADO_POR_DENSIDADE)) {
      const faixa = canvasElement.querySelector(`[data-faixa="${densidade}"]`) as HTMLElement;
      const [generica, comImagem] = [...faixa.querySelectorAll<HTMLElement>('[data-origem]')];
      if (!generica || !comImagem) throw new Error(`miniaturas ausentes em ${densidade}`);
      for (const miniatura of [generica, comImagem]) {
        const caixa = miniatura.getBoundingClientRect();
        await expect(caixa.width).toBe(lado);
        await expect(caixa.height).toBe(lado);
      }

      // A genérica fica quadrada e centralizada.
      const caixa = generica.getBoundingClientRect();
      const desenho = (generica.querySelector('svg') as SVGElement).getBoundingClientRect();
      await expect(desenho.width).toBeCloseTo(desenho.height, 1);
      await expect(desenho.left - caixa.left).toBeCloseTo(caixa.right - desenho.right, 1);
      await expect(desenho.top - caixa.top).toBeCloseTo(caixa.bottom - desenho.bottom, 1);

      // A imagem real (larga) ocupa a mesma caixa, contida: aparece inteira, sem distorção.
      const imagem = comImagem.querySelector('img') as HTMLImageElement;
      await waitFor(() => expect(imagem.complete && imagem.naturalWidth > 0).toBe(true));
      await expect(getComputedStyle(imagem).objectFit).toBe('contain');
      const quadro = imagem.getBoundingClientRect();
      await expect(quadro.width).toBeCloseTo(desenho.width, 1);
      await expect(quadro.height).toBeCloseTo(desenho.height, 1);
    }
  },
};
