import type { Meta, StoryObj } from '@storybook/react-vite';
import { Building2, DoorOpen, MapPin } from 'lucide-react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { ItemDaArvore } from '../componentes/arvore/Arvore.tsx';
import { OpcoesDoBloco } from './OpcoesDoBloco.tsx';
import type { OpcaoDoBloco } from './opcaoDoBloco.ts';

// As opções do bloco "Suprimentos que acabam primeiro", como o Ativos as declara: só exemplo.
const OPCOES: OpcaoDoBloco[] = [
  {
    chave: 'tipos',
    rotulo: 'Tipos de suprimento',
    forma: 'escolhas',
    opcoes: [
      { id: 'toner', rotulo: 'Toner' },
      { id: 'cilindro', rotulo: 'Cilindro' },
      { id: 'fusor', rotulo: 'Fusor' },
      { id: 'outro', rotulo: 'Outros' },
    ],
    padrao: ['toner', 'cilindro', 'fusor', 'outro'],
    minimo: 1,
  },
  { chave: 'locais', rotulo: 'Locais', forma: 'locais' },
  { chave: 'limite', rotulo: 'Impressoras', forma: 'numero', minimo: 3, maximo: 12, padrao: 6 },
  {
    chave: 'nivel',
    rotulo: 'Nível até',
    forma: 'numero',
    minimo: 5,
    maximo: 100,
    passo: 5,
    unidade: '%',
    padrao: 100,
  },
];

const LOCAIS: ItemDaArvore[] = [
  {
    id: 'jundiai',
    rotulo: 'Jundiaí',
    icone: MapPin,
    filhos: [
      { id: 'jundiai-rh', rotulo: 'RH', icone: DoorOpen },
      { id: 'jundiai-ti', rotulo: 'TI', icone: DoorOpen },
    ],
  },
  {
    id: 'campinas',
    rotulo: 'Campinas',
    icone: Building2,
    filhos: [{ id: 'campinas-expedicao', rotulo: 'Expedição', icone: DoorOpen }],
  },
];

const DE_FABRICA = {
  tipos: ['toner', 'cilindro', 'fusor', 'outro'],
  locais: [],
  limite: 6,
  nivel: 100,
};

const meta: Meta<typeof OpcoesDoBloco> = {
  title: 'Início/Opções do bloco',
  component: OpcoesDoBloco,
  args: {
    bloco: 'Suprimentos que acabam primeiro',
    opcoes: OPCOES,
    valores: DE_FABRICA,
    locais: LOCAIS,
    aberta: true,
    aoMudarAberta: fn(),
    aoMudar: fn(),
    aoRestaurar: fn(),
  },
};
export default meta;

type Historia = StoryObj<typeof OpcoesDoBloco>;

const gaveta = () =>
  within(document.body).findByRole('dialog', {
    name: 'Opções de Suprimentos que acabam primeiro',
  });

/**
 * A gaveta com as opções de fábrica: um controle por forma, com o nome de cada opção, e "Restaurar
 * as opções". A função só confere a gaveta como abriu: a captura a mostra assim.
 */
export const DeFabrica: Historia = {
  tags: ['captura'],
  play: async () => {
    const painel = within(await gaveta());
    const tipos = within(painel.getByRole('group', { name: 'Tipos de suprimento' }));
    await expect(
      tipos.getAllByRole('checkbox').map((caixa) => (caixa as HTMLInputElement).checked),
    ).toEqual([true, true, true, true]);
    // A gaveta entra deslizando: o texto fica à vista no fim da entrada.
    await waitFor(() => expect(painel.getByText('Todos os locais.')).toBeVisible());
    await expect(painel.getByRole('slider', { name: 'Impressoras' })).toHaveAttribute(
      'aria-valuetext',
      '6',
    );
    await expect(painel.getByRole('slider', { name: 'Nível até' })).toHaveAttribute(
      'aria-valuetext',
      '100%',
    );
    await expect(painel.getByRole('button', { name: 'Restaurar as opções' })).toBeVisible();
  },
};

/** Desmarcar um tipo entrega a escolha nova, na ordem em que o bloco declara os tipos. */
export const DesmarcarUmTipo: Historia = {
  play: async ({ args }) => {
    const painel = within(await gaveta());
    await userEvent.click(painel.getByRole('checkbox', { name: 'Fusor' }));
    await expect(args.aoMudar).toHaveBeenCalledWith('tipos', ['toner', 'cilindro', 'outro']);
  },
};

/**
 * Com o mínimo de um, a última caixa marcada fica desabilitada, e a explicação diz por quê, ligada
 * ao grupo para o leitor de tela. Marcar outra entrega as duas, na ordem do bloco.
 */
export const UltimaCaixaMarcada: Historia = {
  tags: ['captura'],
  args: { valores: { ...DE_FABRICA, tipos: ['fusor'], nivel: 30 } },
  play: async ({ args }) => {
    const painel = within(await gaveta());
    const grupo = painel.getByRole('group', { name: 'Tipos de suprimento' });
    const fusor = painel.getByRole('checkbox', { name: 'Fusor' });
    await expect(fusor).toBeChecked();
    await expect(fusor).toBeDisabled();
    const explicacao = painel.getByText('Pelo menos um fica escolhido.');
    await expect(grupo.getAttribute('aria-describedby')?.split(' ')).toContain(explicacao.id);
    await userEvent.click(painel.getByRole('checkbox', { name: 'Toner' }));
    await expect(args.aoMudar).toHaveBeenCalledWith('tipos', ['toner', 'fusor']);
  },
};

/** O número anda pelo teclado, no passo que a opção declara, e o valor fica à vista com a unidade. */
export const MudarONumero: Historia = {
  play: async ({ args }) => {
    const painel = within(await gaveta());
    const nivel = painel.getByRole('slider', { name: 'Nível até' });
    nivel.focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(args.aoMudar).toHaveBeenCalledWith('nivel', 95);
    const impressoras = painel.getByRole('slider', { name: 'Impressoras' });
    impressoras.focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(args.aoMudar).toHaveBeenCalledWith('limite', 7);
  },
};

/** Os locais escolhidos aparecem com o caminho, cada um com "Tirar", que entrega os que ficam. */
export const LocaisEscolhidos: Historia = {
  tags: ['captura'],
  args: { valores: { ...DE_FABRICA, locais: ['jundiai', 'campinas-expedicao'] } },
  play: async ({ args }) => {
    const painel = within(await gaveta());
    const lista = within(painel.getByRole('list', { name: 'Locais' }));
    await expect(lista.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'JundiaíTirar',
      'Campinas › ExpediçãoTirar',
    ]);
    await expect(painel.queryByText('Todos os locais.')).toBeNull();
    await userEvent.click(lista.getByRole('button', { name: 'Tirar Jundiaí' }));
    await expect(args.aoMudar).toHaveBeenCalledWith('locais', ['campinas-expedicao']);
  },
};

/** A escolha em árvore acrescenta um local aos escolhidos, sem oferecer de novo os que já estão. */
export const AcrescentarUmLocal: Historia = {
  args: { valores: { ...DE_FABRICA, locais: ['jundiai'] } },
  play: async ({ args }) => {
    const painel = within(await gaveta());
    await userEvent.click(painel.getByRole('button', { name: /Acrescentar um local/ }));
    const escolha = await within(document.body).findByRole('dialog', {
      name: 'Acrescentar um local',
    });
    await waitFor(() =>
      expect(
        within(escolha).getByRole('row', { name: /^Jundiaí.*não pode ser escolhido/ }),
      ).toBeVisible(),
    );
    await userEvent.click(within(escolha).getByRole('row', { name: /^Campinas/ }));
    await waitFor(() =>
      expect(args.aoMudar).toHaveBeenCalledWith('locais', ['jundiai', 'campinas']),
    );
  },
};

/** "Restaurar as opções" pede a volta de todas às de fábrica. */
export const RestaurarAsOpcoes: Historia = {
  args: { valores: { ...DE_FABRICA, tipos: ['toner'], nivel: 30 } },
  play: async ({ args }) => {
    const painel = within(await gaveta());
    await userEvent.click(painel.getByRole('button', { name: 'Restaurar as opções' }));
    await expect(args.aoRestaurar).toHaveBeenCalled();
  },
};

/** Sem os locais, enquanto eles não chegam, a escolha de local espera, e o resto funciona. */
export const SemOsLocais: Historia = {
  args: { locais: undefined },
  play: async () => {
    const painel = within(await gaveta());
    await expect(painel.getByRole('button', { name: /Acrescentar um local/ })).toBeDisabled();
    await expect(painel.getByRole('checkbox', { name: 'Toner' })).toBeEnabled();
  },
};
