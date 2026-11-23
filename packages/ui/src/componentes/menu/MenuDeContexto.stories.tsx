// O menu de contexto (spec componentes-base, "Menu de contexto"): os itens com submenu e o texto de
// apoio, como o "Passar para…" do quadro dos chamados, junto da borda direita, onde o submenu abre
// para a esquerda; e os itens do menu com submenu, em camada opaca, como o da mensagem do chat. As
// histórias têm função de interação e ficam fora das capturas: terminam com o menu fechado, e o que
// elas conferem é o teclado, o lado do submenu, o fechar do menu inteiro e a volta do foco.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { BellOff, CornerUpLeft, LifeBuoy, Link, SmilePlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test';
import { ItemDeMenu, SecaoDeMenu, Separador, Submenu } from './Menu.tsx';
import { type ItemDoMenuDeContexto, MenuDeContexto } from './MenuDeContexto.tsx';

interface Espioes {
  aoEscolher?: (acao: string) => void;
}

const meta: Meta<Espioes> = {
  title: 'Componentes/Menu de contexto',
  args: { aoEscolher: fn() },
};
export default meta;

type Historia = StoryObj<Espioes>;

/** O número do chamado, montado no texto: "#1033" escrito direto parece uma cor ao verificador. */
const NUMERO = 1033;
const CHAMADO = `#${NUMERO} Switch Rack 2`;
const ACOES = `Ações do #${NUMERO}`;

/**
 * Um chamado junto da borda direita, como o quadrado da última coluna do quadro: a tecla de menu e
 * Shift+F10 abrem o menu junto dele, e o botão direito, no ponto do clique.
 */
function ChamadoComMenu({ aoEscolher }: Espioes) {
  const alvo = useRef<HTMLButtonElement>(null);
  const [posicao, definirPosicao] = useState<{ x: number; y: number } | null>(null);
  const escolher = (acao: string) => () => aoEscolher?.(acao);
  const itens: ItemDoMenuDeContexto[] = [
    { id: 'assumir', rotulo: 'Assumir', aoEscolher: escolher('assumir') },
    {
      id: 'passar',
      rotulo: 'Passar para…',
      itens: [
        { id: 'ana', rotulo: 'Ana Souza', descricao: '2 abertos', aoEscolher: escolher('ana') },
        {
          id: 'bruno',
          rotulo: 'Bruno Lima',
          descricao: '2 abertos',
          aoEscolher: escolher('bruno'),
        },
        {
          id: 'diego',
          rotulo: 'Diego Martins',
          descricao: '3 abertos',
          aoEscolher: escolher('diego'),
        },
      ],
    },
    { id: 'devolver', rotulo: 'Devolver à triagem', aoEscolher: escolher('devolver') },
  ];
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <button
        ref={alvo}
        type="button"
        style={{
          padding: 'var(--esp-2) var(--esp-3)',
          border: '1px solid var(--cor-linha-forte)',
          borderRadius: 'var(--raio-controle)',
          background: 'var(--cor-superficie)',
          color: 'var(--cor-texto)',
          font: 'inherit',
        }}
        onKeyDown={(evento) => {
          if (evento.key !== 'ContextMenu' && !(evento.shiftKey && evento.key === 'F10')) return;
          evento.preventDefault();
          const caixa = evento.currentTarget.getBoundingClientRect();
          definirPosicao({ x: caixa.left + 16, y: caixa.bottom });
        }}
        onContextMenu={(evento) => {
          evento.preventDefault();
          definirPosicao({ x: evento.clientX, y: evento.clientY });
        }}
      >
        {CHAMADO}
      </button>
      <MenuDeContexto
        rotulo={ACOES}
        posicao={posicao}
        itens={itens}
        aoFechar={() => definirPosicao(null)}
        origem={alvo.current}
      />
    </div>
  );
}

/**
 * Pelo teclado: Shift+F10 abre o menu no primeiro item, a seta para a direita abre "Passar para…"
 * para a esquerda, com o texto de apoio de cada pessoa, e o Enter escolhe, fecha e devolve o foco.
 */
export const SubmenuNaBorda: Historia = {
  render: (args) => <ChamadoComMenu {...args} />,
  play: async ({ args, canvasElement }) => {
    const corpo = within(canvasElement.ownerDocument.body);
    const chamado = within(canvasElement).getByRole('button', { name: CHAMADO });
    await userEvent.tab();
    await expect(chamado).toHaveFocus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    const menu = await corpo.findByRole('menu', { name: ACOES });
    await waitFor(() => expect(corpo.getByRole('menuitem', { name: 'Assumir' })).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}');
    await expect(corpo.getByRole('menuitem', { name: 'Passar para…' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    const submenu = await corpo.findByRole('menu', { name: 'Passar para…' });
    await waitFor(() =>
      expect(within(submenu).getByRole('menuitem', { name: /^Ana Souza/ })).toHaveFocus(),
    );
    await expect(
      within(submenu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Ana Souza2 abertos', 'Bruno Lima2 abertos', 'Diego Martins3 abertos']);
    // Sem lugar à direita do menu, o submenu abre à esquerda dele.
    await expect(submenu.getBoundingClientRect().left).toBeLessThan(
      menu.getBoundingClientRect().left,
    );
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(args.aoEscolher).toHaveBeenCalledTimes(1);
    await expect(args.aoEscolher).toHaveBeenCalledWith('bruno');
    await waitFor(() => expect(corpo.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(chamado).toHaveFocus());
  },
};

/**
 * Cenário da spec "Toque no item com o submenu aberto", no menu de contexto dos itens, como o do
 * quadro: a 390 px, o "Passar para…" abre embaixo do item e cobre o "Devolver à triagem", e o toque
 * no item o fecha, com o menu aberto e o "Devolver à triagem" à vista de novo (pontos da revisão da
 * tarefa 4.17c).
 */
export const SubmenuFechadoPeloToque: Historia = {
  render: (args) => <ChamadoComMenu {...args} />,
  globals: { viewport: { value: 'celular390', isRotated: false } },
  play: async ({ canvasElement }) => {
    const corpo = within(canvasElement.ownerDocument.body);
    const chamado = within(canvasElement).getByRole('button', { name: CHAMADO });
    const caixa = chamado.getBoundingClientRect();
    fireEvent.contextMenu(chamado, { clientX: caixa.left + 8, clientY: caixa.bottom - 4 });
    const menu = await corpo.findByRole('menu', { name: ACOES });
    const doMenu = menu.closest('[data-placement]');
    await waitFor(() => expect(doMenu).not.toHaveAttribute('data-entering'), { timeout: 10_000 });
    const passar = corpo.getByRole('menuitem', { name: 'Passar para…' });
    const devolver = corpo.getByRole('menuitem', { name: 'Devolver à triagem' });
    const devolverAVista = () => {
      const r = devolver.getBoundingClientRect();
      return devolver.contains(
        document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2),
      );
    };
    const tocar = (alvo: Element) => userEvent.pointer({ keys: '[TouchA]', target: alvo });
    await tocar(passar);
    const submenu = await corpo.findByRole('menu', { name: 'Passar para…' });
    await waitFor(
      () => expect(submenu.closest('[data-placement]')).not.toHaveAttribute('data-entering'),
      {
        timeout: 10_000,
      },
    );
    await expect(devolverAVista(), 'o submenu cobre o "Devolver à triagem"').toBe(false);
    await tocar(within(passar).getByText('Passar para…'));
    await waitFor(() =>
      expect(
        corpo.queryByRole('menu', { name: 'Passar para…' }),
        'o toque fecha o submenu',
      ).toBeNull(),
    );
    await expect(menu).toBeVisible();
    await expect(devolverAVista()).toBe(true);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpo.queryByRole('menu')).toBeNull());
  },
};

const MENSAGEM = 'Mensagem de Paulo Nunes';
const DA_MENSAGEM = 'Ações da mensagem de Paulo Nunes';

/**
 * Uma mensagem com o menu do "Mais" no botão direito e na tecla de menu, como no chat (change
 * chat-com-chamados, decisão 15): os itens do menu com submenu, em camada opaca, sem o menu do
 * navegador por cima. O foco volta à mensagem sem rolar, e só depois a ação que leva o foco a outro
 * lugar age.
 */
function MensagemComMenu({ aoEscolher }: Espioes) {
  const alvo = useRef<HTMLElement>(null);
  const [posicao, definirPosicao] = useState<{ x: number; y: number } | null>(null);
  const [minhas, definirMinhas] = useState<string[]>(['+1']);
  const depois = useRef<string | null>(null);
  return (
    <>
      <article
        ref={alvo}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a mensagem recebe o foco, como no chat.
        tabIndex={0}
        aria-label={MENSAGEM}
        style={{
          padding: 'var(--esp-3)',
          border: '1px solid var(--cor-linha)',
          borderRadius: 'var(--raio-controle)',
          background: 'var(--cor-superficie)',
          color: 'var(--cor-texto)',
        }}
        onKeyDown={(evento) => {
          if (evento.key !== 'ContextMenu' && !(evento.shiftKey && evento.key === 'F10')) return;
          evento.preventDefault();
          const caixa = evento.currentTarget.getBoundingClientRect();
          definirPosicao({ x: caixa.left + 16, y: caixa.bottom });
        }}
        onContextMenu={(evento) => {
          evento.preventDefault();
          definirPosicao({ x: evento.clientX, y: evento.clientY });
        }}
      >
        A impressora do Financeiro está manchando todas as folhas.
      </article>
      <MenuDeContexto
        rotulo={DA_MENSAGEM}
        posicao={posicao}
        aoFechar={() => definirPosicao(null)}
        origem={alvo.current}
        opaco
        semRolar
        aoVoltarOFoco={() => {
          const acao = depois.current;
          depois.current = null;
          if (acao) {
            aoEscolher?.(
              `${acao} com o foco ${document.activeElement === alvo.current ? 'na mensagem' : 'fora'}`,
            );
          }
        }}
      >
        <ItemDeMenu
          icone={CornerUpLeft}
          onAction={() => {
            depois.current = 'responder';
          }}
        >
          Responder
        </ItemDeMenu>
        <Submenu rotulo="Reagir" icone={SmilePlus} dica="+1 · ok · visto">
          <SecaoDeMenu
            aria-label="Reações de sempre"
            selectionMode="multiple"
            shouldCloseOnSelect
            selectedKeys={minhas}
            onSelectionChange={(chaves) => {
              if (chaves === 'all') return;
              const novas = [...chaves].map(String);
              definirMinhas(novas);
              aoEscolher?.(`reações: ${novas.join(', ')}`);
            }}
          >
            <ItemDeMenu id="+1">+1</ItemDeMenu>
            <ItemDeMenu id="ok">ok</ItemDeMenu>
            <ItemDeMenu id="visto">visto</ItemDeMenu>
          </SecaoDeMenu>
        </Submenu>
        <ItemDeMenu icone={Link}>Copiar link da mensagem</ItemDeMenu>
        <Separador />
        <ItemDeMenu icone={LifeBuoy} informativo atalho={['ctrl', 'shift', 'T']}>
          Transformar em chamado
        </ItemDeMenu>
        <ItemDeMenu icone={BellOff}>Silenciar a conversa</ItemDeMenu>
      </MenuDeContexto>
    </>
  );
}

/**
 * Com os itens do menu: Shift+F10 abre o menu opaco no primeiro item; a reação marcada no submenu
 * fecha o menu inteiro, com o foco de volta na mensagem; e o "Responder" age depois de o foco voltar.
 */
export const ComOsItensDoMenu: Historia = {
  render: (args) => <MensagemComMenu {...args} />,
  play: async ({ args, canvasElement }) => {
    const corpo = within(canvasElement.ownerDocument.body);
    const mensagem = within(canvasElement).getByRole('article', { name: MENSAGEM });
    await userEvent.tab();
    await expect(mensagem).toHaveFocus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    const menu = await corpo.findByRole('menu', { name: DA_MENSAGEM });
    const painel = menu.closest<HTMLElement>('[data-placement]');
    if (!painel) throw new Error('O menu está fora do painel.');
    await expect(getComputedStyle(painel).backdropFilter).toBe('none');
    await waitFor(() => expect(corpo.getByRole('menuitem', { name: 'Responder' })).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}{ArrowRight}');
    const submenu = await corpo.findByRole('menu', { name: 'Reagir' });
    const ok = within(submenu).getByRole('menuitemcheckbox', { name: 'ok' });
    await waitFor(() =>
      expect(within(submenu).getByRole('menuitemcheckbox', { name: '+1' })).toHaveFocus(),
    );
    await expect(within(submenu).getByRole('menuitemcheckbox', { name: '+1' })).toBeChecked();
    await userEvent.keyboard('{ArrowDown}');
    await expect(ok).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.aoEscolher).toHaveBeenCalledWith('reações: +1, ok');
    await waitFor(() => expect(corpo.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(mensagem).toHaveFocus());

    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    await waitFor(() => expect(corpo.getByRole('menuitem', { name: 'Responder' })).toHaveFocus());
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(args.aoEscolher).toHaveBeenLastCalledWith('responder com o foco na mensagem'),
    );
    // A ação age com o menu ainda saindo, na animação de saída do painel.
    await waitFor(() => expect(corpo.queryByRole('menu')).toBeNull());
  },
};

/**
 * Cenário da spec "Menu junto da borda da janela estreita": o botão direito junto da borda direita
 * abre o menu na largura do conteúdo, inteiro dentro da janela, menos os 12 px de cada lado, sem
 * quebrar os nomes nem mudar de largura depois de aberto. Estreitado pelo espaço até a borda, o
 * texto quebrava, a altura mudava, e o ResizeObserver do React Aria o reposicionava, num laço.
 */
export const JuntoDaBorda: Historia = {
  render: (args) => <MensagemComMenu {...args} />,
  globals: { viewport: { value: 'celular390', isRotated: false } },
  play: async ({ canvasElement }) => {
    const avisos: string[] = [];
    const anotar = (evento: ErrorEvent) => avisos.push(evento.message);
    window.addEventListener('error', anotar);
    try {
      const corpo = within(canvasElement.ownerDocument.body);
      const mensagem = within(canvasElement).getByRole('article', { name: MENSAGEM });
      fireEvent.contextMenu(mensagem, {
        clientX: window.innerWidth - 24,
        clientY: mensagem.getBoundingClientRect().top + 8,
      });
      const painel = await painelAberto(corpo);
      const aberto = caixaDoPainel(painel);
      for (const item of within(painel).getAllByRole('menuitem')) {
        // O nome que quebra faz o item passar da altura de uma linha.
        await expect(item.offsetHeight).toBeLessThanOrEqual(
          Number.parseFloat(getComputedStyle(item).minHeight) + 0.5,
        );
      }
      await expect(aberto.esquerda).toBeGreaterThanOrEqual(12 - 0.5);
      await expect(aberto.direita).toBeLessThanOrEqual(window.innerWidth - 12 + 0.5);
      // A janela em que o laço apareceria.
      await new Promise((pronto) => setTimeout(pronto, 300));
      await expect(caixaDoPainel(painel)).toEqual(aberto);
      await expect(avisos.filter((aviso) => /ResizeObserver/.test(aviso))).toEqual([]);
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(corpo.queryByRole('menu')).toBeNull());
    } finally {
      window.removeEventListener('error', anotar);
    }
  },
};

/**
 * O painel do menu da mensagem, depois da entrada: a escala dela muda a caixa medida, e o executor
 * carregado a atrasa, então a espera é pelo fim dela, e não por um tempo.
 */
async function painelAberto(corpo: ReturnType<typeof within>) {
  const menu: HTMLElement = await corpo.findByRole('menu', { name: DA_MENSAGEM });
  const painel = menu.closest('[data-placement]');
  if (!(painel instanceof HTMLElement)) throw new Error('O menu está fora do painel.');
  await waitFor(() => expect(painel).not.toHaveAttribute('data-entering'), { timeout: 10_000 });
  return painel;
}

/** A caixa do painel: a largura e a altura sem a escala, e as bordas na janela. */
function caixaDoPainel(painel: HTMLElement) {
  const { left, right } = painel.getBoundingClientRect();
  return {
    esquerda: left,
    direita: right,
    largura: painel.offsetWidth,
    altura: painel.offsetHeight,
  };
}

const ITEM_LONGO = 'Avisar a equipe do Financeiro e a da Manutenção predial no canal do chamado';

/** A mensagem com um item de nome mais largo que a janela estreita, como um nome de equipe longo. */
function MensagemComItemLongo() {
  const [posicao, definirPosicao] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <article
        aria-label={MENSAGEM}
        style={{ padding: 'var(--esp-3)', color: 'var(--cor-texto)' }}
        onContextMenu={(evento) => {
          evento.preventDefault();
          definirPosicao({ x: evento.clientX, y: evento.clientY });
        }}
      >
        A impressora do Financeiro está manchando todas as folhas.
      </article>
      <MenuDeContexto
        rotulo={DA_MENSAGEM}
        posicao={posicao}
        aoFechar={() => definirPosicao(null)}
        opaco
      >
        <ItemDeMenu icone={CornerUpLeft}>Responder</ItemDeMenu>
        <ItemDeMenu icone={LifeBuoy}>{ITEM_LONGO}</ItemDeMenu>
      </MenuDeContexto>
    </>
  );
}

/**
 * O teto da largura: o item mais largo que a janela deixa o painel na janela menos os 12 px de cada
 * lado, e o nome dele quebra a linha, sem cortar nem sair do painel, e sem o laço.
 */
export const NoTetoDaJanela: Historia = {
  render: () => <MensagemComItemLongo />,
  globals: { viewport: { value: 'celular390', isRotated: false } },
  play: async ({ canvasElement }) => {
    const avisos: string[] = [];
    const anotar = (evento: ErrorEvent) => avisos.push(evento.message);
    window.addEventListener('error', anotar);
    try {
      const corpo = within(canvasElement.ownerDocument.body);
      const mensagem = within(canvasElement).getByRole('article', { name: MENSAGEM });
      fireEvent.contextMenu(mensagem, {
        clientX: window.innerWidth - 24,
        clientY: mensagem.getBoundingClientRect().top + 8,
      });
      const painel = await painelAberto(corpo);
      const aberto = caixaDoPainel(painel);
      await expect(aberto.largura).toBeCloseTo(window.innerWidth - 24, 0);
      await expect(aberto.esquerda).toBeGreaterThanOrEqual(12 - 0.5);
      await expect(aberto.direita).toBeLessThanOrEqual(window.innerWidth - 12 + 0.5);
      const longo = within(painel).getByRole('menuitem', { name: ITEM_LONGO });
      await expect(longo.offsetHeight).toBeGreaterThan(
        Number.parseFloat(getComputedStyle(longo).minHeight) + 0.5,
      );
      await expect(longo.scrollWidth).toBeLessThanOrEqual(longo.clientWidth);
      await new Promise((pronto) => setTimeout(pronto, 300));
      await expect(caixaDoPainel(painel)).toEqual(aberto);
      await expect(avisos.filter((aviso) => /ResizeObserver/.test(aviso))).toEqual([]);
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(corpo.queryByRole('menu')).toBeNull());
    } finally {
      window.removeEventListener('error', anotar);
    }
  },
};
