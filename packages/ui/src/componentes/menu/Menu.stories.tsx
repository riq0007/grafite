import type { Meta, StoryObj } from '@storybook/react-vite';
import { BellOff, CornerUpLeft, LifeBuoy, Link, SmilePlus } from 'lucide-react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { iconesDeAtivo } from '../../icones/ativos.ts';
import { centro, criarPonteiro } from '../../teste/ponteiro.ts';
import { temas } from '../../tokens/temas.ts';
import { Botao } from '../botao/Botao.tsx';
import { ItemDeMenu, Menu, Separador, Submenu } from './Menu.tsx';

const meta: Meta = { title: 'Componentes/Menu' };
export default meta;

type Historia = StoryObj;

function MenuDeAtivos() {
  return (
    <Menu rotulo="Ativos" gatilho={<Botao>Ativos</Botao>}>
      <ItemDeMenu>Inventário</ItemDeMenu>
      <Submenu rotulo="Rede">
        <ItemDeMenu>Switches</ItemDeMenu>
        <ItemDeMenu>Roteadores</ItemDeMenu>
        <ItemDeMenu>Pontos de acesso</ItemDeMenu>
        <ItemDeMenu>Racks</ItemDeMenu>
      </Submenu>
      <ItemDeMenu>Relatórios</ItemDeMenu>
      <ItemDeMenu>Movimentações</ItemDeMenu>
      <Separador />
      <ItemDeMenu destrutivo>Dar baixa</ItemDeMenu>
    </Menu>
  );
}

const corpoDe = (elemento: HTMLElement) => within(elemento.ownerDocument.body);

/** Cenário da spec: seta para a direita abre o submenu no primeiro item; Esc volta à origem. */
export const SubmenuPeloTeclado: Historia = {
  render: () => <MenuDeAtivos />,
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    await corpo.findByRole('menu', { name: 'Ativos' });
    await waitFor(() => expect(corpo.getByRole('menuitem', { name: 'Inventário' })).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}');
    const rede = corpo.getByRole('menuitem', { name: 'Rede' });
    await expect(rede).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    await corpo.findByRole('menu', { name: 'Rede' });
    await waitFor(() => expect(corpo.getByRole('menuitem', { name: 'Switches' })).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpo.queryByRole('menu', { name: 'Rede' })).toBeNull());
    await expect(corpo.getByRole('menu', { name: 'Ativos' })).toBeVisible();
    await waitFor(() => expect(rede).toHaveFocus());
  },
};

/** Abre o menu com o mouse e o submenu de "Rede" parando o ponteiro sobre o item. */
async function abrirRedePeloMouse(canvasElement: HTMLElement) {
  const corpo = corpoDe(canvasElement);
  const ponteiro = criarPonteiro();
  await ponteiro.usuario.click(within(canvasElement).getByRole('button', { name: 'Ativos' }));
  await corpo.findByRole('menu', { name: 'Ativos' });
  const rede = corpo.getByRole('menuitem', { name: 'Rede' });
  const r = rede.getBoundingClientRect();
  const noFimDeRede = { x: r.right - 12, y: r.top + r.height / 2 };
  await ponteiro.mover({ x: r.left + 12, y: noFimDeRede.y }, noFimDeRede, { passos: 4 });
  await corpo.findByRole('menu', { name: 'Rede' }, { timeout: 1000 });
  return { corpo, ponteiro, noFimDeRede };
}

/**
 * Cenário da spec: do item "Rede" até o submenu, na diagonal, passando sobre o item seguinte;
 * o submenu fica aberto até o ponteiro chegar a ele.
 */
export const MovimentoDiagonal: Historia = {
  render: () => <MenuDeAtivos />,
  play: async ({ canvasElement }) => {
    const { corpo, ponteiro, noFimDeRede } = await abrirRedePeloMouse(canvasElement);
    const destino = centro(corpo.getByRole('menuitem', { name: 'Racks' }).getBoundingClientRect());
    let fechou = false;
    await ponteiro.mover(noFimDeRede, destino, {
      passos: 14,
      intervalo: 20,
      aCadaPasso: () => {
        if (!corpo.queryByRole('menu', { name: 'Rede' })) fechou = true;
      },
    });
    await expect(fechou).toBe(false);
    await waitFor(() => expect(corpo.getByRole('menuitem', { name: 'Racks' })).toHaveFocus());
  },
};

/**
 * Apêndice B: a tolerância decide em 150 ms. O ponteiro segue rumo ao submenu (a tolerância
 * engata: são 8 passos de 25 ms, e ela amostra a cada 50 ms) e para sobre o item vizinho sem
 * chegar ao submenu: o vizinho assume logo. A folga cobre a amostragem e o redisparo.
 */
export const ToleranciaDecideRapido: Historia = {
  render: () => <MenuDeAtivos />,
  play: async ({ canvasElement }) => {
    const { corpo, ponteiro, noFimDeRede } = await abrirRedePeloMouse(canvasElement);
    const relatorios = corpo.getByRole('menuitem', { name: 'Relatórios' });
    const r = relatorios.getBoundingClientRect();
    const sobreRelatorios = { x: r.right - 6, y: r.top + r.height / 2 };
    await ponteiro.mover(noFimDeRede, sobreRelatorios, { passos: 8, intervalo: 25 });
    await expect(corpo.queryByRole('menu', { name: 'Rede' })).not.toBeNull();
    await waitFor(() => expect(corpo.queryByRole('menu', { name: 'Rede' })).toBeNull(), {
      timeout: 450,
    });
    await expect(relatorios).toHaveFocus();
  },
};

/**
 * Controle dos testes acima: afastando-se do submenu (para a esquerda), não há tolerância, e o
 * item vizinho assume na hora. Prova que o fechamento seria percebido se a tolerância faltasse.
 */
export const AfastarDoSubmenuTrocaNaHora: Historia = {
  render: () => <MenuDeAtivos />,
  play: async ({ canvasElement }) => {
    const { corpo, ponteiro } = await abrirRedePeloMouse(canvasElement);
    const rede = corpo.getByRole('menuitem', { name: 'Rede' }).getBoundingClientRect();
    const r = corpo.getByRole('menuitem', { name: 'Relatórios' }).getBoundingClientRect();
    await ponteiro.mover(
      { x: rede.left + rede.width / 2, y: rede.top + rede.height / 2 },
      { x: r.left + 10, y: r.top + r.height / 2 },
      { passos: 8, intervalo: 25 },
    );
    await waitFor(() => expect(corpo.queryByRole('menu', { name: 'Rede' })).toBeNull(), {
      timeout: 300,
    });
  },
};

/** O painel em volta da lista de um menu. */
function painelDe(menu: HTMLElement) {
  const painel = menu.closest('[data-placement]');
  if (!(painel instanceof HTMLElement)) throw new Error('O menu está fora do painel.');
  return painel;
}

/**
 * Cenário da spec "Submenu na janela estreita": na postura celular, o submenu não cabe ao lado do
 * menu, de nenhum dos lados, e abre embaixo do item, por cima do menu, inteiro dentro da janela, com
 * o mesmo teclado. O menu fica junto da borda direita, como o da conta.
 */
export const SubmenuNaJanelaEstreita: Historia = {
  globals: { viewport: { value: 'celular390', isRotated: false } },
  render: () => (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <MenuDeAtivos />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    const menu = await corpo.findByRole('menu', { name: 'Ativos' });
    await waitFor(() => expect(corpo.getByRole('menuitem', { name: 'Inventário' })).toHaveFocus());
    // O submenu se posiciona pelo item medido ao abrir: com a escala da entrada do menu, o item
    // estaria um pouco acima de onde fica.
    await waitFor(() => expect(painelDe(menu)).not.toHaveAttribute('data-entering'), {
      timeout: 10_000,
    });
    await userEvent.keyboard('{ArrowDown}');
    const rede = corpo.getByRole('menuitem', { name: 'Rede' });
    await expect(rede).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    const submenu = await corpo.findByRole('menu', { name: 'Rede' });
    await waitFor(() => expect(corpo.getByRole('menuitem', { name: 'Switches' })).toHaveFocus());
    const painel = painelDe(submenu);
    await waitFor(() => expect(painel).not.toHaveAttribute('data-entering'), { timeout: 10_000 });
    const caixa = painel.getBoundingClientRect();
    const doMenu = painelDe(menu).getBoundingClientRect();
    // Embaixo do item, que fica à vista.
    await expect(caixa.top).toBeGreaterThanOrEqual(rede.getBoundingClientRect().bottom - 0.5);
    // Por cima do menu, nas bordas dele: o item de baixo fica coberto pelo submenu.
    await expect(caixa.left).toBeCloseTo(doMenu.left, 0);
    await expect(caixa.right).toBeCloseTo(doMenu.right, 0);
    const { x, y } = centro(
      corpo.getByRole('menuitem', { name: 'Relatórios' }).getBoundingClientRect(),
    );
    await expect(painel.contains(document.elementFromPoint(x, y))).toBe(true);
    // Inteiro dentro da janela, menos os 12 px de cada lado.
    await expect(caixa.left).toBeGreaterThanOrEqual(12 - 0.5);
    await expect(caixa.right).toBeLessThanOrEqual(window.innerWidth - 12 + 0.5);
    await expect(caixa.bottom).toBeLessThanOrEqual(window.innerHeight - 12 + 0.5);
    // O mesmo teclado: o Esc fecha só o submenu e volta ao item.
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpo.queryByRole('menu', { name: 'Rede' })).toBeNull());
    await expect(corpo.getByRole('menu', { name: 'Ativos' })).toBeVisible();
    await waitFor(() => expect(rede).toHaveFocus());
  },
};

/** O menu da conta na barra de baixo do celular: abre acima do botão, com o "Tema" no alto. */
function MenuDaConta() {
  return (
    <Menu rotulo="Conta" posicao="top end" gatilho={<Botao>Conta</Botao>}>
      <Submenu rotulo="Tema">
        {Object.entries(temas).map(([id, tema]) => (
          <ItemDeMenu key={id}>{tema.nome}</ItemDeMenu>
        ))}
        <ItemDeMenu>Personalizado</ItemDeMenu>
      </Submenu>
      <ItemDeMenu>Equipes e canais</ItemDeMenu>
      <Separador />
      <ItemDeMenu>Sair</ItemDeMenu>
    </Menu>
  );
}

/**
 * Cenário da spec "Submenu sem espaço embaixo do item": o menu da conta abre da barra de baixo, e
 * embaixo do "Tema" não cabem os temas. O submenu abre colado em cima do item, que fica à vista, nas
 * bordas do menu, inteiro dentro da janela e sem rolar.
 */
export const SubmenuSemEspacoEmbaixo: Historia = {
  globals: { viewport: { value: 'celular390', isRotated: false } },
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div
      style={{
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        height: '100vh',
        padding: 'var(--esp-4)',
      }}
    >
      <MenuDaConta />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    const menu = await corpo.findByRole('menu', { name: 'Conta' });
    const tema = corpo.getByRole('menuitem', { name: 'Tema' });
    await waitFor(() => expect(tema).toHaveFocus());
    await waitFor(() => expect(painelDe(menu)).not.toHaveAttribute('data-entering'), {
      timeout: 10_000,
    });
    await userEvent.keyboard('{ArrowRight}');
    const submenu = await corpo.findByRole('menu', { name: 'Tema' });
    const primeiro = within(submenu).getAllByRole('menuitem')[0];
    await waitFor(() => expect(primeiro).toHaveFocus());
    const painel = painelDe(submenu);
    await waitFor(() => expect(painel).not.toHaveAttribute('data-entering'), { timeout: 10_000 });
    const caixa = painel.getBoundingClientRect();
    const doItem = tema.getBoundingClientRect();
    const doMenu = painelDe(menu).getBoundingClientRect();
    // Colado em cima do item, que fica à vista.
    await expect(caixa.bottom).toBeCloseTo(doItem.top, 0);
    const { x, y } = centro(doItem);
    await expect(tema.contains(document.elementFromPoint(x, y))).toBe(true);
    // Nas bordas do menu.
    await expect(caixa.left).toBeCloseTo(doMenu.left, 0);
    await expect(caixa.right).toBeCloseTo(doMenu.right, 0);
    // Inteiro dentro da janela, menos os 12 px de cada lado, e sem rolar.
    await expect(caixa.top).toBeGreaterThanOrEqual(12 - 0.5);
    await expect(caixa.left).toBeGreaterThanOrEqual(12 - 0.5);
    await expect(caixa.right).toBeLessThanOrEqual(window.innerWidth - 12 + 0.5);
    await expect(painel.scrollHeight).toBeLessThanOrEqual(painel.clientHeight);
    // O mesmo teclado: o Esc fecha só o submenu e volta ao item.
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpo.queryByRole('menu', { name: 'Tema' })).toBeNull());
    await expect(corpo.getByRole('menu', { name: 'Conta' })).toBeVisible();
    await waitFor(() => expect(tema).toHaveFocus());
  },
};

/** O ícone antes do nome, como o de cada tipo em "Por tipo", decorativo para o leitor de tela. */
export const ItensComIcone: Historia = {
  render: () => (
    <Menu rotulo="Por tipo" gatilho={<Botao>Por tipo</Botao>}>
      <ItemDeMenu icone={iconesDeAtivo.impressora}>Impressora</ItemDeMenu>
      <ItemDeMenu icone={iconesDeAtivo.notebook}>Notebook</ItemDeMenu>
      <ItemDeMenu icone={iconesDeAtivo.switch}>Switch</ItemDeMenu>
    </Menu>
  ),
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Por tipo' }));
    const menu = await corpo.findByRole('menu', { name: 'Por tipo' });
    const itens = within(menu).getAllByRole('menuitem');
    await expect(itens.map((item) => item.textContent)).toEqual([
      'Impressora',
      'Notebook',
      'Switch',
    ]);
    for (const item of itens) {
      const icone = item.querySelector('svg');
      await expect(icone).not.toBeNull();
      await expect(icone).toHaveAttribute('aria-hidden', 'true');
      await expect(item).toHaveAccessibleName(item.textContent ?? '');
    }
    await userEvent.keyboard('{Escape}');
  },
};

/** O painel do menu: o popover em volta dele. */
const painelDo = (menu: HTMLElement) => {
  const painel = menu.closest<HTMLElement>('[data-trigger]');
  if (!painel) throw new Error('O menu está fora do painel.');
  return painel;
};

/**
 * O menu em camada opaca, como o da mensagem do chat: o Reagir com a dica e o submenu também opaco,
 * e "Transformar em chamado" no azul do chamado, com o atalho, que o leitor de tela ouve.
 */
export const OpacoComAtalho: Historia = {
  render: () => (
    <Menu rotulo="Ações da mensagem" gatilho={<Botao>Mais</Botao>} opaco nomePeloRotulo>
      <ItemDeMenu icone={CornerUpLeft}>Responder</ItemDeMenu>
      <Submenu rotulo="Reagir" icone={SmilePlus} dica="+1 · ok · visto">
        <ItemDeMenu>+1</ItemDeMenu>
        <ItemDeMenu>ok</ItemDeMenu>
        <ItemDeMenu>visto</ItemDeMenu>
      </Submenu>
      <ItemDeMenu icone={Link}>Copiar link da mensagem</ItemDeMenu>
      <Separador />
      <ItemDeMenu icone={LifeBuoy} informativo atalho={['ctrl', 'shift', 'T']}>
        Transformar em chamado
      </ItemDeMenu>
      <ItemDeMenu icone={BellOff}>Silenciar a conversa</ItemDeMenu>
    </Menu>
  ),
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Mais' }));
    const menu = await corpo.findByRole('menu', { name: 'Ações da mensagem' });
    await expect(getComputedStyle(painelDo(menu)).backdropFilter).toBe('none');
    const transformar = within(menu).getByRole('menuitem', { name: 'Transformar em chamado' });
    await expect(transformar).toHaveAttribute('data-informativo', 'true');
    await expect(transformar).toHaveAccessibleDescription(expect.stringContaining('Shift'));
    const reagir = within(menu).getByRole('menuitem', { name: 'Reagir' });
    await expect(reagir).toHaveTextContent('+1 · ok · visto');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await waitFor(() => expect(reagir).toHaveFocus());
    await userEvent.keyboard('{ArrowRight}');
    const submenu = await corpo.findByRole('menu', { name: 'Reagir' });
    await expect(getComputedStyle(painelDo(submenu)).backdropFilter).toBe('none');
    await userEvent.keyboard('{Escape}{Escape}');
  },
};

/**
 * O item informativo sem ação, como o da mensagem que já virou chamado: o motivo, na descrição,
 * segue legível, no azul do nome; a opacidade do desabilitado fica no ícone, no nome e no atalho.
 */
/** O motivo do item sem ação, com o número do chamado, que o verificador de cores leria como hex. */
const MOTIVO = `Já virou o #${1045}`;

export const InformativoSemAcaoDizOMotivo: Historia = {
  render: () => (
    <Menu rotulo="Ações da mensagem" gatilho={<Botao>Mais</Botao>} opaco nomePeloRotulo>
      <ItemDeMenu icone={CornerUpLeft}>Responder</ItemDeMenu>
      <ItemDeMenu
        icone={LifeBuoy}
        informativo
        atalho={['ctrl', 'shift', 'T']}
        isDisabled
        descricao={MOTIVO}
      >
        Transformar em chamado
      </ItemDeMenu>
    </Menu>
  ),
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Mais' }));
    const menu = await corpo.findByRole('menu', { name: 'Ações da mensagem' });
    const transformar = within(menu).getByRole('menuitem', { name: 'Transformar em chamado' });
    await expect(transformar).toHaveAttribute('aria-disabled', 'true');
    await expect(transformar).toHaveAccessibleDescription(expect.stringContaining(MOTIVO));
    const motivo = within(transformar).getByText(MOTIVO);
    await expect(getComputedStyle(transformar).opacity).toBe('1');
    await expect(getComputedStyle(motivo).color).toBe(getComputedStyle(transformar).color);
    const icone = transformar.querySelector('svg')?.parentElement;
    await expect(icone && Number(getComputedStyle(icone).opacity)).toBeLessThan(1);
    await userEvent.keyboard('{Escape}');
  },
};
