import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorDeOpcoes, type OpcaoEditavel } from './EditorDeOpcoes.tsx';

afterEach(cleanup);

const opcoes: OpcaoEditavel[] = [
  { chave: 'a', id: 'op-a', rotulo: 'Próprio', situacao: 'ativa' },
  { chave: 'b', id: 'op-b', rotulo: 'Alugado', situacao: 'ativa' },
  { chave: 'c', id: 'op-c', rotulo: 'Comodato', situacao: 'inativa' },
];

/** O editor com o estado de quem o usa, como a ficha do campo. */
function ComEstado({ iniciais = opcoes }: { iniciais?: OpcaoEditavel[] }) {
  const [lista, setLista] = useState(iniciais);
  let chaves = 0;
  return (
    <>
      <EditorDeOpcoes
        rotulo="Opções"
        opcoes={lista}
        aoMudar={setLista}
        novaChave={() => `nova-${++chaves}`}
      />
      <output data-testid="ordem">{lista.map((o) => `${o.rotulo}:${o.situacao}`).join('|')}</output>
    </>
  );
}

const ordem = () => screen.getByTestId('ordem').textContent;

describe('EditorDeOpcoes', () => {
  it('mostra cada opção num campo com nome, e a inativa diz isso em texto', () => {
    render(<EditorDeOpcoes rotulo="Opções" opcoes={opcoes} aoMudar={() => {}} />);
    expect(screen.getByRole('group', { name: 'Opções' })).toBeDefined();
    expect((screen.getByRole('textbox', { name: 'Opção 1' }) as HTMLInputElement).value).toBe(
      'Próprio',
    );
    expect((screen.getByRole('textbox', { name: 'Opção 3' }) as HTMLInputElement).value).toBe(
      'Comodato',
    );
    expect(screen.getAllByText('Inativa')).toHaveLength(1);
  });

  it('renomeia a opção sem trocar o id', async () => {
    const aoMudar = vi.fn();
    render(<EditorDeOpcoes rotulo="Opções" opcoes={opcoes} aoMudar={aoMudar} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Opção 2' }), 's');
    expect(aoMudar).toHaveBeenLastCalledWith([
      opcoes[0],
      { chave: 'b', id: 'op-b', rotulo: 'Alugados', situacao: 'ativa' },
      opcoes[2],
    ]);
  });

  it('inclui uma opção ativa e vazia ao fim, com o foco nela', async () => {
    render(<ComEstado />);
    await userEvent.click(screen.getByRole('button', { name: 'Incluir opção' }));
    const nova = screen.getByRole('textbox', { name: 'Opção 4' });
    expect(document.activeElement).toBe(nova);
    await userEvent.type(nova, 'Emprestado');
    expect(ordem()).toBe('Próprio:ativa|Alugado:ativa|Comodato:inativa|Emprestado:ativa');
  });

  it('move as opções, e nos extremos o movimento fica desligado', async () => {
    render(<ComEstado />);
    expect(screen.getByRole('button', { name: 'Mover Próprio para cima' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('button', { name: 'Mover Comodato para baixo' })).toHaveProperty(
      'disabled',
      true,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Mover Próprio para baixo' }));
    expect(ordem()).toBe('Alugado:ativa|Próprio:ativa|Comodato:inativa');
    await userEvent.click(screen.getByRole('button', { name: 'Mover Comodato para cima' }));
    expect(ordem()).toBe('Alugado:ativa|Comodato:inativa|Próprio:ativa');
  });

  it('inativa e reativa, sem nenhuma ação de excluir', async () => {
    render(<ComEstado />);
    await userEvent.click(screen.getByRole('button', { name: 'Inativar Próprio' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reativar Comodato' }));
    expect(ordem()).toBe('Próprio:inativa|Alugado:ativa|Comodato:ativa');
    expect(screen.queryByRole('button', { name: /excluir|remover/i })).toBeNull();
  });

  it('a recusa de cada opção aparece no próprio campo, e a da lista abaixo dela', () => {
    render(
      <EditorDeOpcoes
        rotulo="Opções"
        opcoes={opcoes}
        aoMudar={() => {}}
        erros={{ 1: 'Já existe uma opção com este rótulo.' }}
        erro="As opções não são excluídas: inative a opção."
      />,
    );
    const campo = screen.getByRole('textbox', { name: 'Opção 2' });
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Já existe uma opção com este rótulo.')).toBeDefined();
    expect(screen.getByText('As opções não são excluídas: inative a opção.')).toBeDefined();
  });

  it('só para leitura, sem ações e com os campos fixos', () => {
    render(<EditorDeOpcoes rotulo="Opções" opcoes={opcoes} aoMudar={() => {}} somenteLeitura />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('textbox', { name: 'Opção 1' }).hasAttribute('readonly')).toBe(true);
  });
});
