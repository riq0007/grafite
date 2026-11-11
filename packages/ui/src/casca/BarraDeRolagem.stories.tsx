import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ReactNode, useLayoutEffect } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import { navegadorDeTeste } from '../teste/navegadorDeTeste.ts';
import { TEMPO_DA_MARCA_DE_ROLAGEM } from './barraDeRolagem.ts';

// A barra de rolagem própria (spec componentes-base, "Barra de rolagem própria"; change
// barra-de-rolagem-propria, design, decisões 1 a 4 e 6): as regras ficam na `base.css` e valem em
// toda área que rola, sem nenhuma tela declarar a barra.
const meta: Meta = { title: 'Casca/Barra de rolagem' };
export default meta;

type Historia = StoryObj;

/** A largura da barra, em px: o `--esp-3` dos tokens. */
const LARGURA_DA_BARRA = 12;

/**
 * Os atributos da raiz valem só enquanto a história está na tela, como as preferências do app. A
 * marca da barra do sistema, que a partida do catálogo mede, sai durante a história, a não ser na
 * que a pede: a barra própria aparece também no catálogo aberto num aparelho de barra sobreposta.
 */
function NaRaiz({
  atributos,
  children,
}: {
  atributos: Record<string, string>;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    const raiz = document.documentElement;
    const nomes = [...new Set([...Object.keys(atributos), 'data-barra-do-sistema'])];
    const antes = new Map(nomes.map((nome) => [nome, raiz.getAttribute(nome)]));
    raiz.removeAttribute('data-barra-do-sistema');
    for (const [nome, valor] of Object.entries(atributos)) raiz.setAttribute(nome, valor);
    return () => {
      for (const [nome, valor] of antes) {
        if (valor === null) raiz.removeAttribute(nome);
        else raiz.setAttribute(nome, valor);
      }
    };
  }, [atributos]);
  return children;
}

const AO_ROLAR = { 'data-rolagem': 'ao-rolar' };
const SEMPRE = { 'data-rolagem': 'sempre' };
const DO_SISTEMA = { ...SEMPRE, 'data-barra-do-sistema': '' };

/** Uma área com mais conteúdo do que cabe, que recebe o foco do teclado, como a janela. */
function AreaQueRola({ nome, estilo }: { nome: string; estilo?: React.CSSProperties }) {
  return (
    <section
      aria-label={nome}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a área que rola recebe o foco do teclado, como a janela da casca.
      tabIndex={0}
      data-area={nome}
      style={{
        boxSizing: 'border-box',
        inlineSize: '320px',
        blockSize: '240px',
        overflow: 'auto',
        padding: 'var(--esp-3)',
        border: '1px solid var(--cor-linha)',
        borderRadius: 'var(--raio-menu)',
        backgroundColor: 'var(--cor-superficie)',
        color: 'var(--cor-texto)',
        ...estilo,
      }}
    >
      <button type="button">Primeiro item</button>
      <ol style={{ margin: 0, paddingInlineStart: 'var(--esp-6)' }}>
        {Array.from({ length: 40 }, (_, indice) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: as linhas do exemplo são fixas.
          <li key={indice} style={{ whiteSpace: 'nowrap' }}>
            Linha {indice + 1} da lista de exemplo, com texto bastante para passar da borda.
          </li>
        ))}
      </ol>
    </section>
  );
}

function Palco({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--esp-6)', padding: 'var(--esp-6)' }}>{children}</div>
  );
}

const areaDe = (canvas: HTMLElement, nome: string) =>
  within(canvas).getByRole('region', { name: nome });

/** O espaço que a barra da direita ocupa na área, em px. */
const espacoDaBarra = (area: HTMLElement) => area.offsetWidth - area.clientWidth - 2;

const corDoPolegar = (area: HTMLElement) =>
  getComputedStyle(area, '::-webkit-scrollbar-thumb').backgroundColor;

/**
 * Uma cor como o navegador a resolve no tema da história. Mexe no documento: fica fora do
 * `waitFor`, que repete a conferência a cada mudança do documento e entraria num laço sem fim.
 */
function corDe(valor: string) {
  const sonda = document.createElement('span');
  sonda.style.backgroundColor = valor;
  document.body.append(sonda);
  const cor = getComputedStyle(sonda).backgroundColor;
  sonda.remove();
  return cor;
}

const corDoToken = (token: string) => corDe(`var(${token})`);

/**
 * Com "Ao rolar", a de fábrica: a barra é fina e reserva o espaço dela, o polegar fica invisível
 * com o ponteiro fora da área e aparece, na cor do tema, com o ponteiro sobre ela. Nada muda de
 * lugar.
 */
export const PonteiroSobreAArea: Historia = {
  render: () => (
    <NaRaiz atributos={AO_ROLAR}>
      <Palco>
        <AreaQueRola nome="Lista de exemplo" />
      </Palco>
    </NaRaiz>
  ),
  play: async ({ canvasElement }) => {
    const transparente = corDe('transparent');
    const aVista = corDoToken('--cor-borda-controle');
    const area = areaDe(canvasElement, 'Lista de exemplo');
    // Fina, com o espaço reservado: a mesma largura com o polegar à vista ou não.
    await expect(espacoDaBarra(area)).toBe(LARGURA_DA_BARRA);
    await expect(area.offsetHeight - area.clientHeight - 2).toBe(LARGURA_DA_BARRA);
    await expect(corDoPolegar(area)).toBe(transparente);

    const navegador = navegadorDeTeste();
    if (!navegador) return;
    const larguraDoConteudo = area.clientWidth;
    await navegador.porPonteiroSobre('[data-area="Lista de exemplo"]');
    // O navegador responde pela cor do polegar com o ponteiro nele, mais forte, sempre que o
    // ponteiro está na área: aqui basta ele ter saído do transparente. A cor de cada caso fica com
    // a captura e com a conferência no app.
    await waitFor(() => expect(corDoPolegar(area)).not.toBe(transparente));
    await expect([aVista, corDoToken('--cor-texto-2')]).toContain(corDoPolegar(area));
    await expect(area.clientWidth).toBe(larguraDoConteudo);

    await navegador.tirarPonteiro();
    await waitFor(() => expect(corDoPolegar(area)).toBe(transparente));
    await expect(espacoDaBarra(area)).toBe(LARGURA_DA_BARRA);
  },
};

/** Com o foco do teclado na própria área, o polegar aparece, e some quando o foco sai dela. */
export const FocoNaArea: Historia = {
  render: () => (
    <NaRaiz atributos={AO_ROLAR}>
      <Palco>
        <AreaQueRola nome="Lista de exemplo" />
      </Palco>
    </NaRaiz>
  ),
  play: async ({ canvasElement }) => {
    const transparente = corDe('transparent');
    const aVista = corDoToken('--cor-borda-controle');
    const navegador = navegadorDeTeste();
    if (!navegador) return;
    const area = areaDe(canvasElement, 'Lista de exemplo');
    await navegador.apertarTecla('Tab');
    await waitFor(() => expect(document.activeElement).toBe(area));
    await waitFor(() => expect(corDoPolegar(area)).toBe(aVista));
    // O foco num item de dentro não segura o polegar: quase sempre há um na janela.
    await navegador.apertarTecla('Tab');
    await waitFor(() => expect(document.activeElement).not.toBe(area));
    await waitFor(() => expect(corDoPolegar(area)).toBe(transparente));
  },
};

/**
 * A rolagem pelo teclado, com o ponteiro fora da área e o foco num item de dentro: o polegar
 * aparece enquanto ela rola e some 1 s depois da última rolagem.
 */
export const RolagemPeloTeclado: Historia = {
  render: () => (
    <NaRaiz atributos={AO_ROLAR}>
      <Palco>
        <AreaQueRola nome="Lista de exemplo" />
      </Palco>
    </NaRaiz>
  ),
  play: async ({ canvasElement }) => {
    const transparente = corDe('transparent');
    const aVista = corDoToken('--cor-borda-controle');
    const navegador = navegadorDeTeste();
    if (!navegador) return;
    const area = areaDe(canvasElement, 'Lista de exemplo');
    within(area).getByRole('button', { name: 'Primeiro item' }).focus();
    await expect(corDoPolegar(area)).toBe(transparente);

    await navegador.apertarTecla('PageDown');
    await waitFor(() => expect(area.scrollTop).toBeGreaterThan(0));
    await waitFor(() => expect(area.hasAttribute('data-rolando')).toBe(true));
    await expect(corDoPolegar(area)).toBe(aVista);

    // Some 1 s depois da última rolagem, sem o ponteiro e sem o foco na área.
    await waitFor(() => expect(area.hasAttribute('data-rolando')).toBe(false), {
      timeout: TEMPO_DA_MARCA_DE_ROLAGEM + 2000,
    });
    await expect(corDoPolegar(area)).toBe(transparente);
  },
};

/** Com "Sempre visível", o polegar de toda área que rola fica à vista, sem ponteiro e sem foco. */
export const SempreVisivel: Historia = {
  tags: ['captura'],
  render: () => (
    <NaRaiz atributos={SEMPRE}>
      <Palco>
        <AreaQueRola nome="Lista de exemplo" />
        <AreaQueRola nome="Outra lista" />
      </Palco>
    </NaRaiz>
  ),
  play: async ({ canvasElement }) => {
    const aVista = corDoToken('--cor-borda-controle');
    for (const nome of ['Lista de exemplo', 'Outra lista']) {
      const area = areaDe(canvasElement, nome);
      await waitFor(() => expect(corDoPolegar(area)).toBe(aVista));
      await expect(espacoDaBarra(area)).toBe(LARGURA_DA_BARRA);
    }
  },
};

/**
 * Onde o sistema já sobrepõe a barra ao conteúdo, a raiz fica marcada, e nenhuma regra da barra
 * própria vale: a área rola com a barra do sistema.
 */
export const BarraDoSistema: Historia = {
  render: () => (
    <NaRaiz atributos={DO_SISTEMA}>
      <Palco>
        <AreaQueRola nome="Lista de exemplo" />
      </Palco>
    </NaRaiz>
  ),
  play: async ({ canvasElement }) => {
    const aVista = corDoToken('--cor-borda-controle');
    const area = areaDe(canvasElement, 'Lista de exemplo');
    await expect(getComputedStyle(area, '::-webkit-scrollbar').width).not.toBe(
      `${LARGURA_DA_BARRA}px`,
    );
    await expect(corDoPolegar(area)).not.toBe(aVista);
  },
};

/** A área que esconde a barra de propósito, como a barra das abas, continua sem ela. */
export const AreaSemBarraDeProposito: Historia = {
  render: () => (
    <NaRaiz atributos={SEMPRE}>
      <Palco>
        <AreaQueRola nome="Abas de exemplo" estilo={{ scrollbarWidth: 'none' }} />
      </Palco>
    </NaRaiz>
  ),
  play: async ({ canvasElement }) => {
    const area = areaDe(canvasElement, 'Abas de exemplo');
    await expect(area.scrollHeight).toBeGreaterThan(area.clientHeight);
    await expect(espacoDaBarra(area)).toBe(0);
  },
};
