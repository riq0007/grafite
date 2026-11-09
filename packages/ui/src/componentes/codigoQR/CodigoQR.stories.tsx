import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { CodigoQR } from './CodigoQR.tsx';

/** Exemplo: a chave das RFCs 4226 e 6238, que nenhuma conta de verdade usa. */
const URI_DE_EXEMPLO =
  'otpauth://totp/Grafite%3Aana.souza%20(Empresa%20de%20exemplo)?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Grafite&algorithm=SHA1&digits=6&period=30';

const meta: Meta<typeof CodigoQR> = {
  title: 'Componentes/Código QR',
  component: CodigoQR,
  args: { valor: URI_DE_EXEMPLO, rotulo: 'QR code para o app autenticador' },
};
export default meta;

type Historia = StoryObj<typeof CodigoQR>;

const quadrado = (canvas: HTMLElement) =>
  within(canvas).getByRole('img', { name: 'QR code para o app autenticador' });

/** Os módulos escuros, como pares [x, y] lidos do caminho único do desenho. */
function modulos(svg: Element): Array<[number, number]> {
  const d = svg.querySelector('path')?.getAttribute('d') ?? '';
  return [...d.matchAll(/M(\d+) (\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

export const Padrao: Historia = {
  tags: ['captura'],
  play: async ({ canvasElement }) => {
    const svg = quadrado(canvasElement);
    const lado = Number(svg.getAttribute('viewBox')?.split(' ')[2]);
    const pontos = modulos(svg);
    await expect(pontos.length).toBeGreaterThan(100);
    // A margem branca de 4 módulos em volta: nenhum módulo escuro nela.
    for (const [x, y] of pontos) {
      await expect(x >= 4 && y >= 4 && x < lado - 4 && y < lado - 4).toBe(true);
    }
    // O desenho é vetor: um caminho só, sem imagem.
    await expect(svg.querySelectorAll('path')).toHaveLength(1);
    await expect(svg.querySelector('image')).toBeNull();
  },
};

/** A cor de um token como o navegador a resolve, para comparar com a cor calculada do desenho. */
function corDoToken(token: string): string {
  const sonda = document.createElement('span');
  sonda.style.color = `var(${token})`;
  document.body.append(sonda);
  const cor = getComputedStyle(sonda).color;
  sonda.remove();
  return cor;
}

/**
 * No tema OLED, como em todos, o desenho usa as cores fixas do código QR (preto sobre branco, como
 * o gerador dos tokens confere), e não as do tema.
 */
export const NoTemaOled: Historia = {
  globals: { tema: 'oled' },
  play: async ({ canvasElement }) => {
    const svg = quadrado(canvasElement);
    const fundo = getComputedStyle(svg.querySelector('rect') as Element).fill;
    const tinta = getComputedStyle(svg.querySelector('path') as Element).fill;
    await expect(fundo).toBe(corDoToken('--cor-qr-fundo'));
    await expect(tinta).toBe(corDoToken('--cor-qr-modulo'));
    await expect(fundo).not.toBe(corDoToken('--cor-superficie'));
  },
};

export const Pequeno: Historia = {
  args: { tamanho: 128 },
  play: async ({ canvasElement }) => {
    const caixa = quadrado(canvasElement).getBoundingClientRect();
    await expect(caixa.width).toBe(128);
    await expect(caixa.height).toBe(128);
  },
};
