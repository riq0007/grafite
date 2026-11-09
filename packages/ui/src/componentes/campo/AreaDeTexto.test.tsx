import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AreaDeTexto } from './AreaDeTexto.tsx';

afterEach(cleanup);

describe('AreaDeTexto', () => {
  it('é multilinha e tem o rótulo visível como nome', () => {
    render(<AreaDeTexto rotulo="Observações" placeholder="Detalhes do chamado" />);
    expect(screen.getByRole('textbox', { name: 'Observações' }).tagName).toBe('TEXTAREA');
  });

  it('obrigatória e com erro de fora ligado ao campo', () => {
    render(<AreaDeTexto rotulo="Justificativa" obrigatorio erro="Explique o motivo da baixa." />);
    const area = screen.getByRole('textbox', { name: 'Justificativa' });
    expect((area as HTMLTextAreaElement).required).toBe(true);
    expect(area.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Explique o motivo da baixa.')).toBeDefined();
  });
});
