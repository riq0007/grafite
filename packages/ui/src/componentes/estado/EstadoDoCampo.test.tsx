import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EstadoDoCampo } from './EstadoDoCampo.tsx';

afterEach(cleanup);

describe('EstadoDoCampo', () => {
  it('diz a origem, o autor e o momento em texto', () => {
    render(
      <EstadoDoCampo
        rotuloDoCampo="Local"
        origem="Manual"
        autor="Ana Souza"
        momento="09/10/2026 14:32"
        travado={false}
      />,
    );
    expect(screen.getByText('Manual · Ana Souza · 09/10/2026 14:32')).toBeDefined();
  });

  it('só para leitura, a trava aparece em texto quando ligada, sem botão', () => {
    render(<EstadoDoCampo rotuloDoCampo="Local" origem="Planilha" travado />);
    expect(screen.getByText('Planilha')).toBeDefined();
    expect(screen.getByText('Travado')).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
    cleanup();
    render(<EstadoDoCampo rotuloDoCampo="Local" origem="Planilha" travado={false} />);
    expect(screen.queryByText('Travado')).toBeNull();
  });

  it('para quem edita, a trava é um botão com o nome do campo e o estado em texto', async () => {
    const aoMudarTrava = vi.fn();
    render(
      <EstadoDoCampo
        rotuloDoCampo="Local"
        origem="Manual"
        travado={false}
        aoMudarTrava={aoMudarTrava}
      />,
    );
    const botao = screen.getByRole('button', { name: 'Trava de Local' });
    expect(botao.getAttribute('aria-pressed')).toBe('false');
    expect(botao.textContent).toBe('Travar');
    await userEvent.click(botao);
    expect(aoMudarTrava).toHaveBeenCalledWith(true);
  });

  it('travado, o botão diz "Travado" e destrava', async () => {
    const aoMudarTrava = vi.fn();
    render(<EstadoDoCampo rotuloDoCampo="IP" travado aoMudarTrava={aoMudarTrava} />);
    const botao = screen.getByRole('button', { name: 'Trava de IP' });
    expect(botao.getAttribute('aria-pressed')).toBe('true');
    expect(botao.textContent).toBe('Travado');
    await userEvent.click(botao);
    expect(aoMudarTrava).toHaveBeenCalledWith(false);
  });

  it('sem gravação e sem trava, só para leitura, não mostra nada', () => {
    const { container } = render(<EstadoDoCampo rotuloDoCampo="IP" travado={false} />);
    expect(container.textContent).toBe('');
  });
});
