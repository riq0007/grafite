import type { Meta, StoryObj } from '@storybook/react-vite';
import { Building2, MapPin, Warehouse } from 'lucide-react';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { ItemDaArvore } from './Arvore.tsx';
import { EscolhaEmArvore } from './EscolhaEmArvore.tsx';

// A escolha de local em árvore (spec componentes-base, "Escolha de local em árvore").

const meta: Meta = { title: 'Componentes/Escolha em árvore' };
export default meta;

type Historia = StoryObj;

/** Jundiaí, com o Administrativo e a Expedição, e Campinas, com outra Expedição. */
const LOCAIS: ItemDaArvore[] = [
  {
    id: 'jundiai',
    rotulo: 'Jundiaí',
    icone: MapPin,
    detalhe: 'Unidade',
    filhos: [
      { id: 'administrativo', rotulo: 'Administrativo', icone: Building2, detalhe: 'Prédio' },
      { id: 'expedicao-jundiai', rotulo: 'Expedição', icone: Warehouse, detalhe: 'Setor' },
    ],
  },
  {
    id: 'campinas',
    rotulo: 'Campinas',
    icone: MapPin,
    detalhe: 'Unidade',
    filhos: [{ id: 'expedicao-campinas', rotulo: 'Expedição', icone: Warehouse, detalhe: 'Setor' }],
  },
];

function EscolhaDeLocal({
  sugerido,
  inicial = null,
}: {
  sugerido?: { id: string; origem: string };
  inicial?: string | null;
}) {
  const [local, definirLocal] = useState<string | null>(inicial);
  return (
    <EscolhaEmArvore
      rotulo="Local de trabalho"
      itens={LOCAIS}
      valor={local}
      aoMudar={definirLocal}
      sugerido={sugerido}
    />
  );
}

const corpo = (elemento: HTMLElement) => within(elemento.ownerDocument.body);
const gatilho = (elemento: HTMLElement) =>
  within(elemento).getByRole('button', { name: /^Local de trabalho/ });

/** Cenário da spec: expandir Jundiaí e escolher a Expedição põe o caminho no campo. */
export const EscolherPelaArvore: Historia = {
  render: () => <EscolhaDeLocal />,
  play: async ({ canvasElement }) => {
    await expect(gatilho(canvasElement)).toHaveTextContent('Escolha um local');
    await userEvent.click(gatilho(canvasElement));
    const painel = await corpo(canvasElement).findByRole('dialog', { name: 'Local de trabalho' });
    const jundiai = within(painel).getByRole('row', { name: /^Jundiaí/ });
    await userEvent.click(within(jundiai).getByRole('button', { name: /^Expandir/ }));
    await userEvent.click(await within(painel).findByRole('row', { name: /^Expedição/ }));
    await waitFor(() => expect(corpo(canvasElement).queryByRole('dialog')).toBeNull());
    await expect(gatilho(canvasElement)).toHaveTextContent('Jundiaí › Expedição');
    // O foco volta ao campo quando o painel termina de esmaecer.
    await waitFor(() => expect(gatilho(canvasElement)).toHaveFocus());
  },
};

/** Cenário da spec: o filtro sem acento acha os locais pelo caminho completo. */
export const FiltrarPeloNome: Historia = {
  render: () => <EscolhaDeLocal />,
  play: async ({ canvasElement }) => {
    await userEvent.click(gatilho(canvasElement));
    const painel = await corpo(canvasElement).findByRole('dialog', { name: 'Local de trabalho' });
    await userEvent.type(within(painel).getByRole('searchbox', { name: 'Filtrar' }), 'expedicao');
    const achados = await within(painel).findAllByRole('option');
    await expect(achados.map((opcao) => opcao.textContent)).toEqual([
      'Campinas › Expedição',
      'Jundiaí › Expedição',
    ]);
    // O caminho também casa: "jund exp" não, mas "jundiai ›" sim.
    await userEvent.clear(within(painel).getByRole('searchbox', { name: 'Filtrar' }));
    await userEvent.type(
      within(painel).getByRole('searchbox', { name: 'Filtrar' }),
      'jundiai › exp',
    );
    await waitFor(() =>
      expect(
        within(painel)
          .getAllByRole('option')
          .map((opcao) => opcao.textContent),
      ).toEqual(['Jundiaí › Expedição']),
    );
    await userEvent.click(within(painel).getByRole('option', { name: 'Jundiaí › Expedição' }));
    await waitFor(() => expect(corpo(canvasElement).queryByRole('dialog')).toBeNull());
    await expect(gatilho(canvasElement)).toHaveTextContent('Jundiaí › Expedição');
  },
};

/** Cenário da spec: o local provável aparece no topo, com a origem. */
export const LocalSugerido: Historia = {
  render: () => (
    <EscolhaDeLocal sugerido={{ id: 'expedicao-jundiai', origem: 'local de trabalho de Bruno' }} />
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(gatilho(canvasElement));
    const painel = await corpo(canvasElement).findByRole('dialog', { name: 'Local de trabalho' });
    const sugerido = within(painel).getByRole('button', { name: /Jundiaí › Expedição/ });
    await expect(sugerido).toHaveTextContent('Sugerido: local de trabalho de Bruno');
    await userEvent.click(sugerido);
    await waitFor(() => expect(corpo(canvasElement).queryByRole('dialog')).toBeNull());
    await expect(gatilho(canvasElement)).toHaveTextContent('Jundiaí › Expedição');
  },
};

/** Pelo teclado: o painel abre com o foco no filtro, a seta desce à árvore, e Enter escolhe. */
export const PeloTeclado: Historia = {
  render: () => <EscolhaDeLocal />,
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(gatilho(canvasElement)).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    const painel = await corpo(canvasElement).findByRole('dialog', { name: 'Local de trabalho' });
    await waitFor(() =>
      expect(within(painel).getByRole('searchbox', { name: 'Filtrar' })).toHaveFocus(),
    );
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(within(painel).getByRole('row', { name: /^Jundiaí/ })).toHaveFocus(),
    );
    // A seta para a direita expande Jundiaí; a de baixo vai ao Administrativo.
    await userEvent.keyboard('{ArrowRight}{ArrowDown}{Enter}');
    await waitFor(() => expect(corpo(canvasElement).queryByRole('dialog')).toBeNull());
    await expect(gatilho(canvasElement)).toHaveTextContent('Jundiaí › Administrativo');
    await waitFor(() => expect(gatilho(canvasElement)).toHaveFocus());
  },
};

/** Esc fecha o painel sem mudar o local escolhido, e o escolhido aparece com os ramos abertos. */
export const EscFechaSemMudar: Historia = {
  render: () => <EscolhaDeLocal inicial="expedicao-campinas" />,
  play: async ({ canvasElement }) => {
    await expect(gatilho(canvasElement)).toHaveTextContent('Campinas › Expedição');
    await userEvent.click(gatilho(canvasElement));
    const painel = await corpo(canvasElement).findByRole('dialog', { name: 'Local de trabalho' });
    await expect(within(painel).getByRole('row', { name: /^Expedição/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpo(canvasElement).queryByRole('dialog')).toBeNull());
    await expect(gatilho(canvasElement)).toHaveTextContent('Campinas › Expedição');
  },
};

/** O item que não se escolhe fica à vista, para o que está dentro dele ser alcançado, e sai do filtro. */
export const ItemQueNaoSeEscolhe: Historia = {
  render: () => {
    function Escolha() {
      const [local, definirLocal] = useState<string | null>(null);
      return (
        <EscolhaEmArvore
          rotulo="Local de trabalho"
          itens={LOCAIS}
          valor={local}
          aoMudar={definirLocal}
          desabilitados={new Set(['jundiai'])}
        />
      );
    }
    return <Escolha />;
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(gatilho(canvasElement));
    const painel = await corpo(canvasElement).findByRole('dialog', { name: 'Local de trabalho' });
    const jundiai = within(painel).getByRole('row', { name: /^Jundiaí/ });
    await expect(jundiai).toHaveAccessibleName('Jundiaí, Unidade, não pode ser escolhido');
    await userEvent.click(within(jundiai).getByRole('button', { name: /^Expandir/ }));
    await userEvent.click(await within(painel).findByRole('row', { name: /^Administrativo/ }));
    await waitFor(() => expect(corpo(canvasElement).queryByRole('dialog')).toBeNull());
    await expect(gatilho(canvasElement)).toHaveTextContent('Jundiaí › Administrativo');
    await userEvent.click(gatilho(canvasElement));
    const denovo = await corpo(canvasElement).findByRole('dialog', { name: 'Local de trabalho' });
    await userEvent.type(within(denovo).getByRole('searchbox', { name: 'Filtrar' }), 'jundiai');
    await waitFor(() =>
      expect(
        within(denovo)
          .getAllByRole('option')
          .map((opcao) => opcao.textContent),
      ).toEqual(['Jundiaí › Administrativo', 'Jundiaí › Expedição']),
    );
  },
};
