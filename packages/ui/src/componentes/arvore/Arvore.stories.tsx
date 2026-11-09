import type { Meta, StoryObj } from '@storybook/react-vite';
import { Building2, DoorOpen, Layers, MapPin, Warehouse } from 'lucide-react';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { densidades } from '../../tokens/escalas.ts';
import { Arvore, type ItemDaArvore } from './Arvore.tsx';

const meta: Meta = { title: 'Componentes/Árvore' };
export default meta;

type Historia = StoryObj<{ aoEscolher?: (id: string) => void }>;

/** Jundiaí › Administrativo › 1º andar › Sala 12, com a Doca 3 inativa, e Campinas. */
const LOCAIS: ItemDaArvore[] = [
  {
    id: 'jundiai',
    rotulo: 'Jundiaí',
    icone: MapPin,
    detalhe: 'Unidade',
    filhos: [
      {
        id: 'administrativo',
        rotulo: 'Administrativo',
        icone: Building2,
        detalhe: 'Prédio',
        filhos: [
          {
            id: 'andar-1',
            rotulo: '1º andar',
            icone: Layers,
            detalhe: 'Andar',
            filhos: [{ id: 'sala-12', rotulo: 'Sala 12', icone: DoorOpen, detalhe: 'Sala' }],
          },
        ],
      },
      {
        id: 'expedicao',
        rotulo: 'Expedição',
        icone: Warehouse,
        detalhe: 'Setor',
        filhos: [
          {
            id: 'doca-3',
            rotulo: 'Doca 3',
            icone: Warehouse,
            detalhe: 'Setor',
            situacao: { tipo: 'neutra', texto: 'Inativo' },
          },
        ],
      },
    ],
  },
  { id: 'campinas', rotulo: 'Campinas', icone: MapPin, detalhe: 'Unidade' },
];

function ArvoreDeLocais({
  aoEscolher,
  expandidosNoComeco,
}: {
  aoEscolher?: (id: string) => void;
  expandidosNoComeco?: string[];
}) {
  const [escolhido, definirEscolhido] = useState<string | null>(null);
  return (
    <div style={{ maxWidth: '420px' }}>
      <Arvore
        rotulo="Locais"
        itens={LOCAIS}
        escolhido={escolhido}
        aoEscolher={(id) => {
          definirEscolhido(id);
          aoEscolher?.(id);
        }}
        expandidosNoComeco={expandidosNoComeco}
      />
    </div>
  );
}

const item = (canvas: HTMLElement, nome: string) =>
  within(canvas).getByRole('row', { name: new RegExp(`^${nome}`) });

export const Padrao: Historia = {
  render: () => <ArvoreDeLocais expandidosNoComeco={['jundiai', 'expedicao']} />,
};

/**
 * O indicador expande e recolhe pelo clique, sem escolher o item. O nome dele junta a ação, em
 * pt-BR qualquer que seja o idioma do navegador, ao nome da linha.
 */
export const ExpandirPeloClique: Historia = {
  args: { aoEscolher: fn() },
  render: (args) => <ArvoreDeLocais aoEscolher={args.aoEscolher} />,
  play: async ({ args, canvasElement }) => {
    const tela = within(canvasElement);
    const jundiai = item(canvasElement, 'Jundiaí');
    await expect(jundiai).toHaveAttribute('aria-expanded', 'false');
    await expect(tela.queryByRole('row', { name: /^Expedição/ })).toBeNull();
    await userEvent.click(
      within(jundiai).getByRole('button', { name: 'Expandir Jundiaí, Unidade' }),
    );
    await expect(jundiai).toHaveAttribute('aria-expanded', 'true');
    await expect(tela.getByRole('row', { name: /^Expedição/ })).toBeVisible();
    await userEvent.click(
      within(jundiai).getByRole('button', { name: 'Recolher Jundiaí, Unidade' }),
    );
    await expect(jundiai).toHaveAttribute('aria-expanded', 'false');
    await expect(args.aoEscolher).not.toHaveBeenCalled();
  },
};

/**
 * Com o foco em "Jundiaí", recolhido, a seta para a direita expande e o foco continua nele; a seta
 * para a esquerda recolhe. As setas para cima e para baixo movem o foco, sem escolher nada.
 */
export const ExpandirPeloTeclado: Historia = {
  args: { aoEscolher: fn() },
  render: (args) => <ArvoreDeLocais aoEscolher={args.aoEscolher} />,
  play: async ({ args, canvasElement }) => {
    await userEvent.tab();
    const jundiai = item(canvasElement, 'Jundiaí');
    await waitFor(() => expect(document.activeElement).toBe(jundiai));
    await userEvent.keyboard('{ArrowRight}');
    await expect(jundiai).toHaveAttribute('aria-expanded', 'true');
    await expect(document.activeElement).toBe(jundiai);
    await userEvent.keyboard('{ArrowDown}');
    await expect(document.activeElement).toBe(item(canvasElement, 'Administrativo'));
    await userEvent.keyboard('{ArrowDown}');
    await expect(document.activeElement).toBe(item(canvasElement, 'Expedição'));
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    await expect(document.activeElement).toBe(jundiai);
    await userEvent.keyboard('{ArrowLeft}');
    await expect(jundiai).toHaveAttribute('aria-expanded', 'false');
    await expect(args.aoEscolher).not.toHaveBeenCalled();
  },
};

/** Enter escolhe o item em foco, e o clique escolhe o item; o escolhido fica marcado. */
export const Escolher: Historia = {
  args: { aoEscolher: fn() },
  render: (args) => (
    <ArvoreDeLocais aoEscolher={args.aoEscolher} expandidosNoComeco={['jundiai']} />
  ),
  play: async ({ args, canvasElement }) => {
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await expect(args.aoEscolher).toHaveBeenLastCalledWith('expedicao');
    await waitFor(() =>
      expect(item(canvasElement, 'Expedição')).toHaveAttribute('aria-selected', 'true'),
    );
    await userEvent.click(within(item(canvasElement, 'Campinas')).getByText('Campinas'));
    await expect(args.aoEscolher).toHaveBeenLastCalledWith('campinas');
    await waitFor(() =>
      expect(item(canvasElement, 'Campinas')).toHaveAttribute('aria-selected', 'true'),
    );
    await expect(item(canvasElement, 'Expedição')).toHaveAttribute('aria-selected', 'false');
  },
};

/** Cada item tem o ícone, o rótulo, o detalhe e, se houver, a situação por texto. */
export const IconeDetalheESituacao: Historia = {
  render: () => <ArvoreDeLocais expandidosNoComeco={['jundiai', 'expedicao']} />,
  play: async ({ canvasElement }) => {
    const doca = item(canvasElement, 'Doca 3');
    await expect(doca).toHaveTextContent('Setor');
    await expect(within(doca).getByText('Inativo')).toBeVisible();
    await expect(doca.querySelector('svg')).not.toBeNull();
    await expect(item(canvasElement, 'Expedição')).not.toHaveTextContent('Inativo');
  },
};

/** O leitor de tela ouve o nível, a posição entre os irmãos e se o item está expandido. */
export const NivelEPosicao: Historia = {
  render: () => <ArvoreDeLocais expandidosNoComeco={['jundiai', 'administrativo']} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('treegrid', { name: 'Locais' })).toBeVisible();
    const andar = item(canvasElement, '1º andar');
    await expect(andar).toHaveAttribute('aria-level', '3');
    await expect(andar).toHaveAttribute('aria-posinset', '1');
    await expect(andar).toHaveAttribute('aria-setsize', '1');
    await expect(andar).toHaveAttribute('aria-expanded', 'false');
    const expedicao = item(canvasElement, 'Expedição');
    await expect(expedicao).toHaveAttribute('aria-level', '2');
    await expect(expedicao).toHaveAttribute('aria-posinset', '2');
    await expect(item(canvasElement, 'Campinas')).not.toHaveAttribute('aria-expanded');
  },
};

/** As linhas têm a altura da densidade, como as da tabela. */
export const AlturaDaDensidade: Historia = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--esp-4)' }}>
      {Object.keys(densidades).map((densidade) => (
        <div key={densidade} data-density={densidade} data-faixa={densidade}>
          <Arvore rotulo={`Locais (${densidade})`} itens={LOCAIS} />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const [densidade, { linha }] of Object.entries(densidades)) {
      const faixa = canvasElement.querySelector(`[data-faixa="${densidade}"]`) as HTMLElement;
      const primeira = within(faixa).getAllByRole('row')[0] as HTMLElement;
      await expect(primeira.getBoundingClientRect().height).toBe(linha);
    }
  },
};

/** Sem itens, a árvore mostra o estado vazio dado. */
export const SemItens: Historia = {
  render: () => <Arvore rotulo="Locais" itens={[]} vazio={<p>Nenhum local cadastrado.</p>} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Nenhum local cadastrado.')).toBeVisible();
  },
};
