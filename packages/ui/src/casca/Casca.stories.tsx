import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { CampoDeTexto } from '../componentes/campo/CampoDeTexto.tsx';
import { Formulario } from '../componentes/campo/Formulario.tsx';
import { LinhaDeCampos } from '../componentes/campo/LinhaDeCampos.tsx';
import { EstadoVazio } from '../componentes/exibicao/EstadoVazio.tsx';
import {
  CabecalhoDaTabela,
  Celula,
  Coluna,
  CorpoDaTabela,
  Linha,
  Tabela,
} from '../componentes/tabela/Tabela.tsx';
import { arranjoDe } from '../teste/arranjo.ts';
import { Casca, TituloDaJanela } from './Casca.tsx';
import type { PropsDoDock } from './Dock.tsx';
import { AJUSTES_DE_EXEMPLO, MENUS_DA_BARRA_DE_EXEMPLO, MODULOS_DE_EXEMPLO } from './exemplos.tsx';
import { BotaoDeBusca, SinoDeNotificacoes } from './ItensDaBarra.tsx';
import { esperarMontagem } from './montagem.ts';
import { RolagemDaJanela } from './RolagemDaJanela.tsx';

const DOCK_PADRAO: PropsDoDock = {
  modulos: MODULOS_DE_EXEMPLO,
  modulosDoFim: AJUSTES_DE_EXEMPLO,
  atual: 'ativos',
  posicao: 'embaixo',
  tamanho: 48,
  ampliar: true,
  ocultar: false,
  aoAbrirModulo: fn(),
  aoEscolherItem: fn(),
};

/** Casca inteira com o registro de exemplo do catálogo: barra, janela e dock juntos. */
const meta: Meta<typeof Casca> = {
  title: 'Casca/Casca',
  component: Casca,
  parameters: { layout: 'fullscreen' },
  args: {
    barra: {
      modulo: 'Ativos',
      menus: MENUS_DA_BARRA_DE_EXEMPLO,
      aoEscolherItem: fn(),
      status: (
        <>
          <BotaoDeBusca aoAbrir={fn()} plataforma="outra" />
          <span>Itens de status (exemplo)</span>
          <SinoDeNotificacoes naoLidas={3} aoAbrir={fn()} />
        </>
      ),
      usuario: { itens: [{ id: 'ajustes', rotulo: 'Ajustes do Sistema' }], aoEscolherItem: fn() },
    },
    dock: DOCK_PADRAO,
    children: (
      <RolagemDaJanela>
        <TituloDaJanela>Ativos (exemplo)</TituloDaJanela>
        <EstadoVazio titulo="Módulo de exemplo do catálogo" descricao="Sem dados reais." />
      </RolagemDaJanela>
    ),
  },
};
export default meta;

type Historia = StoryObj<typeof Casca>;

export const Padrao: Historia = {};

export const DockAEsquerda: Historia = {
  args: { dock: { ...DOCK_PADRAO, posicao: 'esquerda' } },
};

/** A área que rola, dentro da janela. */
const areaQueRola = (janela: HTMLElement) =>
  janela.querySelector(':scope > [data-rolagem-da-janela]') as HTMLElement;

/**
 * O primeiro item do Tab é "Ir para o conteúdo", que leva o foco à área que rola, dentro da janela,
 * para o teclado rolar o conteúdo.
 */
export const IrParaOConteudo: Historia = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.tab();
    const link = tela.getByRole('link', { name: 'Ir para o conteúdo' });
    await expect(link).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(areaQueRola(tela.getByRole('main'))).toHaveFocus();
  },
};

/** Em repouso, a janela fica entre a barra e o dock, sem ficar sob nenhum dos dois. */
export const JanelaEntreBarraEDock: Historia = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const janela = tela.getByRole('main').getBoundingClientRect();
    const barra = tela.getByRole('banner').getBoundingClientRect();
    const dock = tela.getByRole('navigation', { name: 'Dock' }).getBoundingClientRect();
    await expect(janela.top).toBeGreaterThanOrEqual(barra.bottom);
    await expect(janela.bottom).toBeLessThanOrEqual(dock.top);
  },
};

/** Conteúdo de exemplo mais alto que a janela, numa tela de notebook. */
const CONTEUDO_LONGO = (
  <RolagemDaJanela>
    <TituloDaJanela>Ativo (exemplo)</TituloDaJanela>
    {Array.from({ length: 40 }, (_, indice) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: as linhas do exemplo são fixas.
      <p key={indice}>Linha {indice + 1} do conteúdo de exemplo.</p>
    ))}
  </RolagemDaJanela>
);

/**
 * A janela, a barra e o dock de uma casca com o conteúdo mais alto que a janela: a página não rola,
 * e o conteúdo rola dentro da área, com a borda de baixo esmaecida.
 */
async function conferirConteudoLongo(canvasElement: HTMLElement) {
  const tela = within(canvasElement);
  const janela = tela.getByRole('main');
  const area = areaQueRola(janela);
  await expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(window.innerHeight);
  await expect(area.scrollHeight).toBeGreaterThan(area.clientHeight);
  await waitFor(() => expect(area).toHaveAttribute('data-mais-abaixo'));
  return {
    janela: janela.getBoundingClientRect(),
    barra: tela.getByRole('banner').getBoundingClientRect(),
  };
}

/** Com o dock embaixo, a janela termina antes dele, com o mesmo respiro que a separa da barra. */
export const ConteudoMaisAltoQueAJanela: Historia = {
  globals: { viewport: { value: 'notebook1366', isRotated: false } },
  args: { children: CONTEUDO_LONGO },
  play: async ({ canvasElement }) => {
    const { janela, barra } = await conferirConteudoLongo(canvasElement);
    const dock = within(canvasElement).getByRole('navigation', { name: 'Dock' });
    const caixaDoDock = dock.getBoundingClientRect();
    await expect(janela.bottom).toBeLessThanOrEqual(caixaDoDock.top);
    await expect(caixaDoDock.top - janela.bottom).toBeCloseTo(janela.top - barra.bottom, 0);
  },
};

/** Com o dock à direita, a janela vai até o respiro de baixo, e o conteúdo rola dentro dela. */
export const ConteudoLongoComODockADireita: Historia = {
  globals: { viewport: { value: 'notebook1366', isRotated: false } },
  args: { dock: { ...DOCK_PADRAO, posicao: 'direita' }, children: CONTEUDO_LONGO },
  play: async ({ canvasElement }) => {
    const { janela, barra } = await conferirConteudoLongo(canvasElement);
    const dock = within(canvasElement).getByRole('navigation', { name: 'Dock' });
    await expect(janela.right).toBeLessThanOrEqual(dock.getBoundingClientRect().left);
    await expect(window.innerHeight - janela.bottom).toBeCloseTo(janela.top - barra.bottom, 0);
  },
};

/** Com o ocultar automático, a janela ocupa o lugar do dock, até o respiro da borda de baixo. */
export const ConteudoLongoComOcultarAutomatico: Historia = {
  globals: { viewport: { value: 'notebook1366', isRotated: false } },
  args: { dock: { ...DOCK_PADRAO, ocultar: true }, children: CONTEUDO_LONGO },
  play: async ({ canvasElement }) => {
    const { janela, barra } = await conferirConteudoLongo(canvasElement);
    await expect(window.innerHeight - janela.bottom).toBeCloseTo(janela.top - barra.bottom, 0);
  },
};

/** Com o dock à esquerda, a janela começa depois dele. */
export const JanelaDepoisDoDockAEsquerda: Historia = {
  args: { dock: { ...DOCK_PADRAO, posicao: 'esquerda' } },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const janela = tela.getByRole('main').getBoundingClientRect();
    const dock = tela.getByRole('navigation', { name: 'Dock' }).getBoundingClientRect();
    await expect(janela.left).toBeGreaterThanOrEqual(dock.right);
  },
};

/** O título da janela recebe foco, para o app levar o foco a ele depois de navegar. */
export const TituloFocavel: Historia = {
  play: async ({ canvasElement }) => {
    const titulo = within(canvasElement).getByRole('heading', { level: 1 });
    titulo.focus();
    await expect(titulo).toHaveFocus();
  },
};

/** Área de toque de um elemento, em px: o tamanho de layout, sem a escala da animação de abrir. */
const areaDe = (elemento: Element) => {
  const { offsetWidth, offsetHeight } = elemento as HTMLElement;
  return { largura: offsetWidth, altura: offsetHeight };
};

/**
 * No tablet, o dock fica embaixo (a preferência à esquerda não muda), os alvos de toque têm
 * pelo menos 44 × 44 px, o dock não amplia e o primeiro toque abre o menu.
 */
export const Tablet: Historia = {
  args: { postura: 'tablet', dock: { ...DOCK_PADRAO, posicao: 'esquerda', tamanho: 28 } },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const dock = tela.getByRole('navigation', { name: 'Dock' });
    const janela = tela.getByRole('main').getBoundingClientRect();
    await expect(dock.getBoundingClientRect().top).toBeGreaterThanOrEqual(janela.bottom);

    const alvos = [
      ...within(dock).getAllByRole('button'),
      ...['Visualizar', 'Filtros', 'Ações', 'Usuário'].map((nome) =>
        tela.getByRole('button', { name: nome }),
      ),
    ];
    for (const alvo of alvos) {
      const { largura, altura } = areaDe(alvo);
      await expect(largura, alvo.textContent ?? '').toBeGreaterThanOrEqual(44);
      await expect(altura, alvo.textContent ?? '').toBeGreaterThanOrEqual(44);
    }

    const ativos = within(dock).getByRole('button', { name: 'Ativos' });
    await userEvent.pointer({ target: ativos, coords: { clientX: 1, clientY: 1 } });
    await userEvent.pointer({
      target: ativos,
      coords: {
        clientX: ativos.getBoundingClientRect().left + 22,
        clientY: ativos.getBoundingClientRect().top + 22,
      },
    });
    await expect(areaDe(ativos).largura).toBe(44);

    await userEvent.pointer({ keys: '[TouchA]', target: ativos });
    const menu = await within(document.body).findByRole(
      'menu',
      { name: 'Ativos' },
      { timeout: 100 },
    );
    for (const item of within(menu).getAllByRole('menuitem')) {
      await expect(areaDe(item).altura).toBeGreaterThanOrEqual(44);
    }
  },
};

/**
 * No celular, a barra de abas fica no lugar do dock, e a barra superior mostra o nome do módulo
 * e o status essencial. Tocar no nome abre a árvore do módulo e os menus da barra no painel.
 */
export const Celular: Historia = {
  args: { postura: 'celular' },
  play: async ({ args, canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.queryByRole('navigation', { name: 'Dock' })).toBeNull();
    await expect(tela.getByRole('navigation', { name: 'Módulos' })).toBeInTheDocument();
    await expect(tela.queryByRole('button', { name: 'Visualizar' })).toBeNull();
    await expect(tela.getByText('Itens de status (exemplo)')).not.toBeVisible();
    await expect(tela.getByRole('button', { name: 'Usuário' })).toBeVisible();

    await userEvent.click(within(tela.getByRole('banner')).getByRole('button', { name: 'Ativos' }));
    const painel = await within(document.body).findByRole('dialog', { name: 'Ativos' });
    await userEvent.click(within(painel).getByRole('button', { name: 'Visualizar' }));
    const nivel = await within(document.body).findByRole('dialog', { name: 'Visualizar' });
    await userEvent.click(within(nivel).getByRole('button', { name: 'Galeria' }));
    await expect(args.barra.aoEscolherItem).toHaveBeenCalledWith(
      'visualizar',
      'visualizar/galeria',
    );

    await userEvent.click(within(tela.getByRole('banner')).getByRole('button', { name: 'Ativos' }));
    const deNovo = await within(document.body).findByRole('dialog', { name: 'Ativos' });
    await userEvent.click(within(deNovo).getByRole('button', { name: 'Todos os ativos' }));
    await expect(args.dock.aoEscolherItem).toHaveBeenCalledWith('ativos', 'ativos/todos');
  },
};

/** No celular, o nome de um módulo sem menus fica só como texto: não há árvore para abrir. */
export const CelularSemMenus: Historia = {
  args: {
    postura: 'celular',
    barra: { modulo: 'Início', aoEscolherItem: fn() },
    dock: { ...DOCK_PADRAO, atual: 'inicio' },
  },
  play: async ({ canvasElement }) => {
    const barra = within(within(canvasElement).getByRole('banner'));
    await expect(barra.queryByRole('button', { name: 'Início' })).toBeNull();
    await expect(barra.getByText('Início')).toBeVisible();
  },
};

/** Cadastro de exemplo: um formulário com uma linha de campos e, abaixo, uma tabela. */
function CadastroDeExemplo() {
  return (
    <>
      <TituloDaJanela>Cadastro de ativo (exemplo)</TituloDaJanela>
      <Formulario aria-label="Cadastro de ativo">
        <LinhaDeCampos>
          <CampoDeTexto rotulo="Patrimônio" />
          <CampoDeTexto rotulo="Número de série" />
        </LinhaDeCampos>
        <CampoDeTexto rotulo="Local" />
      </Formulario>
      <Tabela rotulo="Ativos do local">
        <CabecalhoDaTabela>
          <Coluna id="patrimonio" principal>
            Patrimônio
          </Coluna>
          <Coluna id="nome">Equipamento</Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela itens={[{ id: '1', patrimonio: 'PAT-00412', nome: 'HP LaserJet M404dn' }]}>
          {(ativo) => (
            <Linha id={ativo.id}>
              <Celula>{ativo.patrimonio}</Celula>
              <Celula>{ativo.nome}</Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
    </>
  );
}

/** Largura útil da janela de conteúdo: a da área que rola, sem o respiro interno. */
const larguraUtil = (janela: HTMLElement) => {
  const area = areaQueRola(janela);
  const estilo = getComputedStyle(area);
  return area.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
};

/** Margens da janela de conteúdo até as bordas da página (sem a barra de rolagem). */
const margensDa = (janela: HTMLElement) => {
  const caixa = janela.getBoundingClientRect();
  return { esquerda: caixa.left, direita: document.documentElement.clientWidth - caixa.right };
};

/** Numa tela de 2560 px, o formulário para em 960 px, e a tabela ocupa a largura toda. */
export const FormularioNaTelaLarga: Historia = {
  globals: { viewport: { value: 'tela2560', isRotated: false } },
  args: {
    children: (
      <RolagemDaJanela>
        <CadastroDeExemplo />
      </RolagemDaJanela>
    ),
  },
  play: async ({ canvasElement }) => {
    await expect(window.innerWidth).toBe(2560);
    const tela = within(canvasElement);
    const util = larguraUtil(tela.getByRole('main'));
    await expect(util).toBeGreaterThan(960);
    const formulario = tela.getByRole('form', { name: 'Cadastro de ativo' });
    await expect(formulario.getBoundingClientRect().width).toBeLessThanOrEqual(960);
    const tabela = tela.getByRole('grid', { name: 'Ativos do local' });
    await expect(tabela.getBoundingClientRect().width).toBeCloseTo(util, 0);
  },
};

/** A margem lateral cresce com a tela e para em 40 px. */
export const MargemNaTelaLarga: Historia = {
  globals: { viewport: { value: 'tela2560', isRotated: false } },
  play: async ({ canvasElement }) => {
    await expect(window.innerWidth).toBe(2560);
    const { esquerda, direita } = margensDa(within(canvasElement).getByRole('main'));
    await expect(esquerda).toBeCloseTo(40, 1);
    await expect(direita).toBeCloseTo(40, 1);
  },
};

/** No celular de 390 px, a margem lateral é de 16 px mais 1% da largura: 19,9 px. */
export const MargemNoCelular: Historia = {
  globals: { viewport: { value: 'celular390', isRotated: false } },
  play: async ({ canvasElement }) => {
    await expect(window.innerWidth).toBe(390);
    const { esquerda, direita } = margensDa(within(canvasElement).getByRole('main'));
    await expect(esquerda).toBeCloseTo(19.9, 1);
    await expect(direita).toBeCloseTo(19.9, 1);
  },
};

/**
 * Numa tela de 1920 px, a linha de campos numa coluna de 320 px põe um campo abaixo do outro,
 * como num celular, e a mesma linha na coluna larga, lado a lado.
 */
export const LinhaNumaColunaEstreita: Historia = {
  globals: { viewport: { value: 'tela1920', isRotated: false } },
  args: {
    children: (
      <RolagemDaJanela>
        <TituloDaJanela>Ativo (exemplo)</TituloDaJanela>
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 'var(--esp-6)' }}>
          <Formulario aria-label="Coluna estreita">
            <LinhaDeCampos>
              <CampoDeTexto rotulo="Patrimônio" />
              <CampoDeTexto rotulo="Número de série" />
            </LinhaDeCampos>
          </Formulario>
          <Formulario aria-label="Coluna larga">
            <LinhaDeCampos>
              <CampoDeTexto rotulo="Fabricante" />
              <CampoDeTexto rotulo="Modelo" />
            </LinhaDeCampos>
          </Formulario>
        </div>
      </RolagemDaJanela>
    ),
  },
  play: async ({ canvasElement }) => {
    await expect(window.innerWidth).toBe(1920);
    const tela = within(canvasElement);
    const campo = (nome: string) => tela.getByRole('textbox', { name: nome });
    await expect(arranjoDe(campo('Patrimônio'), campo('Número de série'))).toBe(
      'um abaixo do outro',
    );
    await expect(arranjoDe(campo('Fabricante'), campo('Modelo'))).toBe('lado a lado');
  },
};

/** As partes que se montam: a barra, a janela e o dock ou a barra de abas. */
const parte = (tela: HTMLElement, nome: string) =>
  tela.querySelector(`[data-montagem="${nome}"]`) as HTMLElement;
const estilo = (tela: HTMLElement, nome: string) => getComputedStyle(parte(tela, nome));
const umQuadro = () => new Promise((resolver) => requestAnimationFrame(() => resolver(undefined)));

/** Depois de cada história da chegada, o <html> volta ao estado de uma casca já aberta. */
const naChegada =
  (estado: 'boas-vindas' | 'entrada' | 'montando', movimento?: 'reduzido'): Decorator =>
  (Historia) => {
    const raiz = document.documentElement;
    raiz.removeAttribute('data-chegada');
    if (movimento) raiz.setAttribute('data-motion', movimento);
    else raiz.removeAttribute('data-motion');
    // O estado entra depois de a casca estar na página, como no app.
    requestAnimationFrame(() => raiz.setAttribute('data-chegada', estado));
    return <Historia />;
  };

const sairDaChegada = () => {
  document.documentElement.removeAttribute('data-chegada');
  document.documentElement.removeAttribute('data-motion');
};

/**
 * Depois das boas-vindas, a casca se monta: a barra desce, a janela aparece com uma escala leve, e
 * o dock sobe com mola. No fim, tudo fica no lugar.
 */
export const Montagem: Historia = {
  decorators: [naChegada('montando')],
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-chegada')).toBe('montando'),
    );
    await umQuadro();
    await expect(estilo(canvasElement, 'barra').transform).not.toBe('none');
    await expect(Number(estilo(canvasElement, 'janela').opacity)).toBeLessThan(1);
    await expect(estilo(canvasElement, 'dock').transform).not.toBe('none');
    await expect(estilo(canvasElement, 'dock').animationTimingFunction).toBe(
      'cubic-bezier(0.2, 1.25, 0.3, 1)',
    );
    await esperarMontagem(canvasElement);
    await expect(estilo(canvasElement, 'barra').transform).toBe('none');
    await expect(estilo(canvasElement, 'janela').opacity).toBe('1');
    await expect(estilo(canvasElement, 'dock').transform).toBe('none');
    sairDaChegada();
  },
};

/** No celular, a barra de abas sobe no lugar do dock. */
export const MontagemNoCelular: Historia = {
  args: { postura: 'celular' },
  decorators: [naChegada('montando')],
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-chegada')).toBe('montando'),
    );
    await umQuadro();
    await expect(estilo(canvasElement, 'abas').transform).not.toBe('none');
    await esperarMontagem(canvasElement);
    await expect(estilo(canvasElement, 'abas').transform).toBe('none');
    sairDaChegada();
  },
};

/** Com movimento reduzido, nada se desloca: a janela só aparece, por troca de opacidade. */
export const MontagemSemMovimento: Historia = {
  decorators: [naChegada('montando', 'reduzido')],
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-chegada')).toBe('montando'),
    );
    await umQuadro();
    await expect(estilo(canvasElement, 'barra').transform).toBe('none');
    await expect(estilo(canvasElement, 'dock').transform).toBe('none');
    await expect(Number(estilo(canvasElement, 'janela').opacity)).toBeLessThan(1);
    await expect(estilo(canvasElement, 'janela').scale).toBe('none');
    await esperarMontagem(canvasElement);
    await expect(estilo(canvasElement, 'janela').opacity).toBe('1');
    sairDaChegada();
  },
};

/** Durante as boas-vindas, a casca espera por baixo: invisível e fora do alcance do teclado. */
export const AtrasDasBoasVindas: Historia = {
  decorators: [naChegada('boas-vindas')],
  play: async ({ canvasElement }) => {
    const casca = canvasElement.querySelector('[data-postura]') as HTMLElement;
    await waitFor(() => expect(casca).toHaveAttribute('inert'));
    await expect(getComputedStyle(casca).visibility).toBe('hidden');
    await userEvent.tab();
    await expect(casca.contains(document.activeElement)).toBe(false);
    document.documentElement.setAttribute('data-chegada', 'pronta');
    await waitFor(() => expect(casca).not.toHaveAttribute('inert'));
    await expect(getComputedStyle(casca).visibility).toBe('visible');
    sairDaChegada();
  },
};

/**
 * Depois de uma entrada sem boas-vindas, a casca se desenha transparente e fora do alcance do
 * teclado, e aparece por troca de opacidade quando a chegada fica pronta, sem nada se deslocar.
 */
export const DepoisDaEntrada: Historia = {
  decorators: [naChegada('entrada')],
  play: async ({ canvasElement }) => {
    const casca = canvasElement.querySelector('[data-postura]') as HTMLElement;
    await waitFor(() => expect(casca).toHaveAttribute('inert'));
    await expect(getComputedStyle(casca).opacity).toBe('0');
    document.documentElement.setAttribute('data-chegada', 'pronta');
    await waitFor(() => expect(casca).not.toHaveAttribute('inert'));
    await expect(getComputedStyle(casca).transitionProperty).toBe('opacity');
    await expect(getComputedStyle(casca).transitionDuration).toBe('0.12s');
    await waitFor(() => expect(getComputedStyle(casca).opacity).toBe('1'));
    await expect(estilo(canvasElement, 'barra').transform).toBe('none');
    await expect(estilo(canvasElement, 'dock').transform).toBe('none');
    sairDaChegada();
  },
};
