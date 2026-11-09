import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Selecao } from './Selecao.tsx';

afterEach(cleanup);

const situacoes = [
  { id: 'em-uso', rotulo: 'Em uso' },
  { id: 'em-estoque', rotulo: 'Em estoque' },
  { id: 'em-manutencao', rotulo: 'Em manutenção' },
];

describe('Selecao', () => {
  it('o rótulo visível nomeia o gatilho, que mostra o texto de exemplo sem valor escolhido', () => {
    render(<Selecao rotulo="Situação" opcoes={situacoes} />);
    const gatilho = screen.getByRole('button', { name: /Situação/ });
    expect(gatilho.textContent).toContain('Selecione');
  });

  it('obrigatória: a marca aparece e a escolha nativa é exigida no formulário', () => {
    const { container } = render(<Selecao rotulo="Situação" opcoes={situacoes} obrigatorio />);
    expect(screen.getByText('obrigatório').closest('[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelector('select')?.required).toBe(true);
  });

  it('erro de fora aparece em texto', () => {
    render(
      <Selecao
        rotulo="Situação"
        opcoes={situacoes}
        erro="Ativo em uso não pode ir para estoque."
      />,
    );
    expect(screen.getByText('Ativo em uso não pode ir para estoque.')).toBeDefined();
  });
});
