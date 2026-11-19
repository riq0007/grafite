import { cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
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

  it('com o rótulo oculto, o nome vem dele sem o rótulo à vista; o id e o ref ficam na caixa', () => {
    const caixa = createRef<HTMLTextAreaElement>();
    render(<AreaDeTexto rotulo="Mensagem para Fernanda" ocultarRotulo id="campo" ref={caixa} />);
    const area = screen.getByRole('textbox', { name: 'Mensagem para Fernanda' });
    expect(screen.queryByText('Mensagem para Fernanda')).toBeNull();
    expect(area.id).toBe('campo');
    expect(caixa.current).toBe(area);
  });
});
