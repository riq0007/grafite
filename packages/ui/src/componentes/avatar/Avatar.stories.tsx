import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { Avatar, type ImagensDoAvatar, type TamanhoDoAvatar } from './Avatar.tsx';

// Um retrato mais largo que alto, nas quatro miniaturas que a API gera: cobre o recorte no círculo.
// Por endereço, e não embutidas: o Chromium escolhe sempre a maior de um `srcset` com endereços
// `data:`, como se já estivessem no cache, e a escolha pela densidade não seria testada.
const IMAGENS: ImagensDoAvatar = {
  64: new URL('./exemplos/retrato-64.svg?no-inline', import.meta.url).href,
  128: new URL('./exemplos/retrato-128.svg?no-inline', import.meta.url).href,
  256: new URL('./exemplos/retrato-256.svg?no-inline', import.meta.url).href,
  512: new URL('./exemplos/retrato-512.svg?no-inline', import.meta.url).href,
};

const meta: Meta<typeof Avatar> = { title: 'Componentes/Avatar', component: Avatar };
export default meta;

type Historia = StoryObj<typeof Avatar>;

const coluna = { display: 'grid', gap: 'var(--esp-4)' } as const;
const linha = { display: 'flex', alignItems: 'center', gap: 'var(--esp-3)' } as const;
const legenda = { color: 'var(--cor-texto-2)' } as const;

const NOME_DO_TAMANHO: Record<TamanhoDoAvatar, string> = {
  barra: 'Barra e menus',
  linha: 'Linha da tabela',
  ficha: 'Título da ficha',
};

/** Lado de cada tamanho na densidade compacta, a do catálogo, em px. */
const LADO: Record<TamanhoDoAvatar, number> = { barra: 20, linha: 24, ficha: 48 };

/** O `sizes` de cada tamanho: a linha segue a densidade, pela largura que o avatar ocupa. */
const SIZES: Record<TamanhoDoAvatar, string> = {
  barra: '20px',
  linha: 'auto, 36px',
  ficha: '48px',
};

/** A largura e a altura da foto na tela, em px. */
const ladosDaFoto = (foto: HTMLImageElement) => {
  const caixa = foto.getBoundingClientRect();
  return [caixa.width, caixa.height];
};

const SRCSET = Object.entries(IMAGENS)
  .map(([largura, endereco]) => `${endereco} ${largura}w`)
  .join(', ');

/**
 * Os três tamanhos, com a foto e com as iniciais. A foto vem das miniaturas por largura, e o
 * navegador escolhe a menor que basta para o tamanho e a densidade de pixels da tela.
 */
export const Tamanhos: Historia = {
  tags: ['captura'],
  render: () => (
    <div style={coluna}>
      {(Object.keys(NOME_DO_TAMANHO) as TamanhoDoAvatar[]).map((tamanho) => (
        <div key={tamanho} data-faixa={tamanho} style={linha}>
          <Avatar nome="Ana Souza" imagens={IMAGENS} tamanho={tamanho} />
          <Avatar nome="Bruno Lima" tamanho={tamanho} />
          <span style={legenda}>{NOME_DO_TAMANHO[tamanho]}</span>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const tamanho of Object.keys(NOME_DO_TAMANHO) as TamanhoDoAvatar[]) {
      const faixa = within(canvasElement.querySelector(`[data-faixa="${tamanho}"]`) as HTMLElement);
      const comFoto = faixa.getByRole('img', { name: 'Ana Souza' });
      const semFoto = faixa.getByRole('img', { name: 'Bruno Lima' });
      await expect(semFoto).toHaveTextContent('BL');

      for (const avatar of [comFoto, semFoto]) {
        const caixa = avatar.getBoundingClientRect();
        await expect(caixa.width).toBe(LADO[tamanho]);
        await expect(caixa.height).toBe(LADO[tamanho]);
        await expect(getComputedStyle(avatar).borderRadius).toBe('50%');
        await expect(getComputedStyle(avatar).overflow).toBe('hidden');
      }

      const foto = comFoto.querySelector('img') as HTMLImageElement;
      await expect(foto.getAttribute('srcset')).toBe(SRCSET);
      await expect(foto.getAttribute('sizes')).toBe(SIZES[tamanho]);
      // Recortada no círculo, sem distorcer: cobre o avatar por dentro da borda e corta o que sobra.
      await expect(getComputedStyle(foto).objectFit).toBe('cover');
      await expect(ladosDaFoto(foto)).toEqual([LADO[tamanho] - 2, LADO[tamanho] - 2]);
      await waitFor(() => expect(foto.complete && foto.naturalWidth > 0).toBe(true));
      // Numa tela de densidade 1, nenhum tamanho passa de 64 px: a menor miniatura basta.
      await expect(foto.currentSrc).toBe(IMAGENS[64]);
    }
  },
};

/** Sem carregar a foto, o avatar cai nas iniciais, e o nome acessível continua o mesmo. */
export const FotoQueNaoCarrega: Historia = {
  tags: ['captura'],
  render: () => (
    <Avatar
      nome="Ana Souza"
      tamanho="ficha"
      imagens={{ 64: '/foto-que-nao-existe-64.webp', 128: '/foto-que-nao-existe-128.webp' }}
    />
  ),
  play: async ({ canvasElement }) => {
    const avatar = within(canvasElement).getByRole('img', { name: 'Ana Souza' });
    await waitFor(() => expect(avatar).toHaveTextContent('AS'));
    await expect(avatar.querySelector('img')).toBeNull();
  },
};

const LADO_POR_DENSIDADE = { compacta: 24, normal: 30, confortavel: 36 } as const;
const NOME_DA_DENSIDADE = {
  compacta: 'Compacta',
  normal: 'Normal',
  confortavel: 'Confortável',
} as const;

/** O avatar da linha segue a densidade, como a miniatura das tabelas. */
export const LinhaNasTresDensidades: Historia = {
  tags: ['captura'],
  render: () => (
    <div style={coluna}>
      {(Object.keys(LADO_POR_DENSIDADE) as Array<keyof typeof LADO_POR_DENSIDADE>).map(
        (densidade) => (
          <div key={densidade} data-density={densidade} data-faixa={densidade} style={linha}>
            <Avatar nome="Ana Souza" imagens={IMAGENS} tamanho="linha" />
            <Avatar nome="Bruno Lima" tamanho="linha" />
            <span style={legenda}>{NOME_DA_DENSIDADE[densidade]}</span>
          </div>
        ),
      )}
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const [densidade, lado] of Object.entries(LADO_POR_DENSIDADE)) {
      const faixa = canvasElement.querySelector(`[data-faixa="${densidade}"]`) as HTMLElement;
      for (const avatar of within(faixa).getAllByRole('img')) {
        const caixa = avatar.getBoundingClientRect();
        await expect(caixa.width).toBe(lado);
        await expect(caixa.height).toBe(lado);
      }
      const foto = faixa.querySelector('img') as HTMLImageElement;
      await expect(ladosDaFoto(foto)).toEqual([lado - 2, lado - 2]);
    }
  },
};
