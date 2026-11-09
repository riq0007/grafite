import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { comTelaPorTras } from '../../teste/tela.tsx';
import { Botao } from '../botao/Botao.tsx';
import { type PropsDoQuickLook, QuickLook } from './QuickLook.tsx';

/** Imagem de exemplo, a mesma das histórias da miniatura. */
const switchDeExemplo = new URL('../miniatura/exemplos/switch.svg', import.meta.url).href;

const meta: Meta<typeof QuickLook> = {
  title: 'Componentes/Prévia (Quick Look)',
  component: QuickLook,
  args: {
    aberta: true,
    aoFechar: fn(),
    titulo: 'HP LaserJet M404dn (exemplo)',
    subtitulo: 'Impressora · HP M404dn',
    posicao: 3,
    total: 120,
    visual: { tipo: 'impressora' },
    campos: [
      { rotulo: 'Patrimônio', valor: 'PAT-00412', mono: true },
      { rotulo: 'IP', valor: '10.20.4.37', mono: true },
      { rotulo: 'Local', valor: 'Almoxarifado · Jundiaí' },
      { rotulo: 'Responsável', valor: 'Equipe de TI' },
    ],
    acoes: [{ id: 'abrir', rotulo: 'Abrir', principal: true, aoEscolher: fn() }],
    aoAnterior: fn(),
    aoSeguinte: fn(),
  },
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Historia = StoryObj<typeof QuickLook>;

const corpo = () => within(document.body);
const previa = () => corpo().findByRole('dialog', { name: 'Prévia: HP LaserJet M404dn (exemplo)' });

/** A prévia aberta sobre a tela, para a captura de referência. */
export const Aberta: Historia = { decorators: [comTelaPorTras] };

/** A prévia de um registro: título, tipo, imagem, campos principais, ações e a posição na lista. */
export const Pronta: Historia = {
  play: async () => {
    const dialogo = await previa();
    const tela = within(dialogo);
    // Espera o fim da animação de abrir, que começa na opacidade zero.
    await waitFor(() =>
      expect(tela.getByRole('heading', { name: 'HP LaserJet M404dn (exemplo)' })).toBeVisible(),
    );
    await expect(tela.getByText('Impressora · HP M404dn')).toBeInTheDocument();
    await expect(tela.getByText('3 de 120')).toBeInTheDocument();
    await expect(getComputedStyle(tela.getByText('PAT-00412')).fontFamily).toMatch(
      /JetBrains Mono/,
    );
    await expect(getComputedStyle(tela.getByText('Almoxarifado · Jundiaí')).fontFamily).not.toMatch(
      /JetBrains Mono/,
    );
    await expect(tela.getByRole('button', { name: 'Abrir' })).toBeInTheDocument();
    await expect(dialogo.querySelector('[data-origem="generica"]')).not.toBeNull();
  },
};

/** Com a imagem do modelo, a prévia a mostra inteira, sem distorção. */
export const ComImagem: Historia = {
  args: { visual: { tipo: 'switch', imagemDoModelo: switchDeExemplo } },
  play: async () => {
    const dialogo = await previa();
    const imagem = dialogo.querySelector('img') as HTMLImageElement;
    await expect(imagem).not.toBeNull();
    await expect(getComputedStyle(imagem).objectFit).toBe('contain');
  },
};

/** O lugar da imagem aceita outro visual, como o 3D que chega no T1. */
export const OutroVisual: Historia = {
  args: { visual: <div data-testid="visual-3d">Visualizador 3D (exemplo)</div> },
  play: async () => {
    const dialogo = await previa();
    await expect(within(dialogo).getByTestId('visual-3d')).toBeInTheDocument();
    await expect(dialogo.querySelector('[data-origem]')).toBeNull();
  },
};

/** Como o navegador escreve o fundo transparente, para comparar com o estilo aplicado. */
function fundoTransparente(): string {
  const amostra = document.createElement('span');
  amostra.style.backgroundColor = 'transparent';
  document.body.append(amostra);
  const cor = getComputedStyle(amostra).backgroundColor;
  amostra.remove();
  return cor;
}

/** Superfície sólida e sem véu: a lista continua à vista atrás da prévia. */
export const SemVeu: Historia = {
  play: async () => {
    const dialogo = await previa();
    const painel = dialogo.parentElement as HTMLElement;
    const fundo = painel.parentElement as HTMLElement;
    await expect(getComputedStyle(fundo).backgroundColor).toBe(fundoTransparente());
    await expect(getComputedStyle(painel).backdropFilter).toBe('none');
  },
};

const comAtributo =
  (nome: string, valor: string): Decorator =>
  (Historia) => {
    document.documentElement.setAttribute(nome, valor);
    return <Historia />;
  };

function PreviaComGatilho(props: PropsDoQuickLook) {
  const [aberta, definirAberta] = useState(false);
  return (
    <>
      <Botao onPress={() => definirAberta(true)}>Abrir a prévia</Botao>
      <QuickLook {...props} aberta={aberta} aoFechar={() => definirAberta(false)} />
    </>
  );
}

/** Abre com opacidade e escala leve em 200 ms; com movimento reduzido, só a opacidade. */
export const AbrirComMovimentoReduzido: Historia = {
  decorators: [comAtributo('data-motion', 'reduzido')],
  render: (args) => <PreviaComGatilho {...args} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Abrir a prévia' }));
    const painel = (await previa()).parentElement as HTMLElement;
    await expect(getComputedStyle(painel).animationDuration).toBe('0.2s, 0s');
    document.documentElement.removeAttribute('data-motion');
    await waitFor(() => expect(painel).not.toHaveAttribute('data-entering'));
  },
};

/** No celular, a prévia ocupa a largura da tela. */
export const NoCelular: Historia = {
  decorators: [comAtributo('data-postura', 'celular')],
  globals: { viewport: { value: 'celular390' } },
  play: async () => {
    const painel = (await previa()).parentElement as HTMLElement;
    await waitFor(() =>
      expect(Math.round(painel.getBoundingClientRect().width)).toBe(window.innerWidth),
    );
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    document.documentElement.removeAttribute('data-postura');
  },
};

/** Espera a prévia receber o foco, como acontece ao abrir. */
async function previaEmFoco() {
  const dialogo = await previa();
  await waitFor(() => expect(dialogo.contains(document.activeElement)).toBe(true));
  return dialogo;
}

/** As setas para baixo e para a direita avançam; para cima e para a esquerda, voltam. */
export const SetasTrocamDeRegistro: Historia = {
  play: async ({ args }) => {
    await previaEmFoco();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowRight}');
    await expect(args.aoSeguinte).toHaveBeenCalledTimes(2);
    await userEvent.keyboard('{ArrowUp}');
    await userEvent.keyboard('{ArrowLeft}');
    await expect(args.aoAnterior).toHaveBeenCalledTimes(2);
  },
};

/** No último registro, a seta que sairia da lista não faz nada, e a prévia continua aberta. */
export const NoFimDaLista: Historia = {
  args: { posicao: 120, aoSeguinte: undefined },
  play: async ({ args }) => {
    const dialogo = await previaEmFoco();
    await userEvent.keyboard('{ArrowDown}');
    await expect(dialogo).toBeInTheDocument();
    await expect(args.aoFechar).not.toHaveBeenCalled();
    await expect(within(dialogo).getByText('120 de 120')).toBeInTheDocument();
  },
};

/** Enter aciona a ação principal, "Abrir". */
export const EnterAbre: Historia = {
  play: async ({ args }) => {
    await previaEmFoco();
    await userEvent.keyboard('{Enter}');
    await expect(args.acoes?.[0]?.aoEscolher).toHaveBeenCalledOnce();
  },
};

/** Esc e a barra de espaço fecham a prévia. */
export const EscEEspacoFecham: Historia = {
  play: async ({ args }) => {
    await previaEmFoco();
    await userEvent.keyboard(' ');
    await expect(args.aoFechar).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    await expect(args.aoFechar).toHaveBeenCalledTimes(2);
  },
};

/** Num botão, a barra de espaço aciona o botão, como manda o teclado, e não fecha a prévia. */
export const EspacoNumBotao: Historia = {
  play: async ({ args }) => {
    const dialogo = await previaEmFoco();
    within(dialogo).getByRole('button', { name: 'Abrir' }).focus();
    await userEvent.keyboard(' ');
    await expect(args.acoes?.[0]?.aoEscolher).toHaveBeenCalledOnce();
    await expect(args.aoFechar).not.toHaveBeenCalled();
  },
};

/** Enquanto os dados carregam, o esqueleto fica no lugar dos campos. */
export const Carregando: Historia = {
  args: { estado: 'carregando', campos: [] },
  play: async () => {
    const dialogo = await previa();
    // A área que carrega tem aria-busy e um texto de estado para o leitor de tela (Esqueleto).
    const estado = within(dialogo).getByText('Carregando os dados do registro…');
    const campos = estado.closest('[aria-busy]');
    await expect(campos).toHaveAttribute('aria-busy', 'true');
    await expect(campos?.querySelector('[data-forma]')).not.toBeNull();
  },
};

/** Se a carga falha, a prévia diz isso e oferece tentar de novo. */
export const ComErro: Historia = {
  args: { estado: 'erro', campos: [], aoTentarDeNovo: fn() },
  play: async ({ args }) => {
    const dialogo = await previa();
    await expect(
      within(dialogo).getByText('Não foi possível carregar a prévia.'),
    ).toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Tentar de novo' }));
    await expect(args.aoTentarDeNovo).toHaveBeenCalledOnce();
  },
};
