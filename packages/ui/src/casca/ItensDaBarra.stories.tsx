import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { BuscaGlobal } from './BuscaGlobal.tsx';
import { AvisoDoAmbienteDeTeste, BotaoDeBusca, SinoDeNotificacoes } from './ItensDaBarra.tsx';

const meta: Meta<typeof BotaoDeBusca> = {
  title: 'Casca/Itens da barra',
  component: BotaoDeBusca,
  args: { aoAbrir: fn() },
};
export default meta;

type Historia = StoryObj<typeof BotaoDeBusca>;

/** Marca a postura no <html>, como a casca faz para as camadas em portal. */
const naPostura =
  (postura: 'tablet' | 'celular'): Decorator =>
  (Historia) => {
    document.documentElement.setAttribute('data-postura', postura);
    return <Historia />;
  };

/** A busca e o sino sem, com poucas e com muitas não lidas, para a captura de referência. */
export const Estados: Historia = {
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--esp-2)', alignItems: 'center' }}>
      <BotaoDeBusca aoAbrir={fn()} plataforma="outra" />
      <SinoDeNotificacoes naoLidas={0} aoAbrir={fn()} />
      <SinoDeNotificacoes naoLidas={3} aoAbrir={fn()} />
      <SinoDeNotificacoes naoLidas={120} aoAbrir={fn()} />
    </div>
  ),
};

/** O botão de busca da barra, com a lupa e o atalho; o leitor de tela ouve "Buscar" e o atalho. */
export const BotaoDaBusca: Historia = {
  play: async ({ args, canvasElement }) => {
    const botao = within(canvasElement).getByRole('button', { name: 'Buscar' });
    await expect(botao).toHaveAttribute('aria-keyshortcuts', 'Control+K');
    await expect(botao).toHaveTextContent('CtrlK');
    await userEvent.click(botao);
    await expect(args.aoAbrir).toHaveBeenCalledOnce();
  },
};

/** No tablet, o botão é um alvo de toque de 44 × 44 px, sem o atalho de teclado à vista. */
export const BotaoNoTablet: Historia = {
  decorators: [naPostura('tablet')],
  play: async ({ canvasElement }) => {
    const botao = within(canvasElement).getByRole('button', { name: 'Buscar' });
    const caixa = botao.getBoundingClientRect();
    await expect(caixa.width).toBeGreaterThanOrEqual(44);
    await expect(caixa.height).toBeGreaterThanOrEqual(44);
    await expect(within(botao).getByText('K')).not.toBeVisible();
    document.documentElement.removeAttribute('data-postura');
  },
};

/** No celular, o botão fica entre os itens essenciais da barra. */
export const BotaoNoCelular: Historia = {
  play: async ({ canvasElement }) => {
    const botao = within(canvasElement).getByRole('button', { name: 'Buscar' });
    await expect(botao.closest('[data-essencial]')).not.toBeNull();
  },
};

/** No celular, a busca ocupa a largura da tela, no topo, sem rolagem horizontal. */
export const BuscaNoCelular: StoryObj<typeof BuscaGlobal> = {
  decorators: [naPostura('celular')],
  globals: { viewport: { value: 'celular390' } },
  render: () => (
    <BuscaGlobal
      aberta
      aoMudarAberta={fn()}
      termo="tamanho do dock"
      aoMudarTermo={fn()}
      grupos={[
        {
          id: 'ajustes',
          nome: 'Ajustes',
          resultados: [{ id: 'tamanho', rotulo: 'Tamanho do dock', caminho: 'Ajustes › Dock' }],
        },
      ]}
      aoEscolher={fn()}
    />
  ),
  play: async () => {
    const dialogo = await within(document.body).findByRole('dialog', { name: 'Busca' });
    const painel = dialogo.parentElement as HTMLElement;
    await waitFor(() => expect(painel.getBoundingClientRect().width).toBe(window.innerWidth));
    await expect(painel.getBoundingClientRect().top).toBe(0);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    document.documentElement.removeAttribute('data-postura');
  },
};

/** O sino sem não lidas: sem número, e o nome acessível diz que não há nenhuma. */
export const SinoSemNaoLidas: StoryObj<typeof SinoDeNotificacoes> = {
  render: () => <SinoDeNotificacoes naoLidas={0} aoAbrir={fn()} />,
  play: async ({ canvasElement }) => {
    const sino = within(canvasElement).getByRole('button', {
      name: 'Notificações, nenhuma não lida',
    });
    await expect(sino).toHaveTextContent('');
    await expect(sino.closest('[data-essencial]')).not.toBeNull();
  },
};

/** Com não lidas, o sino mostra o número e abre a central. */
export const SinoComNaoLidas: StoryObj<typeof SinoDeNotificacoes> = {
  args: { naoLidas: 3, aoAbrir: fn() },
  render: (args) => <SinoDeNotificacoes {...args} />,
  play: async ({ args, canvasElement }) => {
    const sino = within(canvasElement).getByRole('button', { name: 'Notificações, 3 não lidas' });
    await expect(sino).toHaveTextContent('3');
    await userEvent.click(sino);
    await expect(args.aoAbrir).toHaveBeenCalledOnce();
  },
};

/** Com o modo Foco ligado, o sino mostra "Foco" ao lado, e o nome acessível diz isso. */
export const SinoComFoco: StoryObj<typeof SinoDeNotificacoes> = {
  render: () => <SinoDeNotificacoes naoLidas={2} foco aoAbrir={fn()} />,
  play: async ({ canvasElement }) => {
    const sino = within(canvasElement).getByRole('button', {
      name: 'Notificações, 2 não lidas, Foco ligado',
    });
    await expect(sino).toHaveTextContent('Foco');
    await expect(sino).toHaveTextContent('2');
  },
};

/** Acima de 99, o sino mostra "99+", e o nome acessível diz o número exato. */
export const SinoComMuitas: StoryObj<typeof SinoDeNotificacoes> = {
  render: () => <SinoDeNotificacoes naoLidas={120} aoAbrir={fn()} />,
  play: async ({ canvasElement }) => {
    const sino = within(canvasElement).getByRole('button', {
      name: 'Notificações, 120 não lidas',
    });
    await expect(sino).toHaveTextContent('99+');
  },
};

/** No tablet, o sino é um alvo de toque de 44 × 44 px. */
export const SinoNoTablet: StoryObj<typeof SinoDeNotificacoes> = {
  decorators: [naPostura('tablet')],
  render: () => <SinoDeNotificacoes naoLidas={2} aoAbrir={fn()} />,
  play: async ({ canvasElement }) => {
    const caixa = within(canvasElement)
      .getByRole('button', { name: 'Notificações, 2 não lidas' })
      .getBoundingClientRect();
    await expect(caixa.width).toBeGreaterThanOrEqual(44);
    await expect(caixa.height).toBeGreaterThanOrEqual(44);
    document.documentElement.removeAttribute('data-postura');
  },
};

/**
 * No ambiente de teste, o aviso fica na barra com o ícone e o texto, que dizem o ambiente sem
 * depender da cor, entre os itens que continuam à vista no celular.
 */
export const AmbienteDeTeste: StoryObj<typeof AvisoDoAmbienteDeTeste> = {
  render: () => <AvisoDoAmbienteDeTeste />,
  play: async ({ canvasElement }) => {
    const aviso = within(canvasElement).getByText('Ambiente de teste');
    await expect(aviso).toBeVisible();
    const item = aviso.closest('[data-essencial]');
    await expect(item).not.toBeNull();
    await expect(item?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  },
};

/** No celular, o aviso continua à vista, sem rolagem horizontal. */
export const AmbienteDeTesteNoCelular: StoryObj<typeof AvisoDoAmbienteDeTeste> = {
  decorators: [naPostura('celular')],
  globals: { viewport: { value: 'celular390' } },
  render: () => <AvisoDoAmbienteDeTeste />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Ambiente de teste')).toBeVisible();
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    document.documentElement.removeAttribute('data-postura');
  },
};
