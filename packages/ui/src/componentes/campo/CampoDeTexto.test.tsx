import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CampoDeTexto } from './CampoDeTexto.tsx';

afterEach(cleanup);

/** Textos dos elementos que o campo referencia em aria-describedby. */
function descricoesDe(campo: HTMLElement): string[] {
  return (campo.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '');
}

describe('CampoDeTexto', () => {
  it('o rótulo visível é o nome do campo; o texto de exemplo não o substitui', () => {
    render(<CampoDeTexto rotulo="Patrimônio" placeholder="Ex.: PAT-0001" />);
    const campo = screen.getByRole('textbox', { name: 'Patrimônio' });
    expect(campo.getAttribute('placeholder')).toBe('Ex.: PAT-0001');
    expect(screen.getByText('Patrimônio').tagName).toBe('LABEL');
  });

  it('obrigatório: exige valor e mostra "obrigatório" junto do rótulo, sem repetir no leitor de tela', () => {
    render(<CampoDeTexto rotulo="Patrimônio" obrigatorio />);
    const campo = screen.getByRole('textbox', { name: 'Patrimônio' });
    expect((campo as HTMLInputElement).required).toBe(true);
    const marca = screen.getByText('obrigatório');
    expect(marca.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('a descrição fica ligada ao campo', () => {
    render(<CampoDeTexto rotulo="Patrimônio" descricao="Etiqueta colada no equipamento." />);
    const campo = screen.getByRole('textbox', { name: 'Patrimônio' });
    expect(descricoesDe(campo)).toContain('Etiqueta colada no equipamento.');
  });

  it('erro vindo de fora (da API, por exemplo) aparece em texto e fica ligado ao campo', () => {
    render(<CampoDeTexto rotulo="Patrimônio" erro="Patrimônio já cadastrado." />);
    const campo = screen.getByRole('textbox', { name: 'Patrimônio' });
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(descricoesDe(campo).join(' ')).toContain('Patrimônio já cadastrado.');
  });

  it('o contador conta pela regra dada, passa à cor crítica acima do máximo, e o leitor ouve o máximo', () => {
    const contar = (texto: string) => texto.trim().length;
    const { rerender } = render(
      <CampoDeTexto
        rotulo="Título"
        value="  Impressora manchando "
        onChange={() => {}}
        contador={{ maximo: 20, contar }}
        erro="Use até 20 caracteres."
      />,
    );
    const campo = screen.getByRole('textbox', { name: 'Título' });
    expect(screen.getByText('20/20').hasAttribute('data-passou')).toBe(false);
    expect(descricoesDe(campo)).toEqual(
      expect.arrayContaining(['Até 20 caracteres.', 'Use até 20 caracteres.']),
    );
    rerender(
      <CampoDeTexto
        rotulo="Título"
        value="Impressora manchando!"
        onChange={() => {}}
        contador={{ maximo: 20, contar }}
      />,
    );
    expect(screen.getByText('21/20').hasAttribute('data-passou')).toBe(true);
    expect(screen.getByText('21/20').getAttribute('aria-hidden')).toBe('true');
  });
});
