import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { OQueResolverAgora, type PropsDoOQueResolverAgora } from './OQueResolverAgora.tsx';
import type {
  FonteDeOcorrenciasNaTela,
  OcorrenciaAberta,
  OrdenacaoDasOcorrencias,
} from './ocorrencias.ts';

/** qui 24 set 2026, 14:32 em Brasília: o "agora" das histórias, para a coluna Há sair igual. */
const AGORA = new Date('2026-09-24T17:32:00Z');
const haMinutos = (minutos: number) => new Date(AGORA.getTime() - minutos * 60_000);

/** Ocorrências de exemplo, marcadas como exemplo: o app nunca inventa ocorrências. */
const COLETA: OcorrenciaAberta = {
  id: 'coleta',
  severidade: 'critico',
  texto: 'Coleta atrasada · 3 ciclos (exemplo)',
  ativo: { nome: 'Aruba 2930F 48p', tipo: 'switch' },
  desde: haMinutos(32),
  destino: '/rede/aruba-2930f',
};
const TONER: OcorrenciaAberta = {
  id: 'toner',
  severidade: 'atencao',
  texto: 'Toner preto em 8% (exemplo)',
  ativo: { nome: 'HP LaserJet M404dn', tipo: 'impressora' },
  desde: haMinutos(60),
  destino: '/ativos/hp-m404dn',
};
const BACKUP: OcorrenciaAberta = {
  id: 'backup',
  severidade: 'atencao',
  texto: 'Backup da noite falhou (exemplo)',
  ativo: { nome: 'Control iD iDFace', tipo: 'controle-de-acesso' },
  desde: haMinutos(7 * 60),
  destino: '/ativos/idface',
};
const GARANTIA: OcorrenciaAberta = {
  id: 'garantia',
  severidade: 'info',
  texto: 'Garantia vence em 12 dias (exemplo)',
  ativo: { nome: 'Dell OptiPlex 7010', tipo: 'computador' },
  desde: haMinutos(24 * 60),
  destino: '/ativos/optiplex-7010',
};

const ATIVOS: FonteDeOcorrenciasNaTela = {
  id: 'ativos',
  modulo: 'Ativos',
  estado: { tipo: 'pronta', ocorrencias: [TONER, BACKUP, GARANTIA] },
};
const REDE: FonteDeOcorrenciasNaTela = {
  id: 'rede',
  modulo: 'Rede',
  estado: { tipo: 'pronta', ocorrencias: [COLETA] },
};

/** A tela como o Início a mostra: dentro da janela de conteúdo, com a ordem guardada. */
function Tela(props: PropsDoOQueResolverAgora) {
  const [ordenacao, definirOrdenacao] = useState<OrdenacaoDasOcorrencias>(props.ordenacao);
  return (
    <div
      style={{
        padding: 'var(--esp-6)',
        borderRadius: 'var(--raio-janela)',
        background: 'var(--cor-superficie)',
      }}
    >
      <OQueResolverAgora
        {...props}
        ordenacao={ordenacao}
        aoOrdenar={(nova) => {
          definirOrdenacao(nova);
          props.aoOrdenar(nova);
        }}
      />
    </div>
  );
}

const meta: Meta<typeof OQueResolverAgora> = {
  title: 'Início/O que resolver agora',
  component: OQueResolverAgora,
  render: (args) => <Tela {...args} />,
  args: {
    fontes: [ATIVOS, REDE],
    ordenacao: { coluna: 'severidade', direcao: 'decrescente' },
    agora: AGORA,
    aoOrdenar: fn(),
    aoAbrir: fn(),
    aoTentarDeNovo: fn(),
  },
};
export default meta;

type Historia = StoryObj<typeof OQueResolverAgora>;

const titulo = (tela: HTMLElement) => within(tela).getByRole('heading', { level: 1 });
const linhas = (tela: HTMLElement) => within(tela).getAllByRole('row').slice(1) as HTMLElement[];
const textosDaColuna = (tela: HTMLElement, coluna: number) =>
  linhas(tela).map(
    (linha) => linha.querySelectorAll('[role="gridcell"], [role="rowheader"]')[coluna]?.textContent,
  );

/**
 * As ocorrências abertas dos módulos, na ordem de fábrica: a severidade e, dentro dela, a mais
 * antiga primeiro. O título diz quantas estão abertas.
 */
export const ComOcorrencias: Historia = {
  tags: ['captura'],
  play: async ({ canvasElement }) => {
    await expect(titulo(canvasElement)).toHaveTextContent('O que resolver agora 4 abertas');
    const colunas = within(canvasElement)
      .getAllByRole('columnheader')
      .map((coluna) => coluna.textContent);
    await expect(colunas).toEqual(['Imagem', 'Ativo', 'Ocorrência', 'Há', 'Severidade']);
    await expect(textosDaColuna(canvasElement, 1)).toEqual([
      'Aruba 2930F 48p',
      'Control iD iDFace',
      'HP LaserJet M404dn',
      'Dell OptiPlex 7010',
    ]);
    await expect(textosDaColuna(canvasElement, 3)).toEqual(['32 min', '7 h', '1 h', '1 d']);
    await expect(textosDaColuna(canvasElement, 4)).toEqual([
      'Crítico',
      'Atenção',
      'Atenção',
      'Informação',
    ]);
  },
};

/** Com uma só ocorrência, o título fica no singular. */
export const UmaAberta: Historia = {
  args: { fontes: [REDE] },
  play: async ({ canvasElement }) => {
    await expect(titulo(canvasElement)).toHaveTextContent('O que resolver agora 1 aberta');
  },
};

/** O cabeçalho ordena, e a escolha vai ao app, que a grava. */
export const OrdemPeloCabecalho: Historia = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('columnheader', { name: /Ativo/ }));
    await expect(args.aoOrdenar).toHaveBeenLastCalledWith({
      coluna: 'ativo',
      direcao: 'crescente',
    });
    await expect(textosDaColuna(canvasElement, 1)).toEqual([
      'Aruba 2930F 48p',
      'Control iD iDFace',
      'Dell OptiPlex 7010',
      'HP LaserJet M404dn',
    ]);
    await userEvent.click(within(canvasElement).getByRole('columnheader', { name: /Há/ }));
    await expect(args.aoOrdenar).toHaveBeenLastCalledWith({ coluna: 'ha', direcao: 'crescente' });
    await expect(textosDaColuna(canvasElement, 3)).toEqual(['32 min', '1 h', '7 h', '1 d']);
  },
};

/** O clique e o Enter na linha abrem o registro. */
export const AbrirORegistro: Historia = {
  play: async ({ args, canvasElement }) => {
    const [primeira, segunda] = linhas(canvasElement);
    await userEvent.click(
      within(segunda as HTMLElement).getByText('Backup da noite falhou (exemplo)'),
    );
    await expect(args.aoAbrir).toHaveBeenLastCalledWith('/ativos/idface');
    (primeira as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.aoAbrir).toHaveBeenLastCalledWith('/rede/aruba-2930f');
  },
};

/** Enquanto as fontes respondem, o esqueleto fica no lugar das linhas. */
export const Carregando: Historia = {
  args: {
    fontes: [
      { ...ATIVOS, estado: { tipo: 'carregando' } },
      { ...REDE, estado: { tipo: 'carregando' } },
    ],
  },
  tags: ['captura'],
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.queryByRole('grid')).toBeNull();
    await expect(tela.getByText('Carregando ocorrências')).toBeInTheDocument();
    await expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    await expect(titulo(canvasElement)).toHaveTextContent(/^O que resolver agora$/);
  },
};

/** Uma fonte que ainda responde não esconde as ocorrências das outras. */
export const UmaFonteCarregando: Historia = {
  args: { fontes: [ATIVOS, { ...REDE, estado: { tipo: 'carregando' } }] },
  tags: ['captura'],
  play: async ({ canvasElement }) => {
    await expect(linhas(canvasElement)).toHaveLength(3);
    await expect(within(canvasElement).getByText('Carregando ocorrências')).toBeInTheDocument();
  },
};

/** A falha de uma fonte aparece com "Tentar de novo", e as ocorrências das outras continuam. */
export const FalhaDeUmaFonte: Historia = {
  args: { fontes: [ATIVOS, { ...REDE, estado: { tipo: 'erro' } }] },
  tags: ['captura'],
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(
      tela.getByText('Não foi possível carregar as ocorrências de Rede.'),
    ).toBeInTheDocument();
    await expect(tela.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
    await expect(linhas(canvasElement)).toHaveLength(3);
  },
};

/** "Tentar de novo" pede ao app a busca de novo só da fonte que falhou. */
export const TentarDeNovo: Historia = {
  args: FalhaDeUmaFonte.args,
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Tentar de novo' }));
    await expect(args.aoTentarDeNovo).toHaveBeenCalledWith('rede');
  },
};

/** Sem nenhum módulo com fonte, a tela diz isso, sem inventar ocorrências. */
export const SemFontes: Historia = {
  args: { fontes: [] },
  tags: ['captura'],
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.getByText('Nenhum módulo registra ocorrências ainda')).toBeInTheDocument();
    await expect(tela.queryByRole('grid')).toBeNull();
  },
};

/** Há fontes, e nada está aberto. */
export const NadaAberto: Historia = {
  args: {
    fontes: [
      { ...ATIVOS, estado: { tipo: 'pronta', ocorrencias: [] } },
      { ...REDE, estado: { tipo: 'pronta', ocorrencias: [] } },
    ],
  },
  tags: ['captura'],
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.getByText('Nenhuma ocorrência aberta.')).toBeInTheDocument();
    await expect(tela.queryByRole('grid')).toBeNull();
    await expect(titulo(canvasElement)).toHaveTextContent(/^O que resolver agora$/);
  },
};
