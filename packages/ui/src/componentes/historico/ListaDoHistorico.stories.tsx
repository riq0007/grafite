import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ProvedorDaRegiao } from '../../regiao/ProvedorDaRegiao.tsx';
import { type ItemDaListaDoHistorico, ListaDoHistorico } from './ListaDoHistorico.tsx';

const meta: Meta<typeof ListaDoHistorico> = {
  title: 'Componentes/Lista do histórico',
  component: ListaDoHistorico,
  // O fuso fixo: o momento de cada registro sai igual em qualquer máquina.
  decorators: [
    (Historia) => (
      <ProvedorDaRegiao fuso="America/Sao_Paulo">
        <Historia />
      </ProvedorDaRegiao>
    ),
  ],
};
export default meta;

type Historia = StoryObj<typeof ListaDoHistorico>;

const ITENS: ItemDaListaDoHistorico[] = [
  {
    id: 'r3',
    acao: 'Ativo alterado',
    quem: 'Ana Souza',
    momento: new Date('2026-10-07T17:32:00.000Z'),
    mudancas: [
      { campo: 'Local', antes: 'Jundiaí › Almoxarifado', depois: 'Jundiaí › Expedição' },
      { campo: 'IP', antes: null, depois: '10.0.0.5' },
    ],
    travas: { ligadas: ['Local'], desligadas: ['Hostname'] },
  },
  {
    id: 'r2',
    acao: 'Ligação feita',
    quem: 'Bruno Costa',
    momento: new Date('2026-10-06T12:05:00.000Z'),
    detalhe: 'Com Nobreak do rack',
  },
  {
    id: 'r1',
    acao: 'Ativo cadastrado',
    quem: 'Ana Souza',
    momento: new Date('2026-10-01T11:00:00.000Z'),
    mudancas: [
      { campo: 'Nome', antes: null, depois: 'Impressora da expedição' },
      { campo: 'Contrato', antes: 'CT-12', depois: null },
    ],
  },
];

/** Os registros com a ação, quem fez, quando, as mudanças, as travas e o detalhe. */
export const ComMudancas: Historia = {
  tags: ['captura'],
  args: { rotulo: 'Histórico do ativo', itens: ITENS },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const lista = tela.getByRole('list', { name: 'Histórico do ativo' });
    const registros = within(lista)
      .getAllByRole('listitem')
      .filter((item) => item.parentElement === lista);
    await expect(registros).toHaveLength(3);
    const [alterado, ligado, cadastrado] = registros as [HTMLElement, HTMLElement, HTMLElement];
    await expect(alterado).toHaveTextContent('Ativo alterado');
    await expect(alterado).toHaveTextContent('07/10/2026 14:32 · Ana Souza');
    await expect(alterado).toHaveTextContent('Local: Jundiaí › Almoxarifado → Jundiaí › Expedição');
    await expect(alterado).toHaveTextContent('IP: — → 10.0.0.5');
    await expect(alterado).toHaveTextContent('Travado: Local');
    await expect(alterado).toHaveTextContent('Destravado: Hostname');
    await expect(ligado).toHaveTextContent('Com Nobreak do rack');
    await expect(cadastrado).toHaveTextContent('Contrato: CT-12 → —');
    await expect(tela.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  },
};

/** Sem registros: o texto do vazio. */
export const Vazia: Historia = {
  args: { rotulo: 'Histórico do ativo', itens: [], vazio: 'Nenhum registro deste ativo.' },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.getByText('Nenhum registro deste ativo.')).toBeInTheDocument();
    await expect(tela.queryByRole('list')).toBeNull();
  },
};

/** Com mais registros: "Carregar mais", que mostra o carregamento enquanto busca. */
export const CarregarMais: Historia = {
  args: { rotulo: 'Histórico do ativo', itens: ITENS, aoCarregarMais: fn() },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Carregar mais' }));
    await expect(args.aoCarregarMais).toHaveBeenCalledOnce();
  },
};

/** Enquanto carrega mais, o botão não aciona de novo. */
export const CarregandoMais: Historia = {
  args: {
    rotulo: 'Histórico do ativo',
    itens: ITENS,
    aoCarregarMais: fn(),
    carregandoMais: true,
  },
  play: async ({ args, canvasElement }) => {
    const botao = within(canvasElement).getByRole('button', { name: /Carregar mais/ });
    await expect(botao).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(botao);
    await expect(args.aoCarregarMais).not.toHaveBeenCalled();
  },
};
