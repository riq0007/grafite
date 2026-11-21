import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { BellOff, CornerUpLeft, LifeBuoy, Link } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Botao } from '../botao/Botao.tsx';
import { ItemDeMenu, MenuNaFolha } from '../menu/Menu.tsx';
import { Folha } from './Folha.tsx';

const meta: Meta = {
  title: 'Componentes/Folha de baixo',
  globals: { viewport: { value: 'celular390' } },
};
export default meta;

type Historia = StoryObj;

const corpoDe = (elemento: HTMLElement) => within(elemento.ownerDocument.body);

const comAtributo =
  (nome: string, valor: string): Decorator =>
  (Historia) => {
    document.documentElement.setAttribute(nome, valor);
    return <Historia />;
  };

/** A mensagem levantada e as reações, acima da folha, como no m09. */
function AcimaDaFolha() {
  return (
    <>
      <div style={{ display: 'flex', gap: 'var(--esp-1)' }}>
        {['+1', 'ok', 'visto'].map((reacao) => (
          <Botao key={reacao}>{reacao}</Botao>
        ))}
      </div>
      <p
        style={{
          margin: 0,
          padding: 'var(--esp-3)',
          borderRadius: 'var(--raio-menu)',
          backgroundColor: 'var(--cor-superficie-elevada)',
        }}
      >
        Paulo Nunes · 10:19 — Pessoal, a impressora do Financeiro está manchando todas as folhas.
      </p>
    </>
  );
}

/** O menu da mensagem do chat no celular: a folha abre pelo botão, no lugar do toque longo. */
function MenuDaMensagem({
  aoEscolher,
  aoSair,
}: {
  aoEscolher: (acao: string) => void;
  aoSair: () => void;
}) {
  const [aberta, definirAberta] = useState(false);
  return (
    <>
      <Botao onPress={() => definirAberta(true)}>Abrir a folha</Botao>
      <Folha
        aberta={aberta}
        aoMudarAberta={definirAberta}
        rotulo="Ações da mensagem de Paulo Nunes"
        acima={<AcimaDaFolha />}
        aoSair={aoSair}
      >
        {(fechar) => (
          <MenuNaFolha rotulo="Ações da mensagem">
            {[
              { id: 'responder', nome: 'Responder', icone: CornerUpLeft },
              { id: 'link', nome: 'Copiar link da mensagem', icone: Link },
              { id: 'transformar', nome: 'Transformar em chamado', icone: LifeBuoy },
              { id: 'silenciar', nome: 'Silenciar a conversa', icone: BellOff },
            ].map(({ id, nome, icone }) => (
              <ItemDeMenu
                key={id}
                id={id}
                icone={icone}
                informativo={id === 'transformar'}
                onAction={() => {
                  aoEscolher(id);
                  fechar();
                }}
              >
                {nome}
              </ItemDeMenu>
            ))}
          </MenuNaFolha>
        )}
      </Folha>
    </>
  );
}

const altura = (elemento: Element) => Math.round(elemento.getBoundingClientRect().height);

/**
 * A folha sobe da borda de baixo, na largura da tela, com a mensagem e as reações acima dela; os
 * itens têm 52 px, e "Transformar em chamado", 56. Escolher um item fecha a folha, e a saída avisa
 * depois de ela sair, com o foco de volta no botão que a abriu.
 */
export const MenuDaMensagemNoCelular: StoryObj<{
  aoEscolher: (acao: string) => void;
  aoSair: () => void;
}> = {
  args: { aoEscolher: fn(), aoSair: fn() },
  render: (args) => <MenuDaMensagem {...args} />,
  play: async ({ canvasElement, args }) => {
    const corpo = corpoDe(canvasElement);
    const abrir = within(canvasElement).getByRole('button', { name: 'Abrir a folha' });
    await userEvent.click(abrir);
    const folha = await corpo.findByRole('dialog', { name: 'Ações da mensagem de Paulo Nunes' });
    const menu = within(folha).getByRole('menu', { name: 'Ações da mensagem' });
    const painel = menu.closest('[class*="painel"]') as HTMLElement;
    await waitFor(() => {
      const caixa = painel.getBoundingClientRect();
      expect(Math.round(caixa.bottom)).toBe(document.documentElement.clientHeight);
      expect(Math.round(caixa.width)).toBe(document.documentElement.clientWidth);
    });
    await expect(within(folha).getByText(/a impressora do Financeiro/)).toBeVisible();
    await expect(altura(within(folha).getByRole('menuitem', { name: 'Responder' }))).toBe(52);
    await expect(
      altura(within(folha).getByRole('menuitem', { name: 'Transformar em chamado' })),
    ).toBe(56);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);

    await userEvent.click(within(folha).getByRole('menuitem', { name: 'Responder' }));
    await expect(args.aoEscolher).toHaveBeenCalledWith('responder');
    // A saída avisa depois de a folha sair, e não ao abrir.
    await expect(args.aoSair).not.toHaveBeenCalled();
    await waitFor(() => expect(corpo.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(args.aoSair).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(abrir).toHaveFocus());
  },
};

/** "Neste chamado" no celular: o título à vista, com "Fechar"; o Esc e o toque fora fecham. */
function NesteChamado({ children }: { children?: ReactNode }) {
  const [aberta, definirAberta] = useState(false);
  return (
    <>
      <Botao onPress={() => definirAberta(true)}>Neste chamado</Botao>
      <Folha aberta={aberta} aoMudarAberta={definirAberta} titulo="Neste chamado">
        {children ?? <p style={{ margin: 0 }}>Ana Souza atende o chamado desde ontem, 17:22.</p>}
      </Folha>
    </>
  );
}

export const ComTitulo: Historia = {
  render: () => <NesteChamado />,
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    const abrir = within(canvasElement).getByRole('button', { name: 'Neste chamado' });
    await userEvent.click(abrir);
    const folha = await corpo.findByRole('dialog', { name: 'Neste chamado' });
    // A entrada começa transparente: sem um quadro desenhado, o véu ainda está invisível.
    await waitFor(() => expect(within(folha).getByText(/Ana Souza atende/)).toBeVisible());
    const fechar = within(folha).getByRole('button', { name: 'Fechar' });
    await expect(altura(fechar)).toBe(44);
    await userEvent.click(fechar);
    await waitFor(() => expect(corpo.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(abrir).toHaveFocus());

    await userEvent.click(abrir);
    await corpo.findByRole('dialog', { name: 'Neste chamado' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpo.queryByRole('dialog')).toBeNull());

    // O toque no véu, acima da folha, fecha.
    await userEvent.click(abrir);
    const deNovo = await corpo.findByRole('dialog', { name: 'Neste chamado' });
    const veu = deNovo.parentElement?.parentElement as HTMLElement;
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: veu, coords: { clientX: 20, clientY: 20 } },
      { keys: '[/MouseLeft]', target: veu, coords: { clientX: 20, clientY: 20 } },
    ]);
    await waitFor(() => expect(corpo.queryByRole('dialog')).toBeNull());
  },
};

/** Com "reduzir movimento", a folha já aparece no lugar, sem subir. */
export const MovimentoReduzido: Historia = {
  decorators: [comAtributo('data-motion', 'reduzido')],
  render: () => <NesteChamado />,
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    const raiz = document.documentElement;
    await expect(getComputedStyle(raiz).getPropertyValue('--dur-folha').trim()).toBe('0ms');
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Neste chamado' }));
    const folha = await corpo.findByRole('dialog', { name: 'Neste chamado' });
    const camada = folha.parentElement as HTMLElement;
    await expect(Math.round(camada.getBoundingClientRect().bottom)).toBe(raiz.clientHeight);
    raiz.removeAttribute('data-motion');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpo.queryByRole('dialog')).toBeNull());
  },
};
