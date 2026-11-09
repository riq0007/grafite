import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { EstadoDoCampo } from './EstadoDoCampo.tsx';

const meta: Meta = { title: 'Componentes/Estado do campo' };
export default meta;

type Historia = StoryObj;

/** A gravação manual, em texto, como a ficha do ativo mostra para quem só vê. */
export const Gravado: Historia = {
  render: () => (
    <EstadoDoCampo
      rotuloDoCampo="Hostname"
      origem="Manual"
      autor="Ana Souza"
      momento="09/10/2026 14:32"
      travado={false}
    />
  ),
};

/** Um valor da planilha, travado, só para leitura: a trava em texto. */
export const TravadoSoParaLeitura: Historia = {
  render: () => (
    <EstadoDoCampo
      rotuloDoCampo="Local"
      origem="Planilha"
      autor="Bruno Costa"
      momento="02/10/2026 08:05"
      travado
    />
  ),
};

function Editavel() {
  const [travado, setTravado] = useState(false);
  return (
    <EstadoDoCampo
      rotuloDoCampo="Local"
      origem="Coleta"
      momento="09/10/2026 03:00"
      travado={travado}
      aoMudarTrava={setTravado}
    />
  );
}

/** Para quem edita, a trava é um botão, com o estado em texto. */
export const ParaQuemEdita: Historia = {
  render: () => <Editavel />,
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const trava = tela.getByRole('button', { name: 'Trava de Local' });
    await expect(trava).toHaveAttribute('aria-pressed', 'false');
    await expect(trava).toHaveTextContent('Travar');
    await userEvent.click(trava);
    await expect(trava).toHaveAttribute('aria-pressed', 'true');
    await expect(trava).toHaveTextContent('Travado');
  },
};

/** Um campo sem valor, travado antes de ser preenchido. */
export const TravadoSemValor: Historia = {
  render: () => <EstadoDoCampo rotuloDoCampo="IP" travado aoMudarTrava={() => {}} />,
};
