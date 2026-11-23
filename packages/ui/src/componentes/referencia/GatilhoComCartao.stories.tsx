import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { tempos } from '../../tokens/tempos.ts';
import { Botao } from '../botao/Botao.tsx';
import { GatilhoComCartao } from './GatilhoComCartao.tsx';

const meta: Meta = { title: 'Componentes/Botão com cartão' };
export default meta;

type Historia = StoryObj;

const corpoDe = (elemento: HTMLElement) => within(elemento.ownerDocument.body);
const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/**
 * O ponteiro no meio do elemento, com a posição: o cartão segue aberto enquanto o ponteiro está no
 * botão, no cartão ou entre os dois, e é a posição que diz onde ele está.
 */
const ponteiroSobre = async (elemento: Element) => {
  const caixa = elemento.getBoundingClientRect();
  await userEvent.pointer({
    target: elemento,
    coords: { clientX: caixa.left + caixa.width / 2, clientY: caixa.top + caixa.height / 2 },
  });
};

/** O chamado citado numa mensagem, como no chat: o botão no meio do texto e o resumo no cartão. */
const MensagemComChamado = () => (
  <div style={{ maxWidth: 'calc(var(--esp-12) * 10)' }}>
    <p>Paulo Nunes · 10:58</p>
    <p>
      Boa notícia: a impressora já está no{' '}
      <GatilhoComCartao
        titulo="Resumo do chamado 1045"
        cartao={() => (
          <div style={{ display: 'grid', gap: 'var(--esp-3)', padding: 'var(--esp-4)' }}>
            <strong>Impressora manchando</strong>
            <span>Bruno Lima atende</span>
            <div style={{ display: 'flex', gap: 'var(--esp-2)' }}>
              <Botao nivel="primario">Abrir chamado</Botao>
              <Botao>Copiar link</Botao>
            </div>
          </div>
        )}
      >
        #1045 · Em andamento · Bruno Lima
      </GatilhoComCartao>
      . Ele passa aqui antes do fechamento. <a href="#depois">Ver as fotos</a>
    </p>
  </div>
);

/** O ponteiro parado 500 ms sobre o botão abre o cartão, sem tirar o foco; fora dos dois, fecha. */
export const PeloPonteiro: Historia = {
  render: () => <MensagemComChamado />,
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    const botao = within(canvasElement).getByRole('button', { name: /#1045/ });
    // O ponteiro chega de fora, como na tela: o React Aria só conta o passar por cima depois de ele
    // se mover.
    await ponteiroSobre(within(canvasElement).getByText(/Boa notícia/));
    await ponteiroSobre(botao);
    await esperar(tempos.cartao.abrir / 2);
    await expect(corpo.queryByRole('dialog')).toBeNull();

    const cartao = await corpo.findByRole('dialog', { name: 'Resumo do chamado 1045' });
    await waitFor(() => expect(within(cartao).getByText('Impressora manchando')).toBeVisible());
    await expect(botao).toHaveAttribute('aria-expanded', 'true');
    await expect(cartao).not.toContainElement(cartao.ownerDocument.activeElement as HTMLElement);

    // Do botão ao cartão, ele continua aberto; fora dos dois, fecha.
    await ponteiroSobre(cartao);
    await esperar(tempos.cartao.fechar + 200);
    await expect(corpo.getByRole('dialog')).toBeVisible();
    // Acima do botão, fora dos dois.
    await ponteiroSobre(within(canvasElement).getByText('Paulo Nunes · 10:58'));
    await waitFor(() => expect(corpo.queryByRole('dialog')).toBeNull());
  },
};

/**
 * O foco do teclado parado no botão abre o cartão, com o foco no botão; o Tab entra no cartão e,
 * depois dele, vai ao que vem depois do botão. O Esc fecha, com o foco de volta no botão.
 */
export const PeloFoco: Historia = {
  render: () => <MensagemComChamado />,
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    const botao = within(canvasElement).getByRole('button', { name: /#1045/ });
    await userEvent.tab();
    await expect(botao).toHaveFocus();
    const cartao = await corpo.findByRole('dialog', { name: 'Resumo do chamado 1045' });
    await expect(botao).toHaveFocus();

    await userEvent.tab();
    await expect(within(cartao).getByRole('button', { name: 'Abrir chamado' })).toHaveFocus();
    await userEvent.tab();
    await expect(within(cartao).getByRole('button', { name: 'Copiar link' })).toHaveFocus();
    await userEvent.tab();
    await expect(within(canvasElement).getByRole('link', { name: 'Ver as fotos' })).toHaveFocus();
    await waitFor(() => expect(corpo.queryByRole('dialog')).toBeNull());

    await userEvent.tab({ shift: true });
    await expect(botao).toHaveFocus();
    const deNovo = await corpo.findByRole('dialog', { name: 'Resumo do chamado 1045' });
    await userEvent.tab();
    await expect(within(deNovo).getByRole('button', { name: 'Abrir chamado' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpo.queryByRole('dialog')).toBeNull());
    // O foco volta ao botão quando o cartão sai, no quadro seguinte.
    await waitFor(() => expect(botao).toHaveFocus());
    // O foco que volta não abre o cartão de novo.
    await esperar(tempos.cartao.abrir + 200);
    await expect(corpo.queryByRole('dialog')).toBeNull();
  },
};

/** Escolher o botão pelo teclado abre o cartão na hora, com o foco nele; o clique o abre também. */
export const AoEscolher: Historia = {
  render: () => <MensagemComChamado />,
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    const botao = within(canvasElement).getByRole('button', { name: /#1045/ });
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    const cartao = await corpo.findByRole('dialog', { name: 'Resumo do chamado 1045' });
    await waitFor(() => expect(cartao).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    // O Esc fecha na hora, sem a espera do ponteiro que sai.
    await waitFor(() => expect(botao).toHaveAttribute('aria-expanded', 'false'), {
      timeout: tempos.cartao.fechar / 2,
    });
    await waitFor(() => expect(corpo.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(botao).toHaveFocus());

    await ponteiroSobre(botao);
    await userEvent.click(botao);
    const peloClique = await corpo.findByRole('dialog', { name: 'Resumo do chamado 1045' });
    await waitFor(() => expect(peloClique).toBeVisible());
    // O clique fora fecha.
    await userEvent.click(within(canvasElement).getByText(/Boa notícia/));
    await waitFor(() => expect(corpo.queryByRole('dialog')).toBeNull());
  },
};

/**
 * O leitor de tela escolhe o botão sem levar o foco a ele: o cartão abre com o foco nele e, com o
 * Esc, o foco volta ao botão, e não ao começo da página.
 */
export const PeloLeitorDeTela: Historia = {
  render: () => <MensagemComChamado />,
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    const botao = within(canvasElement).getByRole('button', { name: /#1045/ });
    await expect(botao).not.toHaveFocus();
    botao.click();
    const cartao = await corpo.findByRole('dialog', { name: 'Resumo do chamado 1045' });
    await waitFor(() => expect(cartao).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpo.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(botao).toHaveFocus());
  },
};

/** Os chamados numa lista, como em "Chamados da equipe": cada linha é o botão do cartão. */
const ListaDeChamados = () => (
  <ul style={{ display: 'grid', gap: 'var(--esp-1)', margin: 0, padding: 0, listStyle: 'none' }}>
    {[
      { numero: 1045, titulo: 'Impressora manchando' },
      { numero: 1046, titulo: 'Teclado com teclas falhando' },
    ].map(({ numero, titulo }) => (
      <li key={numero}>
        <GatilhoComCartao
          soAoEscolher
          titulo={`Resumo do chamado ${numero}`}
          cartao={() => (
            <div style={{ display: 'grid', gap: 'var(--esp-3)', padding: 'var(--esp-4)' }}>
              <strong>{titulo}</strong>
              <Botao nivel="primario">Abrir chamado</Botao>
            </div>
          )}
        >
          {`#${numero} · ${titulo}`}
        </GatilhoComCartao>
      </li>
    ))}
  </ul>
);

/**
 * Numa lista, o cartão abre só ao escolher a linha: o ponteiro e o foco parados não o abrem, para
 * ele não cobrir as linhas de baixo. O clique, o Enter e a seta para baixo o abrem, com o foco nele,
 * e o Esc e o clique fora o fecham.
 */
export const SoAoEscolher: Historia = {
  render: () => <ListaDeChamados />,
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    const [primeira, segunda] = within(canvasElement).getAllByRole('button');
    if (!primeira || !segunda) throw new Error('A lista não tem as duas linhas.');
    // O ponteiro chega de fora, como em PeloPonteiro.
    await userEvent.pointer({
      target: canvasElement.ownerDocument.body,
      coords: { clientX: 1, clientY: 1 },
    });
    await ponteiroSobre(primeira);
    await esperar(tempos.cartao.abrir + 200);
    await expect(corpo.queryByRole('dialog')).toBeNull();
    await userEvent.tab();
    await expect(primeira).toHaveFocus();
    await esperar(tempos.cartao.abrir + 200);
    await expect(corpo.queryByRole('dialog')).toBeNull();

    await userEvent.keyboard('{Enter}');
    const cartao = await corpo.findByRole('dialog', { name: 'Resumo do chamado 1045' });
    await waitFor(() => expect(cartao).toHaveFocus());
    await expect(primeira).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpo.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(primeira).toHaveFocus());

    await userEvent.keyboard('{ArrowDown}');
    const pelaSeta = await corpo.findByRole('dialog', { name: 'Resumo do chamado 1045' });
    await waitFor(() => expect(pelaSeta).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpo.queryByRole('dialog')).toBeNull());

    await ponteiroSobre(segunda);
    await userEvent.click(segunda);
    const daSegunda = await corpo.findByRole('dialog', { name: 'Resumo do chamado 1046' });
    await waitFor(() => expect(daSegunda).toBeVisible());
    await userEvent.click(canvasElement.ownerDocument.body);
    await waitFor(() => expect(corpo.queryByRole('dialog')).toBeNull());
  },
};
