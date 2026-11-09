import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { comTelaPorTras } from '../teste/tela.tsx';
import { BoasVindas } from './BoasVindas.tsx';

const meta: Meta<typeof BoasVindas> = {
  title: 'Casca/Boas-vindas',
  component: BoasVindas,
  args: { aoTerminar: fn() },
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Historia = StoryObj<typeof BoasVindas>;

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));
const camada = (elemento: HTMLElement) =>
  within(elemento).getByRole('dialog', { name: 'Bem-vindo ao Grafite' });
/** A escala horizontal da máscara que revela o "olá": 0 no começo, 1 no fim. */
const revelado = (elemento: HTMLElement) => {
  const mascara = elemento.querySelector('mask rect') as SVGElement;
  const [horizontal] = getComputedStyle(mascara).scale.split(' ');
  return Number(horizontal);
};

/**
 * O primeiro acesso: o "olá" escrito da esquerda para a direita, "Bem-vindo ao Grafite" e, depois
 * de um tempo à vista, a saída, que avisa o app uma vez só.
 */
export const PrimeiroAcesso: Historia = {
  play: async ({ args, canvasElement }) => {
    const dialogo = camada(canvasElement);
    await expect(within(dialogo).getByRole('img', { name: 'olá' })).toBeInTheDocument();
    const mascara = dialogo.querySelector('mask rect') as SVGElement;
    await expect(getComputedStyle(mascara).transformOrigin.startsWith('0px')).toBe(true);
    await esperar(500);
    const antes = revelado(dialogo);
    await esperar(500);
    const depois = revelado(dialogo);
    await expect(antes).toBeGreaterThan(0);
    await expect(depois).toBeGreaterThan(antes);
    await expect(depois).toBeLessThan(1);
    const titulo = within(dialogo).getByText('Bem-vindo ao Grafite');
    await waitFor(() => expect(Number(getComputedStyle(titulo).opacity)).toBe(1), {
      timeout: 3000,
    });
    await waitFor(() => expect(args.aoTerminar).toHaveBeenCalledOnce(), { timeout: 3000 });
    await esperar(500);
    await expect(args.aoTerminar).toHaveBeenCalledOnce();
  },
};

/** "Pular" recebe o foco quando as boas-vindas aparecem, e Enter leva à casca na hora. */
export const PularComOFoco: Historia = {
  play: async ({ args, canvasElement }) => {
    const pular = within(camada(canvasElement)).getByRole('button', { name: 'Pular' });
    await waitFor(() => expect(pular).toHaveFocus());
    await userEvent.keyboard('{Enter}');
    await expect(args.aoTerminar).toHaveBeenCalledOnce();
  },
};

/** Esc pula na hora, e pular de novo não chama o app outra vez. */
export const PularComEsc: Historia = {
  play: async ({ args, canvasElement }) => {
    camada(canvasElement);
    await userEvent.keyboard('{Escape}');
    await expect(args.aoTerminar).toHaveBeenCalledOnce();
    await userEvent.keyboard('{Escape}');
    await expect(args.aoTerminar).toHaveBeenCalledOnce();
  },
};

/** Um clique em qualquer lugar pula, e o clique no próprio "Pular" também chama uma vez só. */
export const PularComClique: Historia = {
  play: async ({ args, canvasElement }) => {
    const dialogo = camada(canvasElement);
    await userEvent.click(within(dialogo).getByText('Bem-vindo ao Grafite'));
    await expect(args.aoTerminar).toHaveBeenCalledOnce();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Pular' }));
    await expect(args.aoTerminar).toHaveBeenCalledOnce();
  },
};

const comMovimentoReduzido: Decorator = (Historia) => {
  document.documentElement.setAttribute('data-motion', 'reduzido');
  return <Historia />;
};

/** Com movimento reduzido, o "olá" já nasce escrito, e a saída é só troca de opacidade. */
export const MovimentoReduzido: Historia = {
  decorators: [comMovimentoReduzido],
  play: async ({ args, canvasElement }) => {
    const dialogo = camada(canvasElement);
    const letras = dialogo.querySelector('svg path') as SVGPathElement;
    await expect(getComputedStyle(letras).fill).toBe(getComputedStyle(dialogo).color);
    await expect(revelado(dialogo)).toBe(1);
    const conteudo = within(dialogo).getByText('Bem-vindo ao Grafite').parentElement as HTMLElement;
    await waitFor(() => expect(Number(getComputedStyle(conteudo).opacity)).toBeLessThan(1), {
      timeout: 3000,
    });
    await expect(getComputedStyle(conteudo).scale).toBe('none');
    await waitFor(() => expect(args.aoTerminar).toHaveBeenCalledOnce(), { timeout: 2000 });
    document.documentElement.removeAttribute('data-motion');
  },
};

/** Paradas no fim da escrita, sem sair: a referência da regressão visual. */
export const Paradas: Historia = {
  args: { parado: true },
  tags: ['captura'],
  decorators: [comTelaPorTras],
  play: async ({ args, canvasElement }) => {
    const dialogo = camada(canvasElement);
    await expect(revelado(dialogo)).toBe(1);
    await expect(within(dialogo).getByText('Bem-vindo ao Grafite')).toBeVisible();
    await esperar(300);
    await expect(args.aoTerminar).not.toHaveBeenCalled();
  },
};
