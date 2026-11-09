import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EscolhaDeIcone } from './EscolhaDeIcone.tsx';

afterEach(cleanup);

const opcoes = [
  { chave: 'impressora', rotulo: 'Impressora' },
  { chave: 'computador', rotulo: 'Computador' },
  { chave: 'camera', rotulo: 'Câmera' },
];

describe('EscolhaDeIcone', () => {
  it('é um grupo de rádios com o rótulo, cada ícone com o nome dele', () => {
    render(<EscolhaDeIcone rotulo="Ícone" opcoes={opcoes} valor="computador" aoMudar={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'Ícone' })).toBeDefined();
    const computador = screen.getByRole('radio', { name: 'Computador' }) as HTMLInputElement;
    expect(computador.checked).toBe(true);
    expect((screen.getByRole('radio', { name: 'Câmera' }) as HTMLInputElement).checked).toBe(false);
  });

  it('escolhe pelo ponteiro e pelas setas', async () => {
    const aoMudar = vi.fn();
    render(<EscolhaDeIcone rotulo="Ícone" opcoes={opcoes} valor="impressora" aoMudar={aoMudar} />);
    await userEvent.click(screen.getByText('Câmera'));
    expect(aoMudar).toHaveBeenLastCalledWith('camera');
    screen.getByRole('radio', { name: 'Impressora' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(aoMudar).toHaveBeenLastCalledWith('computador');
  });

  it('só para leitura, não muda', async () => {
    const aoMudar = vi.fn();
    render(
      <EscolhaDeIcone
        rotulo="Ícone"
        opcoes={opcoes}
        valor="impressora"
        aoMudar={aoMudar}
        somenteLeitura
      />,
    );
    await userEvent.click(screen.getByText('Câmera'));
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it('o erro aparece em texto', () => {
    render(
      <EscolhaDeIcone
        rotulo="Ícone"
        opcoes={opcoes}
        valor={null}
        aoMudar={() => {}}
        erro="Escolha o ícone do tipo."
      />,
    );
    expect(screen.getByText('Escolha o ícone do tipo.')).toBeDefined();
  });
});
