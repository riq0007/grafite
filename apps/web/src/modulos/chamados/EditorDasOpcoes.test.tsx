// O editor das opções da pergunta (change chat-com-chamados, tarefa 4.13 e os pontos da revisão
// dela): o foco depois de tirar uma opção, onde o editor fica, como na gaveta da resposta pronta.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { EditorDasOpcoes } from './EditorDasOpcoes.tsx';

afterEach(cleanup);

function ComAsOpcoes({ iniciais }: { iniciais: string[] }) {
  const [opcoes, definirOpcoes] = useState(iniciais);
  return <EditorDasOpcoes opcoes={opcoes} aoMudar={definirOpcoes} />;
}

describe('o foco no editor das opções', () => {
  it('tirar uma do meio o leva à que ficou no lugar dela', async () => {
    render(<ComAsOpcoes iniciais={['Sim', 'Não', 'Talvez']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tirar a opção 2' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Opção 2' })),
    );
    expect((screen.getByRole('textbox', { name: 'Opção 2' }) as HTMLInputElement).value).toBe(
      'Talvez',
    );
  });

  it('tirar a última o leva ao "Acrescentar opção", e não ao corpo da página', async () => {
    render(<ComAsOpcoes iniciais={['Sim']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tirar a opção 1' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Acrescentar opção' }),
      ),
    );
  });
});
