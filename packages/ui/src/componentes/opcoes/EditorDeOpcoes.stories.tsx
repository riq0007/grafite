import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { EditorDeOpcoes, type OpcaoEditavel } from './EditorDeOpcoes.tsx';

const meta: Meta = { title: 'Componentes/Editor de opções' };
export default meta;

type Historia = StoryObj;

const OPCOES: OpcaoEditavel[] = [
  { chave: 'proprio', id: 'proprio', rotulo: 'Próprio', situacao: 'ativa' },
  { chave: 'alugado', id: 'alugado', rotulo: 'Alugado', situacao: 'ativa' },
  { chave: 'comodato', id: 'comodato', rotulo: 'Comodato', situacao: 'inativa' },
];

const largura = { maxWidth: 'calc(var(--esp-12) * 8)' } as const;

function Editor({
  iniciais = OPCOES,
  erros,
  erro,
}: {
  iniciais?: OpcaoEditavel[];
  erros?: Record<number, string>;
  erro?: string;
}) {
  const [opcoes, setOpcoes] = useState(iniciais);
  let novas = 0;
  return (
    <div style={largura}>
      <EditorDeOpcoes
        rotulo="Opções"
        opcoes={opcoes}
        aoMudar={setOpcoes}
        erros={erros}
        erro={erro}
        novaChave={() => `nova-${++novas}`}
      />
    </div>
  );
}

/** As opções do campo Propriedade, com a inativa dizendo isso em texto. */
export const Padrao: Historia = { render: () => <Editor /> };

/** A recusa da API: a de uma opção no campo dela, e a da lista abaixo das opções. */
export const ComRecusas: Historia = {
  render: () => (
    <Editor
      iniciais={[...OPCOES, { chave: 'outra', rotulo: 'proprio', situacao: 'ativa' }]}
      erros={{ 3: 'Já existe uma opção com este rótulo.' }}
      erro="As opções não são excluídas: inative a opção."
    />
  ),
};

/** Só para leitura, como na ficha de quem não pode mudar o catálogo. */
export const SomenteLeitura: Historia = {
  render: () => (
    <div style={largura}>
      <EditorDeOpcoes rotulo="Opções" opcoes={OPCOES} aoMudar={() => {}} somenteLeitura />
    </div>
  ),
};

/** Incluir pelo teclado põe o foco na opção nova; mover e inativar também vão pelo teclado. */
export const PeloTeclado: Historia = {
  render: () => <Editor />,
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    tela.getByRole('button', { name: 'Incluir opção' }).focus();
    await userEvent.keyboard('{Enter}');
    const nova = tela.getByRole('textbox', { name: 'Opção 4' });
    await expect(nova).toHaveFocus();
    await userEvent.keyboard('Emprestado');
    tela.getByRole('button', { name: 'Mover Emprestado para cima' }).focus();
    await userEvent.keyboard('{Enter}');
    await expect(tela.getByRole('textbox', { name: 'Opção 3' })).toHaveValue('Emprestado');
    tela.getByRole('button', { name: 'Inativar Próprio' }).focus();
    await userEvent.keyboard('{Enter}');
    await expect(tela.getByRole('button', { name: 'Reativar Próprio' })).toBeDefined();
    await expect(tela.getAllByText('Inativa')).toHaveLength(2);
  },
};
