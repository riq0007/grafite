import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { type LinhaDaPrevia, PreviaDaImportacao } from './PreviaDaImportacao.tsx';

const meta: Meta<typeof PreviaDaImportacao> = {
  title: 'Componentes/Prévia da importação',
  component: PreviaDaImportacao,
  args: { rotulo: 'Prévia da importação' },
};
export default meta;

type Historia = StoryObj<typeof PreviaDaImportacao>;

const LINHAS: LinhaDaPrevia[] = [
  {
    linha: 2,
    acao: { rotulo: 'Alterar', situacao: 'info' },
    ativo: 'HP LaserJet M404 · PAT-00412',
    mudancas: [
      { campo: 'Local', antes: 'Jundiaí › Almoxarifado', depois: 'Jundiaí › Expedição' },
      { campo: 'Responsável', antes: null, depois: 'João Silva' },
    ],
    seguros: [
      { campo: 'Hostname', motivo: 'Travado' },
      { campo: 'Tombamento', motivo: 'Só manual' },
    ],
    erros: [],
  },
  {
    linha: 3,
    acao: { rotulo: 'Novo', situacao: 'sucesso' },
    mudancas: [
      { campo: 'Patrimônio', antes: null, depois: 'PAT-00902' },
      { campo: 'Local', antes: null, depois: 'Jundiaí › Almoxarifado' },
    ],
    seguros: [],
    erros: [],
  },
  {
    linha: 4,
    acao: { rotulo: 'Com erro', situacao: 'critico' },
    mudancas: [],
    seguros: [],
    erros: [
      { campo: 'IP', mensagem: 'Use um IP, como 192.168.0.10.' },
      {
        campo: 'Local',
        mensagem: 'Há mais de um local Expedição: use o caminho, como Jundiaí › Expedição.',
      },
    ],
  },
  {
    linha: 5,
    acao: { rotulo: 'Com erro', situacao: 'critico' },
    mudancas: [],
    seguros: [],
    erros: [{ campo: null, mensagem: 'Você não edita ativos em Campinas.' }],
  },
  {
    linha: 6,
    acao: { rotulo: 'Sem mudança', situacao: 'neutra' },
    ativo: 'Impressora · PAT-00413',
    mudancas: [],
    seguros: [],
    erros: [],
  },
];

/** As linhas de cada ação, como a prévia mostra. */
export const Padrao: Historia = { args: { linhas: LINHAS } };

/** Sem linhas, como o filtro "Com erro" numa planilha sem erros. */
export const Vazia: Historia = { args: { linhas: [], vazio: 'Nenhuma linha com erro.' } };

/**
 * Cada linha diz o número dela na planilha, a ação em texto, o ativo, o "antes → depois" de cada
 * campo, os campos que ficam como estão e os erros, pelo campo.
 */
export const ConteudoDasLinhas: Historia = {
  args: { linhas: LINHAS },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const lista = tela.getByRole('list', { name: 'Prévia da importação' });
    const linhas = within(lista).getAllByRole('listitem', { name: /^Linha/ });
    await expect(linhas).toHaveLength(5);

    const alterar = within(linhas[0] as HTMLElement);
    await expect(linhas[0]).toHaveAccessibleName('Linha 2');
    await expect(alterar.getByText('Alterar')).toBeInTheDocument();
    await expect(alterar.getByText('HP LaserJet M404 · PAT-00412')).toBeInTheDocument();
    await expect(linhas[0]).toHaveTextContent(
      'Local: Jundiaí › Almoxarifado → Jundiaí › Expedição',
    );
    await expect(linhas[0]).toHaveTextContent('Responsável: — → João Silva');
    await expect(linhas[0]).toHaveTextContent('Travado: Hostname');
    await expect(linhas[0]).toHaveTextContent('Só manual: Tombamento');

    await expect(linhas[2]).toHaveTextContent('IP: Use um IP, como 192.168.0.10.');
    await expect(linhas[3]).toHaveTextContent('Você não edita ativos em Campinas.');
    await expect(linhas[4]).toHaveTextContent('Sem mudança');
  },
};

/** Com mais linhas, "Carregar mais" depois da lista. */
export const CarregarMais: Historia = {
  args: { linhas: LINHAS.slice(0, 2), aoCarregarMais: fn() },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Carregar mais' }));
    await expect(args.aoCarregarMais).toHaveBeenCalledOnce();
  },
};
