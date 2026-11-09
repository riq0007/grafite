import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { ItemDoMenuDeContexto } from '../menu/MenuDeContexto.tsx';
import { ATIVOS } from './exemplos.ts';
import {
  CabecalhoDaTabela,
  Celula,
  Coluna,
  ContagemDaSelecao,
  CorpoDaTabela,
  Linha,
  Tabela,
} from './Tabela.tsx';

const meta: Meta = { title: 'Componentes/Tabela com menu de contexto' };
export default meta;

interface Espioes {
  aoAbrirLinha?: (chave: string) => void;
  aoEscolher?: (acao: string, chaves: string[]) => void;
  aoCopiar?: (chaves: string[]) => void;
}

type Historia = StoryObj<Espioes>;

/** Os itens do menu, conforme as linhas: "Abrir" só com uma. */
const itensPara =
  (aoEscolher: Espioes['aoEscolher']) =>
  (chaves: string[]): ItemDoMenuDeContexto[] => [
    ...(chaves.length === 1
      ? [{ id: 'abrir', rotulo: 'Abrir', aoEscolher: () => aoEscolher?.('abrir', chaves) }]
      : []),
    { id: 'previa', rotulo: 'Prévia', aoEscolher: () => aoEscolher?.('previa', chaves) },
    { id: 'copiar', rotulo: 'Copiar linhas', aoEscolher: () => aoEscolher?.('copiar', chaves) },
  ];

function TabelaComMenu({
  aoAbrirLinha,
  aoEscolher,
  aoCopiar,
  selecaoInicial = [],
}: Espioes & { selecaoInicial?: string[] }) {
  const [selecao, definirSelecao] = useState<ReadonlySet<string>>(new Set(selecaoInicial));
  return (
    <div style={{ display: 'grid', gap: 'var(--esp-2)' }}>
      <ContagemDaSelecao quantas={selecao.size} aoLimpar={() => definirSelecao(new Set())} />
      <Tabela
        rotulo="Ativos"
        selecao={selecao}
        aoMudarSelecao={definirSelecao}
        aoAbrirLinha={aoAbrirLinha}
        menuDeContexto={itensPara(aoEscolher)}
        aoCopiar={aoCopiar}
        alturaMaxima="360px"
      >
        <CabecalhoDaTabela>
          <Coluna id="nome" principal>
            Equipamento
          </Coluna>
          <Coluna id="patrimonio">Patrimônio</Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela itens={ATIVOS}>
          {(ativo) => (
            <Linha id={ativo.id}>
              <Celula>{ativo.nome}</Celula>
              <Celula mono>{ativo.patrimonio}</Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
    </div>
  );
}

const linha = (canvas: HTMLElement, nome: string) =>
  within(canvas).getByRole('row', { name: new RegExp(nome) });

const selecionadas = (canvas: HTMLElement) =>
  within(canvas)
    .getAllByRole('row')
    .filter((elemento) => elemento.getAttribute('aria-selected') === 'true')
    .map((elemento) => elemento.getAttribute('data-key'));

const cliqueDireito = (elemento: HTMLElement) =>
  userEvent.pointer({ keys: '[MouseRight]', target: elemento });

const menu = () => within(document.body).findByRole('menu', { name: 'Ações das linhas' });

/** O clique direito numa linha fora da seleção faz dela a seleção, e o menu age sobre ela. */
export const LinhaForaDaSelecao: Historia = {
  args: { aoEscolher: fn() },
  render: (args) => <TabelaComMenu aoEscolher={args.aoEscolher} selecaoInicial={['1', '2']} />,
  play: async ({ args, canvasElement }) => {
    await cliqueDireito(linha(canvasElement, 'Aruba'));
    const aberto = await menu();
    await expect(selecionadas(canvasElement)).toEqual(['3']);
    await expect(
      within(aberto)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Abrir', 'Prévia', 'Copiar linhas']);
    await userEvent.click(within(aberto).getByRole('menuitem', { name: 'Abrir' }));
    await expect(args.aoEscolher).toHaveBeenCalledWith('abrir', ['3']);
    await waitFor(() => expect(within(document.body).queryByRole('menu')).toBeNull());
  },
};

/** O clique direito numa linha da seleção age sobre a seleção inteira, na ordem da tabela. */
export const LinhaDaSelecao: Historia = {
  args: { aoEscolher: fn() },
  render: (args) => <TabelaComMenu aoEscolher={args.aoEscolher} selecaoInicial={['5', '2', '3']} />,
  play: async ({ args, canvasElement }) => {
    await cliqueDireito(linha(canvasElement, 'Aruba'));
    const aberto = await menu();
    await expect(
      within(aberto)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Prévia', 'Copiar linhas']);
    await userEvent.click(within(aberto).getByRole('menuitem', { name: 'Copiar linhas' }));
    await expect(args.aoEscolher).toHaveBeenCalledWith('copiar', ['2', '3', '5']);
    await expect(selecionadas(canvasElement)).toEqual(['2', '3', '5']);
  },
};

/** Pelo teclado: Shift+F10 abre o menu na linha em foco, e Esc fecha com o foco de volta nela. */
export const PeloTeclado: Historia = {
  render: () => <TabelaComMenu />,
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    const aberto = await menu();
    await waitFor(() =>
      expect(document.activeElement).toBe(within(aberto).getAllByRole('menuitem')[0]),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(linha(canvasElement, 'Dell OptiPlex')));
  },
};

/** A tecla de menu também abre o menu da linha em foco. */
export const TeclaDeMenu: Historia = {
  render: () => <TabelaComMenu />,
  play: async () => {
    await userEvent.tab();
    await userEvent.keyboard('{ContextMenu}');
    await menu();
  },
};

/** No toque, o toque longo abre o menu, e o registro não abre quando o dedo sai. */
export const ToqueLongo: Historia = {
  args: { aoAbrirLinha: fn() },
  render: (args) => <TabelaComMenu aoAbrirLinha={args.aoAbrirLinha} />,
  play: async ({ args, canvasElement }) => {
    const alvo = linha(canvasElement, 'Nobreak');
    const caixa = alvo.getBoundingClientRect();
    const ponto = { clientX: caixa.left + 40, clientY: caixa.top + caixa.height / 2 };
    const toque = (tipo: string) =>
      new PointerEvent(tipo, {
        bubbles: true,
        cancelable: true,
        pointerId: 7,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons: tipo === 'pointerup' ? 0 : 1,
        ...ponto,
      });
    alvo.dispatchEvent(toque('pointerdown'));
    await menu();
    alvo.dispatchEvent(toque('pointerup'));
    alvo.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...ponto }));
    await expect(args.aoAbrirLinha).not.toHaveBeenCalled();
    await expect(selecionadas(canvasElement)).toEqual(['5']);
  },
};

/** Ctrl+C copia as linhas selecionadas ou, sem seleção, a linha em foco. */
export const CopiarPeloTeclado: Historia = {
  args: { aoCopiar: fn() },
  render: (args) => <TabelaComMenu aoCopiar={args.aoCopiar} selecaoInicial={['4', '1']} />,
  play: async ({ args, canvasElement }) => {
    const usuario = userEvent.setup();
    linha(canvasElement, 'Dell OptiPlex').focus();
    await usuario.keyboard('{Control>}c{/Control}');
    await expect(args.aoCopiar).toHaveBeenLastCalledWith(['1', '4']);
    await usuario.keyboard('{Escape}');
    await usuario.keyboard('{Control>}c{/Control}');
    await expect(args.aoCopiar).toHaveBeenLastCalledWith(['2']);
  },
};

/** Com um trecho de texto selecionado, Ctrl+C fica com o navegador, e as linhas não são copiadas. */
export const TrechoDeTexto: Historia = {
  args: { aoCopiar: fn() },
  render: (args) => <TabelaComMenu aoCopiar={args.aoCopiar} />,
  play: async ({ args, canvasElement }) => {
    const celula = within(linha(canvasElement, 'Aruba')).getByText('PAT-00102');
    linha(canvasElement, 'Aruba').focus();
    const trecho = document.createRange();
    trecho.selectNodeContents(celula);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(trecho);
    const usuario = userEvent.setup();
    await usuario.keyboard('{Control>}c{/Control}');
    await expect(args.aoCopiar).not.toHaveBeenCalled();
    window.getSelection()?.removeAllRanges();
  },
};
