// A confirmação com um texto digitado (spec mapa-da-planta, "Exclusão da planta"; change
// gestao-das-plantas, design, decisão 1): a ação que apaga muito de uma vez pede o nome do que sai,
// e o botão só libera quando o texto confere.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Confirmacao, type PropsDaConfirmacao } from './Confirmacao.tsx';

afterEach(cleanup);

function abrir(props: Partial<PropsDaConfirmacao> = {}) {
  const fazer = vi.fn(async () => ({ ok: true }) as const);
  render(
    <Confirmacao
      acao="Excluir a planta"
      titulo="Excluir a planta Jundiaí?"
      confirmando="Excluindo"
      fazer={fazer}
      {...props}
    >
      A exclusão apaga 12 posições e não se desfaz.
    </Confirmacao>,
  );
  return fazer;
}

const confirmacao = () => screen.findByRole('alertdialog', { name: 'Excluir a planta Jundiaí?' });
const botaoQueConfirma = (dialogo: HTMLElement) =>
  within(dialogo).getByRole('button', { name: 'Excluir a planta' }) as HTMLButtonElement;

describe('Confirmacao', () => {
  it('sem texto para conferir, o botão que confirma já vem liberado', async () => {
    const fazer = abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir a planta' }));
    const dialogo = await confirmacao();
    expect(within(dialogo).queryByRole('textbox')).toBeNull();
    expect(botaoQueConfirma(dialogo).disabled).toBe(false);
    fireEvent.click(botaoQueConfirma(dialogo));
    await waitFor(() => expect(fazer).toHaveBeenCalledTimes(1));
  });

  it('Nome que não confere: o botão continua desabilitado, e nada é feito', async () => {
    const fazer = abrir({ conferir: 'Jundiaí' });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir a planta' }));
    const dialogo = await confirmacao();
    // A confirmação diz o que digitar, em texto.
    expect(dialogo.textContent).toContain('Digite Jundiaí para confirmar.');
    const campo = within(dialogo).getByRole('textbox', { name: 'Texto da confirmação' });
    expect(botaoQueConfirma(dialogo).disabled).toBe(true);
    fireEvent.change(campo, { target: { value: 'Jundiai' } });
    expect(botaoQueConfirma(dialogo).disabled).toBe(true);
    fireEvent.click(botaoQueConfirma(dialogo));
    expect(fazer).not.toHaveBeenCalled();
  });

  it('com o texto que confere, sem contar os espaços das pontas, o botão libera e a ação vale', async () => {
    const fazer = abrir({ conferir: 'Jundiaí' });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir a planta' }));
    const dialogo = await confirmacao();
    const campo = within(dialogo).getByRole('textbox', { name: 'Texto da confirmação' });
    fireEvent.change(campo, { target: { value: '  Jundiaí ' } });
    expect(botaoQueConfirma(dialogo).disabled).toBe(false);
    fireEvent.click(botaoQueConfirma(dialogo));
    await waitFor(() => expect(fazer).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('reaberta, pede o texto de novo', async () => {
    abrir({ conferir: 'Jundiaí' });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir a planta' }));
    let dialogo = await confirmacao();
    fireEvent.change(within(dialogo).getByRole('textbox'), { target: { value: 'Jundiaí' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Excluir a planta' }));
    dialogo = await confirmacao();
    expect((within(dialogo).getByRole('textbox') as HTMLInputElement).value).toBe('');
    expect(botaoQueConfirma(dialogo).disabled).toBe(true);
  });

  // Aberta por fora, como por um item de menu: sem o botão que abre, e quem abriu sabe quando fecha.
  it('aberta por fora, não tem o botão que abre e avisa quando fecha', async () => {
    const aoFechar = vi.fn();
    abrir({ aberta: true, aoFechar });
    const dialogo = await confirmacao();
    expect(screen.getAllByRole('button', { name: 'Excluir a planta' })).toHaveLength(1);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
  });
});
