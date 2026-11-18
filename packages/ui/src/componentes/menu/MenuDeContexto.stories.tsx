// O menu de contexto (spec componentes-base, "Menu de contexto"): os itens com submenu e o texto de
// apoio, como o "Passar para…" do quadro dos chamados, junto da borda direita, onde o submenu abre
// para a esquerda. A história tem função de interação e fica fora das capturas: termina com o menu
// fechado, e o que ela confere é o teclado e o lado do submenu.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useRef, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
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
