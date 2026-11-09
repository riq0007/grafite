import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Botao } from '../componentes/botao/Botao.tsx';
import { Dock } from './Dock.tsx';
import { AJUSTES_DE_EXEMPLO, MODULOS_DE_EXEMPLO, TelaDeExemplo } from './exemplos.tsx';

const meta: Meta<typeof Dock> = {
  title: 'Casca/Dock',
  component: Dock,
  args: {
    modulos: MODULOS_DE_EXEMPLO,
    modulosDoFim: AJUSTES_DE_EXEMPLO,
    atual: 'inicio',
    posicao: 'embaixo',
    tamanho: 48,
    ampliar: true,
    ocultar: false,
    aoAbrirModulo: fn(),
    aoEscolherItem: fn(),
  },
  decorators: [
    (Historia, { parameters }) => (
      <TelaDeExemplo altura={parameters.alturaDaTela}>
        <Historia />
      </TelaDeExemplo>
    ),
  ],
};
export default meta;

type Historia = StoryObj<typeof Dock>;

/**
 * O dock lateral fica abaixo da barra superior: na tela de 320 px, os cinco itens de 48 px não
 * cabem, e Ajustes iria para o Mais. A tela mais alta mostra o dock lateral inteiro.
 */
const TELA_DO_DOCK_LATERAL = { alturaDaTela: 400 };

/** Módulos de exemplo; Ajustes fica isolado no fim, depois do separador. */
export const Padrao: Historia = {};

export const AEsquerda: Historia = {
  args: { posicao: 'esquerda' },
  parameters: TELA_DO_DOCK_LATERAL,
};

export const ADireita: Historia = { args: { posicao: 'direita', tamanho: 36 } };

/**
 * Os módulos que não cabem no dock lateral ficam no Mais, com os três pontos, no último lugar. A
 * função só confere o dock como abriu: a captura o mostra assim.
 */
export const MaisNoDockLateral: Historia = {
  tags: ['captura'],
  args: { posicao: 'esquerda' },
  parameters: { alturaDaTela: 240 },
  play: async ({ canvasElement }) => {
    const dock = within(within(canvasElement).getByRole('navigation', { name: 'Dock' }));
    await expect(dock.getByRole('button', { name: 'Mais' })).toBeVisible();
    await expect(dock.getByRole('button', { name: 'Início' })).toBeVisible();
    await expect(dock.queryByRole('button', { name: 'Ajustes' })).toBeNull();
  },
};

/** O fundo transparente como o navegador o calcula, para comparar com a placa. */
const transparente = (canvas: HTMLElement) => {
  const amostra = document.createElement('span');
  amostra.style.backgroundColor = 'transparent';
  canvas.append(amostra);
  const cor = getComputedStyle(amostra).backgroundColor;
  amostra.remove();
  return cor;
};

/**
 * O ponto e a borda da placa marcam o módulo atual, e o leitor de tela o anuncia como atual. Todo
 * item tem a placa leve, também em repouso.
 */
export const ModuloAtual: Historia = {
  args: { atual: 'ajustes' },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const ajustes = tela.getByRole('button', { name: 'Ajustes' });
    await expect(ajustes).toHaveAttribute('aria-current', 'page');
    await expect(ajustes.querySelector('[data-parte="ponto"]')).not.toBeNull();
    await expect(getComputedStyle(ajustes).boxShadow).toMatch(/inset/);
    const ativos = tela.getByRole('button', { name: 'Ativos' });
    await expect(ativos).not.toHaveAttribute('aria-current');
    await expect(ativos.querySelector('[data-parte="ponto"]')).toBeNull();
    await expect(getComputedStyle(ativos).boxShadow).toBe('none');
    await expect(getComputedStyle(ativos).backgroundColor).not.toBe(transparente(canvasElement));
  },
};

/** Um item sem menu mostra o nome do módulo numa dica. */
export const DicaNoItemSemMenu: Historia = {
  play: async ({ canvasElement }) => {
    const inicio = within(canvasElement).getByRole('button', { name: 'Início' });
    // O React Aria só mostra dica no hover de quem está usando o mouse (a última interação foi
    // de ponteiro), como na dica do F0.
    await userEvent.click(canvasElement);
    await userEvent.hover(inicio);
    await waitFor(
      () => expect(within(document.body).getByRole('tooltip')).toHaveTextContent('Início'),
      { timeout: 2000 },
    );
    await userEvent.unhover(inicio);
  },
};

/** O separador fica entre os módulos e Ajustes. */
export const SeparadorAntesDeAjustes: Historia = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const separador = tela.getByRole('separator');
    const ajustes = tela.getByRole('button', { name: 'Ajustes' });
    const rede = tela.getByRole('button', { name: 'Rede' });
    await expect(
      rede.compareDocumentPosition(separador) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await expect(
      separador.compareDocumentPosition(ajustes) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  },
};

/** Cor computada de um token, para comparar com o estilo aplicado. */
function corDoToken(token: string): string {
  const amostra = document.createElement('span');
  amostra.style.backgroundColor = `var(${token})`;
  document.body.append(amostra);
  const cor = getComputedStyle(amostra).backgroundColor;
  amostra.remove();
  return cor;
}

/**
 * Com a transparência reduzida, o dock fica com a superfície sólida, sem desfoque. O desfoque do
 * caso normal fica com a regressão visual: aqui ele depende de o sistema operacional não pedir
 * transparência reduzida.
 */
export const TransparenciaReduzida: Historia = {
  play: async ({ canvasElement }) => {
    const raiz = document.documentElement;
    const fundo = canvasElement.querySelector('[data-parte="fundo"]') as HTMLElement;
    raiz.setAttribute('data-transparency', 'reduzida');
    try {
      const solido = corDoToken('--cor-material-solido');
      await expect(getComputedStyle(fundo).backdropFilter).toBe('none');
      await expect(getComputedStyle(fundo).backgroundColor).toBe(solido);
    } finally {
      raiz.removeAttribute('data-transparency');
    }
  },
};

/** Centro de um elemento, em coordenadas da janela, para mover o ponteiro até ele. */
function centroDe(elemento: Element) {
  const caixa = elemento.getBoundingClientRect();
  return { clientX: caixa.left + caixa.width / 2, clientY: caixa.top + caixa.height / 2 };
}

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/**
 * Roda com o movimento normal, qualquer que seja o sistema operacional: sem o atributo, o CSS e
 * o dock seguem o sistema, e quem roda os testes pode ter pedido movimento reduzido.
 */
async function comMovimentoNormal(teste: () => Promise<void>) {
  const raiz = document.documentElement;
  raiz.setAttribute('data-motion', 'normal');
  try {
    await teste();
  } finally {
    raiz.removeAttribute('data-motion');
  }
}

/** O item sob o ponteiro cresce, os vizinhos menos, e nada muda no layout. */
export const AmpliacaoSobOPonteiro: Historia = {
  play: async ({ canvasElement }) => {
    await comMovimentoNormal(async () => {
      const tela = within(canvasElement);
      const operacao = tela.getByRole('button', { name: 'Operação' });
      const ativos = tela.getByRole('button', { name: 'Ativos' });
      const dock = tela.getByRole('navigation', { name: 'Dock' });
      const larguraDoDock = dock.offsetWidth;
      await userEvent.pointer({ target: operacao, coords: centroDe(operacao) });
      await waitFor(() => expect(operacao.getBoundingClientRect().width).toBeGreaterThan(70));
      const vizinho = ativos.getBoundingClientRect().width;
      await expect(vizinho).toBeGreaterThan(50);
      await expect(vizinho).toBeLessThan(operacao.getBoundingClientRect().width);
      await expect(operacao.offsetWidth).toBe(48);
      await expect(dock.offsetWidth).toBe(larguraDoDock);
      await userEvent.unhover(operacao);
      await waitFor(() => expect(operacao.getBoundingClientRect().width).toBeCloseTo(48, 0));
    });
  },
};

/** O fundo do dock acompanha o item ampliado: o destaque do item nunca sai do dock. */
const ampliacaoCabeNoFundo: Historia['play'] = async ({ canvasElement }) => {
  await comMovimentoNormal(async () => {
    const tela = within(canvasElement);
    const ativos = tela.getByRole('button', { name: 'Ativos' });
    const fundo = canvasElement.querySelector('[data-parte="fundo"]') as HTMLElement;
    await userEvent.pointer({ target: ativos, coords: centroDe(ativos) });
    await waitFor(() => expect(ativos.getBoundingClientRect().width).toBeGreaterThan(70));
    await esperar(200);
    const item = ativos.getBoundingClientRect();
    const caixa = fundo.getBoundingClientRect();
    await expect(item.left).toBeGreaterThanOrEqual(caixa.left);
    await expect(item.right).toBeLessThanOrEqual(caixa.right);
    await expect(item.top).toBeGreaterThanOrEqual(caixa.top);
    await expect(item.bottom).toBeLessThanOrEqual(caixa.bottom);
    await userEvent.unhover(ativos);
  });
};

// Objetos com play explícito: o catálogo marca as histórias com interação pela análise estática.
export const AmpliacaoCabeNoFundoEmbaixo: Historia = {
  args: { posicao: 'embaixo' },
  play: ampliacaoCabeNoFundo,
};

export const AmpliacaoCabeNoFundoAEsquerda: Historia = {
  args: { posicao: 'esquerda' },
  parameters: TELA_DO_DOCK_LATERAL,
  play: ampliacaoCabeNoFundo,
};

export const AmpliacaoCabeNoFundoADireita: Historia = {
  args: { posicao: 'direita' },
  parameters: TELA_DO_DOCK_LATERAL,
  play: ampliacaoCabeNoFundo,
};

/** Com movimento reduzido, os itens não mudam de tamanho sob o ponteiro. */
export const SemAmpliacaoComMovimentoReduzido: Historia = {
  play: async ({ canvasElement }) => {
    const raiz = document.documentElement;
    const operacao = within(canvasElement).getByRole('button', { name: 'Operação' });
    raiz.setAttribute('data-motion', 'reduzido');
    try {
      await userEvent.pointer({ target: operacao, coords: centroDe(operacao) });
      await esperar(300);
      await expect(operacao.getBoundingClientRect().width).toBe(48);
    } finally {
      await userEvent.unhover(operacao);
      raiz.removeAttribute('data-motion');
    }
  },
};

/** Com a ampliação desligada na preferência, os itens também não mudam. */
export const AmpliacaoDesligada: Historia = {
  args: { ampliar: false },
  play: async ({ canvasElement }) => {
    const operacao = within(canvasElement).getByRole('button', { name: 'Operação' });
    await userEvent.pointer({ target: operacao, coords: centroDe(operacao) });
    await esperar(300);
    await expect(operacao.getBoundingClientRect().width).toBe(48);
    await userEvent.unhover(operacao);
  },
};

/** Com o ocultar automático, o dock sai da tela, volta pela faixa da borda e sai de novo. */
export const OcultarAutomatico: Historia = {
  args: { ocultar: true },
  play: async ({ canvasElement }) => {
    await comMovimentoNormal(async () => {
      const dock = within(canvasElement).getByRole('navigation', { name: 'Dock' });
      const limite = () => (canvasElement.firstElementChild as HTMLElement).getBoundingClientRect();
      const foraDaTela = () => dock.getBoundingClientRect().top >= limite().bottom;
      await waitFor(() => expect(foraDaTela()).toBe(true));

      const faixa = canvasElement.querySelector('[data-parte="faixa"]');
      await expect(faixa).not.toBeNull();
      await userEvent.pointer({ target: faixa as Element, coords: centroDe(faixa as Element) });
      await waitFor(() => expect(foraDaTela()).toBe(false));

      const inicio = within(dock).getByRole('button', { name: 'Início' });
      await userEvent.pointer({ target: inicio, coords: centroDe(inicio) });
      await userEvent.unhover(inicio);
      await userEvent.pointer({ target: canvasElement, coords: { clientX: 5, clientY: 5 } });
      await esperar(400);
      await expect(foraDaTela()).toBe(false);
      await waitFor(() => expect(foraDaTela()).toBe(true), { timeout: 2000 });
    });
  },
};

/** O foco do teclado revela o dock escondido. */
export const FocoRevelaODock: Historia = {
  args: { ocultar: true },
  play: async ({ canvasElement }) => {
    await comMovimentoNormal(async () => {
      const dock = within(canvasElement).getByRole('navigation', { name: 'Dock' });
      const limite = () => (canvasElement.firstElementChild as HTMLElement).getBoundingClientRect();
      await waitFor(() =>
        expect(dock.getBoundingClientRect().top).toBeGreaterThanOrEqual(limite().bottom),
      );
      await userEvent.tab();
      await expect(dock.contains(document.activeElement)).toBe(true);
      await waitFor(() =>
        expect(dock.getBoundingClientRect().bottom).toBeLessThanOrEqual(limite().bottom),
      );
    });
  },
};

const menuAberto = () => within(document.body).queryAllByRole('menu');

/** Parar o ponteiro sobre um item com menu abre o menu depois do atraso, com o nome no topo. */
export const MenuAbreComAtraso: Historia = {
  play: async ({ canvasElement }) => {
    const ajustes = within(canvasElement).getByRole('button', { name: 'Ajustes' });
    await userEvent.pointer({ target: ajustes, coords: centroDe(ajustes) });
    await expect(menuAberto()).toHaveLength(0);
    const menu = await within(document.body).findByRole('menu', {}, { timeout: 1000 });
    await expect(menu).toHaveAccessibleName('Ajustes');
    await expect(within(menu).getByRole('menuitem', { name: 'Dock' })).toBeInTheDocument();
    await userEvent.pointer({ target: canvasElement, coords: { clientX: 5, clientY: 5 } });
    await waitFor(() => expect(menuAberto()).toHaveLength(0), { timeout: 1500 });
  },
};

/** Atravessar o dock sem parar não abre nenhum menu. */
export const PassagemRapidaNaoAbre: Historia = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    for (const nome of ['Ativos', 'Operação', 'Rede']) {
      const item = tela.getByRole('button', { name: nome });
      await userEvent.pointer({ target: item, coords: centroDe(item) });
    }
    await userEvent.pointer({ target: canvasElement, coords: { clientX: 5, clientY: 5 } });
    await esperar(500);
    await expect(menuAberto()).toHaveLength(0);
  },
};

/** Com um menu aberto, passar a outro item troca de menu na hora. */
export const TrocaRapidaDeMenu: Historia = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const ativos = tela.getByRole('button', { name: 'Ativos' });
    await userEvent.pointer({ target: ativos, coords: centroDe(ativos) });
    await within(document.body).findByRole('menu', { name: 'Ativos' }, { timeout: 1000 });
    const operacao = tela.getByRole('button', { name: 'Operação' });
    await userEvent.pointer({ target: operacao, coords: centroDe(operacao) });
    await within(document.body).findByRole('menu', { name: 'Operação' }, { timeout: 400 });
    // O menu anterior sai com a animação de saída do painel.
    await waitFor(() =>
      expect(within(document.body).queryByRole('menu', { name: 'Ativos' })).toBeNull(),
    );
    await userEvent.pointer({ target: canvasElement, coords: { clientX: 5, clientY: 5 } });
    await waitFor(() => expect(menuAberto()).toHaveLength(0), { timeout: 1500 });
  },
};

/** Escolher um item do menu navega e fecha o menu. */
export const EscolherItemNavega: Historia = {
  play: async ({ args, canvasElement }) => {
    const ajustes = within(canvasElement).getByRole('button', { name: 'Ajustes' });
    await userEvent.pointer({ target: ajustes, coords: centroDe(ajustes) });
    const menu = await within(document.body).findByRole('menu', {}, { timeout: 1000 });
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Dock' }));
    await expect(args.aoEscolherItem).toHaveBeenCalledWith('ajustes', 'ajustes/dock');
    await waitFor(() => expect(menuAberto()).toHaveLength(0));
  },
};

/** Com o dock à direita, o submenu não cabe à direita do menu e abre à esquerda. */
export const SubmenuPertoDaBorda: Historia = {
  args: { posicao: 'direita' },
  parameters: TELA_DO_DOCK_LATERAL,
  play: async ({ canvasElement }) => {
    const ativos = within(canvasElement).getByRole('button', { name: 'Ativos' });
    await userEvent.pointer({ target: ativos, coords: centroDe(ativos) });
    const menu = await within(document.body).findByRole(
      'menu',
      { name: 'Ativos' },
      { timeout: 1000 },
    );
    const rede = within(menu).getByRole('menuitem', { name: 'Rede' });
    // Caminho explícito: sai do item do dock e entra no menu (o user-event não gera, sozinho, a
    // saída de um elemento para outro que está num portal).
    await userEvent.unhover(ativos);
    await userEvent.pointer({ target: rede, coords: centroDe(rede) });
    const submenu = await within(document.body).findByRole(
      'menu',
      { name: 'Rede' },
      { timeout: 1000 },
    );
    await expect(submenu.getBoundingClientRect().right).toBeLessThanOrEqual(
      menu.getBoundingClientRect().left + 2,
    );
    await userEvent.unhover(rede);
    await userEvent.pointer({ target: canvasElement, coords: { clientX: 5, clientY: 5 } });
    await waitFor(() => expect(menuAberto()).toHaveLength(0), { timeout: 1500 });
  },
};

const focado = () => document.activeElement;

/** O dock é uma parada só do Tab: um Tab entra, o seguinte vai ao próximo elemento da tela. */
export const TecladoParadaUnica: Historia = {
  render: (args) => (
    <>
      <Dock {...args} />
      <Botao>Depois do dock</Botao>
    </>
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const dock = tela.getByRole('navigation', { name: 'Dock' });
    await userEvent.tab();
    await expect(dock.contains(focado())).toBe(true);
    await userEvent.tab();
    await expect(focado()).toBe(tela.getByRole('button', { name: 'Depois do dock' }));
  },
};

/** As setas andam na direção do dock; Home e End vão às pontas, pulando o separador. */
export const SetasNoDock: Historia = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.tab();
    await expect(focado()).toBe(tela.getByRole('button', { name: 'Início' }));
    await userEvent.keyboard('{ArrowRight}');
    await expect(focado()).toBe(tela.getByRole('button', { name: 'Ativos' }));
    await userEvent.keyboard('{End}');
    await expect(focado()).toBe(tela.getByRole('button', { name: 'Ajustes' }));
    await userEvent.keyboard('{ArrowLeft}');
    await expect(focado()).toBe(tela.getByRole('button', { name: 'Rede' }));
    await userEvent.keyboard('{Home}');
    await expect(focado()).toBe(tela.getByRole('button', { name: 'Início' }));
  },
};

/** Com o dock à esquerda, a seta para baixo anda e a seta para a direita abre o menu. */
export const SetasNoDockAEsquerda: Historia = {
  args: { posicao: 'esquerda' },
  parameters: TELA_DO_DOCK_LATERAL,
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');
    await expect(focado()).toBe(tela.getByRole('button', { name: 'Ativos' }));
    await userEvent.keyboard('{ArrowRight}');
    const menu = await within(document.body).findByRole('menu', { name: 'Ativos' });
    await waitFor(() =>
      expect(focado()).toBe(within(menu).getByRole('menuitem', { name: 'Todos os ativos' })),
    );
    await userEvent.keyboard('{Escape}');
  },
};

/** A seta para longe da borda abre o menu com o foco no primeiro item; Esc volta ao item. */
export const MenuPeloTeclado: Historia = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.tab();
    await userEvent.keyboard('{End}');
    const ajustes = tela.getByRole('button', { name: 'Ajustes' });
    await userEvent.keyboard('{ArrowUp}');
    const menu = await within(document.body).findByRole('menu', { name: 'Ajustes' });
    await waitFor(() =>
      expect(focado()).toBe(within(menu).getByRole('menuitem', { name: 'Aparência' })),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryAllByRole('menu')).toHaveLength(0));
    await expect(focado()).toBe(ajustes);
  },
};

/**
 * Escolher um item pelo teclado e reabrir o menu pela seta enquanto o anterior ainda sai da tela:
 * o painel que sai é reaproveitado, e o foco vai de novo ao primeiro item.
 */
export const MenuReabertoPeloTeclado: Historia = {
  play: async ({ canvasElement, args }) => {
    // A saída do menu dura 5 s nesta história, para a seta o reabrir antes do fim dela também com o
    // executor do CI carregado: com os 120 ms de sempre, a asserção às vezes chegava depois da
    // saída (change integracao-sob-carga).
    const raiz = document.documentElement;
    raiz.style.setProperty('--dur-opacidade', '5s');
    try {
      const tela = within(canvasElement);
      await userEvent.tab();
      await userEvent.keyboard('{End}');
      const ajustes = tela.getByRole('button', { name: 'Ajustes' });
      await userEvent.keyboard('{ArrowUp}');
      const menu = await within(document.body).findByRole('menu', { name: 'Ajustes' });
      await waitFor(() =>
        expect(focado()).toBe(within(menu).getByRole('menuitem', { name: 'Aparência' })),
      );
      await userEvent.keyboard('{Enter}');
      await expect(args.aoEscolherItem).toHaveBeenCalled();
      // O menu escolhido ainda está saindo da tela quando a seta o reabre.
      await expect(within(document.body).queryAllByRole('menu')).toHaveLength(1);
      ajustes.focus();
      await userEvent.keyboard('{ArrowUp}');
      const reaberto = await within(document.body).findByRole('menu', { name: 'Ajustes' });
      await waitFor(() =>
        expect(focado()).toBe(within(reaberto).getByRole('menuitem', { name: 'Aparência' })),
      );
    } finally {
      raiz.style.removeProperty('--dur-opacidade');
    }
  },
};

/** Enter abre o módulo do item com foco. */
export const EnterAbreOModulo: Historia = {
  play: async ({ args }) => {
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{Enter}');
    await expect(args.aoAbrirModulo).toHaveBeenCalledWith('ativos');
    await expect(within(document.body).queryAllByRole('menu')).toHaveLength(0);
  },
};

/** Pelo teclado, a dica do item sem menu aparece no foco. */
export const DicaPeloTeclado: Historia = {
  play: async () => {
    await userEvent.tab();
    await waitFor(() =>
      expect(within(document.body).getByRole('tooltip')).toHaveTextContent('Início'),
    );
  },
};

/** No toque, o primeiro toque abre o menu na hora, sem abrir o módulo; tocar no item navega. */
export const ToqueAbreOMenu: Historia = {
  play: async ({ args, canvasElement }) => {
    const ajustes = within(canvasElement).getByRole('button', { name: 'Ajustes' });
    await userEvent.pointer({ keys: '[TouchA]', target: ajustes });
    const menu = await within(document.body).findByRole(
      'menu',
      { name: 'Ajustes' },
      { timeout: 100 },
    );
    await expect(args.aoAbrirModulo).not.toHaveBeenCalled();
    await userEvent.pointer({
      keys: '[TouchA]',
      target: within(menu).getByRole('menuitem', { name: 'Dock' }),
    });
    await expect(args.aoEscolherItem).toHaveBeenCalledWith('ajustes', 'ajustes/dock');
    await waitFor(() => expect(within(document.body).queryAllByRole('menu')).toHaveLength(0));
  },
};

/** No toque, tocar fora do dock e do menu fecha o menu. */
export const ToqueForaFecha: Historia = {
  play: async ({ canvasElement }) => {
    const ativos = within(canvasElement).getByRole('button', { name: 'Ativos' });
    await userEvent.pointer({ keys: '[TouchA]', target: ativos });
    await within(document.body).findByRole('menu', { name: 'Ativos' }, { timeout: 100 });
    await userEvent.pointer({
      keys: '[TouchA]',
      target: canvasElement.firstElementChild as Element,
    });
    await waitFor(() => expect(within(document.body).queryAllByRole('menu')).toHaveLength(0));
  },
};

/** No toque, um item sem menu abre o módulo no primeiro toque. */
export const ToqueSemMenuNavega: Historia = {
  play: async ({ args, canvasElement }) => {
    const inicio = within(canvasElement).getByRole('button', { name: 'Início' });
    await userEvent.pointer({ keys: '[TouchA]', target: inicio });
    await expect(args.aoAbrirModulo).toHaveBeenCalledWith('inicio');
  },
};

/** O separador acompanha a ampliação: fica entre os vizinhos e no meio do dock que cresceu. */
export const SeparadorAcompanhaAAmpliacao: Historia = {
  play: async ({ canvasElement }) => {
    await comMovimentoNormal(async () => {
      const tela = within(canvasElement);
      const rede = tela.getByRole('button', { name: 'Rede' });
      const ajustes = tela.getByRole('button', { name: 'Ajustes' });
      const separador = tela.getByRole('separator');
      const fundo = canvasElement.querySelector('[data-parte="fundo"]') as HTMLElement;
      await userEvent.pointer({ target: rede, coords: centroDe(rede) });
      await waitFor(() => expect(rede.getBoundingClientRect().width).toBeGreaterThan(70));
      await esperar(200);
      const linha = separador.getBoundingClientRect();
      await expect(linha.left).toBeGreaterThanOrEqual(rede.getBoundingClientRect().right);
      await expect(linha.right).toBeLessThanOrEqual(ajustes.getBoundingClientRect().left);
      const caixa = fundo.getBoundingClientRect();
      const meioDaLinha = linha.top + linha.height / 2;
      await expect(Math.abs(meioDaLinha - (caixa.top + caixa.height / 2))).toBeLessThan(2);
      await userEvent.unhover(rede);
    });
  },
};
