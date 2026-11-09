import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { OpcaoDeSelecao } from '../selecao/Selecao.tsx';
import { BuscaComSugestoes } from './BuscaComSugestoes.tsx';

// As escolhas com as opções à vista (spec componentes-base, "Escolha com as opções à vista"): a
// busca abre pelo clique, pelo botão e pelas setas, antes de qualquer tecla.

const meta: Meta = {
  title: 'Componentes/Busca com sugestões',
};
export default meta;

type Historia = StoryObj;

const FUSOS: OpcaoDeSelecao[] = [
  { id: 'lisboa', rotulo: 'Lisboa' },
  { id: 'sistema', rotulo: 'Seguir o sistema' },
  { id: 'manaus', rotulo: 'Manaus' },
  { id: 'buenos-aires', rotulo: 'Buenos Aires' },
  { id: 'sao-paulo', rotulo: 'São Paulo' },
  { id: 'assuncao', rotulo: 'Assunção' },
  { id: 'nova-york', rotulo: 'Nova York' },
];

const DO_BRASIL = { ids: ['sistema', 'sao-paulo', 'manaus'] };

const corpo = (elemento: HTMLElement) => within(elemento.ownerDocument.body);

/** O nome de uma opção: o rótulo, sem a descrição que só o leitor de tela lê. */
function nomeDa(opcao: HTMLElement) {
  const rotulo = opcao.getAttribute('aria-labelledby');
  return (rotulo && opcao.ownerDocument.getElementById(rotulo)?.textContent) || opcao.textContent;
}

/** Os nomes das opções da lista, na ordem em que aparecem. */
const nomesDasOpcoes = (lista: HTMLElement) => within(lista).getAllByRole('option').map(nomeDa);

/** Cenário da spec: clicar no campo abre a lista, com os sugeridos primeiro e o resto em ordem. */
export const AbrePeloClique: Historia = {
  render: () => <BuscaComSugestoes rotulo="Fuso horário" sugestoes={FUSOS} sugeridas={DO_BRASIL} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Fuso horário' }));
    const lista = await corpo(canvasElement).findByRole('listbox');
    // O painel entra esmaecendo.
    await waitFor(() => expect(corpo(canvasElement).getByText('Sugeridos')).toBeVisible());
    // Cada sugerida diz ao leitor de tela que é sugerida.
    await expect(
      corpo(canvasElement).getByRole('option', { name: 'São Paulo' }),
    ).toHaveAccessibleDescription('Sugerido');
    // Os sugeridos na ordem da tela; os outros em ordem alfabética, "Assunção" antes de "Buenos".
    await expect(nomesDasOpcoes(lista)).toEqual([
      'Seguir o sistema',
      'São Paulo',
      'Manaus',
      'Assunção',
      'Buenos Aires',
      'Lisboa',
      'Nova York',
    ]);
  },
};

/** O botão ao lado do campo abre a lista inteira, mesmo com uma opção já escolhida. */
export const AbrePeloBotao: Historia = {
  render: () => (
    <BuscaComSugestoes rotulo="Fuso horário" sugestoes={FUSOS} defaultSelectedKey="lisboa" />
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Mostrar as opções de Fuso horário' }),
    );
    const lista = await corpo(canvasElement).findByRole('listbox');
    await expect(within(lista).getAllByRole('option')).toHaveLength(FUSOS.length);
  },
};

/** Digitar estreita a lista, com as sugeridas e as outras, sem diferenciar acento. */
export const DigitarEstreita: Historia = {
  render: () => <BuscaComSugestoes rotulo="Fuso horário" sugestoes={FUSOS} sugeridas={DO_BRASIL} />,
  play: async ({ canvasElement }) => {
    const busca = within(canvasElement).getByRole('combobox', { name: 'Fuso horário' });
    await userEvent.click(busca);
    await corpo(canvasElement).findByRole('listbox');
    await userEvent.type(busca, 'sao');
    await waitFor(() =>
      expect(nomesDasOpcoes(corpo(canvasElement).getByRole('listbox'))).toEqual(['São Paulo']),
    );
    await userEvent.clear(busca);
    // "is" acha um sugerido, "Seguir o sistema", e um dos outros, "Lisboa": o sugerido vem antes.
    await userEvent.type(busca, 'is');
    await waitFor(() =>
      expect(nomesDasOpcoes(corpo(canvasElement).getByRole('listbox'))).toEqual([
        'Seguir o sistema',
        'Lisboa',
      ]),
    );
  },
};

/** A tabulação só foca o campo; a seta para baixo abre a lista, pelo teclado. */
export const AbrePelaSeta: Historia = {
  render: () => <BuscaComSugestoes rotulo="Fuso horário" sugestoes={FUSOS} sugeridas={DO_BRASIL} />,
  play: async ({ canvasElement }) => {
    const busca = within(canvasElement).getByRole('combobox', { name: 'Fuso horário' });
    await userEvent.tab();
    await expect(busca).toHaveFocus();
    await expect(corpo(canvasElement).queryByRole('listbox')).toBeNull();
    await userEvent.keyboard('{ArrowDown}');
    const lista = await corpo(canvasElement).findByRole('listbox');
    await expect(within(lista).getAllByRole('option')).toHaveLength(FUSOS.length);
  },
};

/** Cenário da spec: Esc fecha a lista sem mudar o valor escolhido. */
export const EscFechaSemMudar: Historia = {
  render: () => (
    <BuscaComSugestoes
      rotulo="Fuso horário"
      sugestoes={FUSOS}
      sugeridas={DO_BRASIL}
      aceitaTextoLivre={false}
      defaultSelectedKey="sao-paulo"
    />
  ),
  play: async ({ canvasElement }) => {
    const busca = within(canvasElement).getByRole('combobox', { name: 'Fuso horário' });
    await userEvent.click(busca);
    await corpo(canvasElement).findByRole('listbox');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpo(canvasElement).queryByRole('listbox')).toBeNull());
    await expect(busca).toHaveValue('São Paulo');
  },
};

/** A origem da sugestão fica escrita no painel. */
export const OrigemDaSugestao: Historia = {
  render: () => (
    <BuscaComSugestoes
      rotulo="Responsável"
      sugestoes={[
        { id: 'ana', rotulo: 'Ana Souza' },
        { id: 'bruno', rotulo: 'Bruno Costa' },
        { id: 'carla', rotulo: 'Carla Dias' },
      ]}
      sugeridas={{ ids: ['bruno'], origem: 'Do mesmo local do ativo' }}
    />
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Responsável' }));
    const lista = await corpo(canvasElement).findByRole('listbox');
    await waitFor(() =>
      expect(corpo(canvasElement).getByText('Do mesmo local do ativo')).toBeVisible(),
    );
    await expect(
      corpo(canvasElement).getByRole('option', { name: 'Bruno Costa' }),
    ).toHaveAccessibleDescription('Sugerido: Do mesmo local do ativo');
    await expect(nomesDasOpcoes(lista)).toEqual(['Bruno Costa', 'Ana Souza', 'Carla Dias']);
  },
};

/** As 300 pessoas que a API de mentira conhece, "Pessoa 001" a "Pessoa 300". */
const PESSOAS = Array.from({ length: 300 }, (_, i) => {
  const numero = String(i + 1).padStart(3, '0');
  return { id: `p${numero}`, rotulo: `Pessoa ${numero}` };
});

/** A escolha pela API: sem o texto, as primeiras 20 e o total; com ele, as que casam. */
function EscolhaDePessoas() {
  const [texto, definirTexto] = useState('');
  const encontradas = PESSOAS.filter((pessoa) => pessoa.rotulo.includes(texto.trim()));
  return (
    <BuscaComSugestoes
      rotulo="Responsável"
      sugestoes={encontradas.slice(0, 20)}
      total={encontradas.length}
      sugestoesDeFora
      onInputChange={definirTexto}
    />
  );
}

/** Cenário da spec: as opções da API aparecem sem digitar, com o rodapé do total. */
export const OpcoesDaApi: Historia = {
  render: () => <EscolhaDePessoas />,
  play: async ({ canvasElement }) => {
    const busca = within(canvasElement).getByRole('combobox', { name: 'Responsável' });
    await userEvent.click(busca);
    const lista = await corpo(canvasElement).findByRole('listbox');
    await expect(within(lista).getAllByRole('option')).toHaveLength(20);
    await waitFor(() =>
      expect(corpo(canvasElement).getByText('Digite para buscar entre 300')).toBeVisible(),
    );
    // Com a busca que acha só uma, o rodapé some.
    await userEvent.type(busca, '299');
    await waitFor(() =>
      expect(within(corpo(canvasElement).getByRole('listbox')).getAllByRole('option')).toHaveLength(
        1,
      ),
    );
    await expect(corpo(canvasElement).queryByText(/Digite para buscar/)).toBeNull();
  },
};
