import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ProvedorDaRegiao } from '../regiao/ProvedorDaRegiao.tsx';
import { comTelaPorTras } from '../teste/tela.tsx';
import {
  CentralDeNotificacoes,
  type NotificacaoDaCentral,
  type PropsDaCentralDeNotificacoes,
} from './CentralDeNotificacoes.tsx';
import { SinoDeNotificacoes } from './ItensDaBarra.tsx';

/** qui 24 set 2026, 14:32: o "agora" das histórias, para os grupos por dia saírem sempre iguais. */
const AGORA = new Date(2026, 8, 24, 14, 32);

/** Notificações de exemplo, marcadas como exemplo: o app nunca inventa notificações. */
const NOTIFICACOES_DE_EXEMPLO: readonly NotificacaoDaCentral[] = [
  {
    id: 'n1',
    severidade: 'critico',
    titulo: 'Switch do CPD sem resposta (exemplo)',
    descricao: 'Aruba 2930F · Rack A',
    origem: 'Rede',
    momento: new Date(2026, 8, 24, 14, 2),
    lida: false,
    temDestino: true,
    podeReconhecer: true,
    podeAdiar: true,
  },
  {
    id: 'n2',
    severidade: 'atencao',
    titulo: 'Toner abaixo de 10% (exemplo)',
    descricao: 'HP LaserJet M404dn · Almoxarifado',
    origem: 'Ativos',
    momento: new Date(2026, 8, 24, 9, 15),
    lida: false,
    temDestino: true,
  },
  {
    id: 'n3',
    severidade: 'info',
    titulo: 'Backup do Control iD concluído (exemplo)',
    origem: 'Control iD',
    momento: new Date(2026, 8, 23, 2, 0),
    lida: true,
    temDestino: false,
  },
];

const meta: Meta<typeof CentralDeNotificacoes> = {
  title: 'Casca/Central de notificações',
  component: CentralDeNotificacoes,
  args: {
    aberta: true,
    aoMudarAberta: fn(),
    notificacoes: NOTIFICACOES_DE_EXEMPLO,
    agora: AGORA,
    aoAbrir: fn(),
    aoMarcarComoLida: fn(),
    aoMarcarTodasComoLidas: fn(),
    aoReconhecer: fn(),
    aoAdiar: fn(),
  },
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Historia = StoryObj<typeof CentralDeNotificacoes>;

const corpo = () => within(document.body);
const central = () => corpo().findByRole('dialog', { name: 'Notificações' });

/** A central aberta sobre a tela, com notificações de exemplo, para a captura de referência. */
export const ComItens: Historia = { decorators: [comTelaPorTras] };

/** A lista, da mais recente para a mais antiga, em grupos por dia. */
export const Lista: Historia = {
  play: async () => {
    const dialogo = await central();
    const grupos = within(dialogo).getAllByRole('heading', { level: 3 });
    await expect(grupos.map((grupo) => grupo.textContent)).toEqual(['Hoje', 'Ontem']);
    const itens = within(dialogo).getAllByRole('listitem');
    await expect(itens).toHaveLength(3);
    const primeiro = within(itens[0] as HTMLElement);
    await expect(primeiro.getByText('Crítico')).toBeInTheDocument();
    await expect(primeiro.getByText('Switch do CPD sem resposta (exemplo)')).toBeInTheDocument();
    await expect(primeiro.getByText('Aruba 2930F · Rack A')).toBeInTheDocument();
    await expect(primeiro.getByText('Rede')).toBeInTheDocument();
    await expect(primeiro.getByText('14:02')).toBeInTheDocument();
    await expect(primeiro.getByText('Não lida')).toBeInTheDocument();
    await expect(within(itens[2] as HTMLElement).queryByText('Não lida')).toBeNull();
  },
};

const noAcre: Decorator = (Historia) => (
  <ProvedorDaRegiao fuso="America/Rio_Branco">
    <Historia />
  </ProvedorDaRegiao>
);

/** No Acre: 20:00 e 00:30 do dia 24, e 23:30 do dia 23. */
const MOMENTOS_NO_ACRE = ['2026-09-25T01:00:00Z', '2026-09-24T05:30:00Z', '2026-09-24T04:30:00Z'];

/**
 * No fuso escolhido, e não no do navegador: são 23:30 de 24 de setembro no Acre (01:30 do dia 25
 * em Brasília e 04:30 em UTC), e a notificação das 00:30 do dia 24 no Acre é de "Hoje".
 */
export const NoFusoEscolhido: Historia = {
  decorators: [noAcre],
  args: {
    agora: new Date('2026-09-25T04:30:00Z'),
    notificacoes: NOTIFICACOES_DE_EXEMPLO.map((notificacao, indice) => ({
      ...notificacao,
      momento: new Date(MOMENTOS_NO_ACRE[indice] as string),
    })),
  },
  play: async () => {
    const dialogo = await central();
    const grupos = within(dialogo).getAllByRole('region') as HTMLElement[];
    const conteudo = (grupo: HTMLElement) => ({
      dia: within(grupo).getByRole('heading', { level: 3 }).textContent,
      horarios: within(grupo)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('time')?.textContent),
    });
    await expect(grupos.map(conteudo)).toEqual([
      { dia: 'Hoje', horarios: ['20:00', '00:30'] },
      { dia: 'Ontem', horarios: ['23:30'] },
    ]);
  },
};

/** Sem notificações, a central diz isso com todas as letras. */
export const Vazia: Historia = {
  args: { notificacoes: [] },
  play: async () => {
    const dialogo = await central();
    await waitFor(() => expect(within(dialogo).getByText('Nenhuma notificação.')).toBeVisible());
  },
};

/** O sino ligado à central, como a casca faz. */
function SinoECentral(props: PropsDaCentralDeNotificacoes) {
  const [aberta, definirAberta] = useState(false);
  return (
    <>
      <SinoDeNotificacoes naoLidas={2} aoAbrir={() => definirAberta(true)} />
      <CentralDeNotificacoes {...props} aberta={aberta} aoMudarAberta={definirAberta} />
    </>
  );
}

/** A central prende o foco; Esc fecha e devolve o foco ao sino. */
export const FocoPresoEEsc: Historia = {
  render: (args) => <SinoECentral {...args} />,
  play: async ({ canvasElement }) => {
    const sino = within(canvasElement).getByRole('button', { name: 'Notificações, 2 não lidas' });
    await userEvent.click(sino);
    const dialogo = await central();
    for (let i = 0; i < 12; i++) {
      await userEvent.tab();
      await expect(dialogo.contains(document.activeElement)).toBe(true);
    }
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpo().queryByRole('dialog', { name: 'Notificações' })).toBeNull());
    await waitFor(() => expect(sino).toHaveFocus());
  },
};

const noCelular: Decorator = (Historia) => {
  document.documentElement.setAttribute('data-postura', 'celular');
  return <Historia />;
};

/** No celular, a central ocupa a largura da tela, sem rolagem horizontal. */
export const NoCelular: Historia = {
  decorators: [noCelular],
  globals: { viewport: { value: 'celular390' } },
  play: async () => {
    const dialogo = await central();
    const gaveta = dialogo.parentElement as HTMLElement;
    await waitFor(() =>
      expect(Math.round(gaveta.getBoundingClientRect().width)).toBe(window.innerWidth),
    );
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    document.documentElement.removeAttribute('data-postura');
  },
};

const itensDa = (dialogo: HTMLElement) =>
  within(dialogo)
    .queryAllByRole('listitem')
    .map((item) => within(item).getByText(/\(exemplo\)/).textContent);

/** O filtro de severidade vale na hora. */
export const FiltroPorSeveridade: Historia = {
  play: async () => {
    const dialogo = await central();
    await userEvent.click(within(dialogo).getByRole('radio', { name: 'Crítico' }));
    await expect(itensDa(dialogo)).toEqual(['Switch do CPD sem resposta (exemplo)']);
    await userEvent.click(within(dialogo).getByRole('radio', { name: 'Todas' }));
    await expect(itensDa(dialogo)).toHaveLength(3);
  },
};

/** "Só não lidas" tira da lista as que já foram lidas. */
export const SoNaoLidas: Historia = {
  play: async () => {
    const dialogo = await central();
    await userEvent.click(within(dialogo).getByRole('switch', { name: 'Só não lidas' }));
    await expect(itensDa(dialogo)).toEqual([
      'Switch do CPD sem resposta (exemplo)',
      'Toner abaixo de 10% (exemplo)',
    ]);
  },
};

/** Quando os filtros não deixam nenhuma, a central diz isso e oferece limpar os filtros. */
export const FiltrosSemResultado: Historia = {
  args: { notificacoes: NOTIFICACOES_DE_EXEMPLO.filter((notificacao) => notificacao.lida) },
  play: async () => {
    const dialogo = await central();
    await userEvent.click(within(dialogo).getByRole('switch', { name: 'Só não lidas' }));
    await waitFor(() =>
      expect(within(dialogo).getByText('Nenhuma notificação com esses filtros.')).toBeVisible(),
    );
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Limpar filtros' }));
    await expect(itensDa(dialogo)).toEqual(['Backup do Control iD concluído (exemplo)']);
    await expect(within(dialogo).getByRole('switch', { name: 'Só não lidas' })).not.toBeChecked();
  },
};

/** Os filtros valem enquanto a central está aberta: ao reabrir, voltam a "Todas". */
export const FiltrosVoltamAoReabrir: Historia = {
  render: (args) => <SinoECentral {...args} />,
  play: async ({ canvasElement }) => {
    const sino = within(canvasElement).getByRole('button', { name: 'Notificações, 2 não lidas' });
    await userEvent.click(sino);
    let dialogo = await central();
    await userEvent.click(within(dialogo).getByRole('radio', { name: 'Atenção' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpo().queryByRole('dialog', { name: 'Notificações' })).toBeNull());
    await userEvent.click(sino);
    dialogo = await central();
    await expect(within(dialogo).getByRole('radio', { name: 'Todas' })).toBeChecked();
    await expect(itensDa(dialogo)).toHaveLength(3);
  },
};

/** As ações de cada notificação e a de marcar todas como lidas. */
export const Acoes: Historia = {
  play: async ({ args }) => {
    const dialogo = await central();
    const [critica, deAtencao, lida] = within(dialogo).getAllByRole('listitem') as HTMLElement[];
    await userEvent.click(
      within(deAtencao as HTMLElement).getByRole('button', { name: 'Marcar como lida' }),
    );
    await expect(args.aoMarcarComoLida).toHaveBeenCalledWith('n2');
    await userEvent.click(
      within(critica as HTMLElement).getByRole('button', { name: 'Reconhecer' }),
    );
    await expect(args.aoReconhecer).toHaveBeenCalledWith('n1');
    await userEvent.click(within(critica as HTMLElement).getByRole('button', { name: 'Adiar' }));
    await expect(args.aoAdiar).toHaveBeenCalledWith('n1');
    await expect(
      within(lida as HTMLElement).queryByRole('button', { name: 'Marcar como lida' }),
    ).toBeNull();
    await expect(within(lida as HTMLElement).queryByRole('button', { name: 'Abrir' })).toBeNull();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Marcar todas como lidas' }));
    await expect(args.aoMarcarTodasComoLidas).toHaveBeenCalledOnce();
    await userEvent.click(within(critica as HTMLElement).getByRole('button', { name: 'Abrir' }));
    await expect(args.aoAbrir).toHaveBeenCalledWith('n1');
    await expect(args.aoMudarAberta).toHaveBeenCalledWith(false);
  },
};

/**
 * Com os filtros de quem usa a central, como o servidor que filtra: escolher um filtro avisa a
 * mudança, e a lista mostra só o que veio.
 */
export const FiltrosNoServidor: Historia = {
  args: { filtros: { severidade: 'todas', soNaoLidas: false }, aoMudarFiltros: fn() },
  play: async ({ args }) => {
    const dialogo = await central();
    await userEvent.click(within(dialogo).getByRole('radio', { name: 'Crítico' }));
    await expect(args.aoMudarFiltros).toHaveBeenCalledWith({
      severidade: 'critico',
      soNaoLidas: false,
    });
    await userEvent.click(within(dialogo).getByRole('switch', { name: 'Só não lidas' }));
    await expect(args.aoMudarFiltros).toHaveBeenLastCalledWith({
      severidade: 'todas',
      soNaoLidas: true,
    });
    // Quem filtra é o servidor: a central mostra o que recebeu.
    await expect(within(dialogo).getAllByRole('listitem')).toHaveLength(3);
  },
};

/** Ao fim da lista, "Carregar mais" traz a página seguinte. */
export const CarregarMais: Historia = {
  args: { temMais: true, aoCarregarMais: fn() },
  play: async ({ args }) => {
    const dialogo = await central();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Carregar mais' }));
    await expect(args.aoCarregarMais).toHaveBeenCalled();
  },
};

/** Sem resposta do servidor, a central diz isso e oferece "Tentar de novo". */
export const ErroAoCarregar: Historia = {
  args: {
    notificacoes: [],
    erro: 'Não foi possível carregar as notificações.',
    aoTentarDeNovo: fn(),
  },
  play: async ({ args }) => {
    const dialogo = await central();
    await waitFor(() =>
      expect(within(dialogo).getByText('Não foi possível carregar as notificações.')).toBeVisible(),
    );
    await expect(within(dialogo).queryByText('Nenhuma notificação.')).toBeNull();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Tentar de novo' }));
    await expect(args.aoTentarDeNovo).toHaveBeenCalledOnce();
  },
};

/** O modo Foco na central: o interruptor liga e desliga. */
export const ModoFoco: Historia = {
  args: { foco: false, aoMudarFoco: fn() },
  play: async ({ args }) => {
    const dialogo = await central();
    const interruptor = within(dialogo).getByRole('switch', { name: /Modo Foco/ });
    await expect(interruptor).not.toBeChecked();
    await userEvent.click(interruptor);
    await expect(args.aoMudarFoco).toHaveBeenCalledWith(true);
  },
};

/**
 * A situação do alerta em texto, sem as ações depois de tratado; e o adiar com o tempo no rótulo,
 * enquanto o alerta pede ação.
 */
export const SituacaoDoAlerta: Historia = {
  args: {
    notificacoes: [
      {
        id: 'tratada',
        severidade: 'critico',
        titulo: 'Black Toner Cartridge em 8% (exemplo)',
        origem: 'Alertas',
        momento: new Date(2026, 8, 24, 14, 10),
        lida: false,
        temDestino: true,
        situacaoDoAlerta: 'Reconhecido por Ana Souza',
      },
      {
        id: 'aberta',
        severidade: 'critico',
        titulo: 'Coletor sem contato (exemplo)',
        origem: 'Alertas',
        momento: new Date(2026, 8, 24, 14, 20),
        lida: false,
        temDestino: true,
        podeReconhecer: true,
        podeAdiar: true,
        rotuloDoAdiar: 'Adiar 15 min',
      },
    ],
  },
  play: async ({ args }) => {
    const dialogo = await central();
    // Da mais recente para a mais antiga: a aberta, das 14:20, vem antes da tratada.
    const [aberta, tratada] = within(dialogo).getAllByRole('listitem') as HTMLElement[];
    await expect(tratada).toHaveTextContent('Reconhecido por Ana Souza');
    await expect(
      within(tratada as HTMLElement).queryByRole('button', { name: 'Reconhecer' }),
    ).toBeNull();
    await userEvent.click(
      within(aberta as HTMLElement).getByRole('button', { name: 'Adiar 15 min' }),
    );
    await expect(args.aoAdiar).toHaveBeenCalledWith('aberta');
  },
};

/** A contagem do servidor decide "Marcar todas como lidas", também com as lidas à vista. */
export const MarcarTodasPelaContagem: Historia = {
  args: {
    notificacoes: NOTIFICACOES_DE_EXEMPLO.map((notificacao) => ({ ...notificacao, lida: true })),
    naoLidas: 130,
  },
  play: async () => {
    const dialogo = await central();
    await expect(
      within(dialogo).getByRole('button', { name: 'Marcar todas como lidas' }),
    ).toBeEnabled();
  },
};

/** Sem não lidas, "Marcar todas como lidas" fica desabilitado. */
export const TodasLidas: Historia = {
  args: {
    notificacoes: NOTIFICACOES_DE_EXEMPLO.map((notificacao) => ({ ...notificacao, lida: true })),
  },
  play: async () => {
    const dialogo = await central();
    await expect(
      within(dialogo).getByRole('button', { name: 'Marcar todas como lidas' }),
    ).toBeDisabled();
  },
};
