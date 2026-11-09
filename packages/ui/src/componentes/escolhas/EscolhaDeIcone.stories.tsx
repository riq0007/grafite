import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { EscolhaDeIcone } from './EscolhaDeIcone.tsx';

const meta: Meta = { title: 'Componentes/Escolha de ícone' };
export default meta;

type Historia = StoryObj;

/** Os ícones genéricos de tipo de ativo, com o nome de cada um, como o catálogo os oferece. */
const ICONES = [
  { chave: 'impressora', rotulo: 'Impressora' },
  { chave: 'computador', rotulo: 'Computador' },
  { chave: 'notebook', rotulo: 'Notebook' },
  { chave: 'monitor', rotulo: 'Monitor' },
  { chave: 'switch', rotulo: 'Switch' },
  { chave: 'rack', rotulo: 'Rack' },
  { chave: 'controle-de-acesso', rotulo: 'Controle de acesso' },
  { chave: 'camera', rotulo: 'Câmera' },
  { chave: 'storage', rotulo: 'Storage' },
  { chave: 'nobreak', rotulo: 'Nobreak' },
  { chave: 'generico', rotulo: 'Genérico' },
];

const largura = { maxWidth: 'calc(var(--esp-12) * 10)' } as const;

function Escolha({ inicial = 'impressora', erro }: { inicial?: string | null; erro?: string }) {
  const [valor, setValor] = useState<string | null>(inicial);
  return (
    <div style={largura}>
      <EscolhaDeIcone rotulo="Ícone" opcoes={ICONES} valor={valor} aoMudar={setValor} erro={erro} />
    </div>
  );
}

/** A grade, com a impressora escolhida. */
export const Padrao: Historia = { render: () => <Escolha /> };

/** Sem escolha e com a recusa da API em texto. */
export const ComErro: Historia = {
  render: () => <Escolha inicial={null} erro="Escolha o ícone do tipo." />,
};

/** Só para leitura, como na ficha de quem não pode mudar o catálogo. */
export const SomenteLeitura: Historia = {
  render: () => (
    <div style={largura}>
      <EscolhaDeIcone
        rotulo="Ícone"
        opcoes={ICONES}
        valor="camera"
        aoMudar={() => {}}
        somenteLeitura
      />
    </div>
  ),
};

/** O Tab entra na escolhida, e as setas mudam a escolha, com o anel de foco no quadro. */
export const PeloTeclado: Historia = {
  render: () => <Escolha />,
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.tab();
    const impressora = tela.getByRole('radio', { name: 'Impressora' });
    await expect(impressora).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    const computador = tela.getByRole('radio', { name: 'Computador' });
    await expect(computador).toBeChecked();
    const quadro = computador.closest('label');
    await expect(getComputedStyle(quadro as Element).outlineStyle).toBe('solid');
  },
};
