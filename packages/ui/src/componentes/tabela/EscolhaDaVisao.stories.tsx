import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  EscolhaDaVisao,
  type PropsDaEscolhaDaVisao,
  type VisaoDaEscolha,
} from './EscolhaDaVisao.tsx';

const meta: Meta = { title: 'Componentes/Escolha da visão' };
export default meta;

type Acoes = Pick<
  PropsDaEscolhaDaVisao,
  | 'aoEscolher'
  | 'aoSalvarNaOrganizacao'
  | 'aoSalvarComoNova'
  | 'aoDuplicar'
  | 'aoRestaurar'
  | 'aoVoltar'
  | 'aoRenomear'
  | 'aoRemover'
  | 'aoUsarComoPadrao'
  | 'aoFixar'
  | 'aoDesafixar'
  | 'aoFixarParaTodos'
  | 'aoDesafixarParaTodos'
>;

type Historia = StoryObj<Partial<Acoes>>;

const VISOES: VisaoDaEscolha[] = [
  { id: 'fabrica', nome: 'Todos os ativos', origem: 'fabrica' },
  { id: 'impressoras', nome: 'Impressoras de Jundiaí', origem: 'organizacao' },
  { id: 'em-uso', nome: 'Equipamentos em uso', origem: 'organizacao' },
  { id: 'switches', nome: 'Switches', origem: 'conta' },
  { id: 'notebooks', nome: 'Meus notebooks', origem: 'conta' },
];

const semAcao = () => {};

function Escolha(props: Partial<PropsDaEscolhaDaVisao> & Pick<PropsDaEscolhaDaVisao, 'aberta'>) {
  return (
    <EscolhaDaVisao
      visoes={VISOES}
      estado="salva"
      podeEditarAOrganizacao={false}
      aoEscolher={semAcao}
      aoSalvarNaOrganizacao={semAcao}
      aoSalvarComoNova={semAcao}
      aoDuplicar={semAcao}
      aoRestaurar={semAcao}
      aoVoltar={semAcao}
      aoRenomear={semAcao}
      aoRemover={semAcao}
      aoUsarComoPadrao={semAcao}
      {...props}
    />
  );
}

/** Abre o menu pelo botão: o React Aria dá ao menu o nome do botão. */
const abrir = async (canvas: HTMLElement) => {
  await userEvent.click(within(canvas).getByRole('button', { name: /^Visão/ }));
  return within(document.body).findByRole('menu', { name: /^Visão/ });
};

const acoes = (menu: HTMLElement) =>
  within(within(menu).getByRole('group', { name: 'Ações da visão' }))
    .getAllByRole('menuitem')
    .map((item) => item.textContent);

/** A visão personalizada pela conta, com "Personalizada" em texto ao lado do nome. */
export const Personalizada: Historia = {
  tags: ['captura'],
  render: () => <Escolha aberta="impressoras" estado="personalizada" />,
  play: async ({ canvasElement }) => {
    const botao = within(canvasElement).getByRole('button', { name: /^Visão/ });
    await expect(botao).toHaveTextContent('Impressoras de Jundiaí');
    await expect(within(botao).getByText('Personalizada')).toBeVisible();
    await expect(botao).toHaveAccessibleName('Visão Impressoras de Jundiaí, personalizada');
  },
};

/** A tabela que veio de um link, com "Do link" em texto ao lado do nome. */
export const DoLink: Historia = {
  tags: ['captura'],
  render: () => <Escolha aberta="impressoras" estado="do-link" />,
  play: async ({ canvasElement }) => {
    const botao = within(canvasElement).getByRole('button', { name: /^Visão/ });
    await expect(within(botao).getByText('Do link')).toBeVisible();
    await expect(botao).toHaveAccessibleName('Visão Impressoras de Jundiaí, do link');
  },
};

/** A visão salva mostra só o nome. */
export const Salva: Historia = {
  render: () => <Escolha aberta="impressoras" />,
  play: async ({ canvasElement }) => {
    const botao = within(canvasElement).getByRole('button', { name: /^Visão/ });
    await expect(botao).toHaveAccessibleName('Visão Impressoras de Jundiaí');
    await expect(within(botao).queryByText('Personalizada')).toBeNull();
  },
};

/** O menu: a de fábrica, "Da organização" e "Minhas visões", com a aberta marcada. */
export const SecoesDoMenu: Historia = {
  render: () => <Escolha aberta="em-uso" />,
  play: async ({ canvasElement }) => {
    const menu = await abrir(canvasElement);
    const nomes = (rotulo: string) =>
      within(within(menu).getByRole('group', { name: rotulo }))
        .getAllByRole('menuitemradio')
        .map((item) => item.getAttribute('aria-label') ?? item.textContent);
    await expect(nomes('Visão de fábrica')).toEqual(['Todos os ativos']);
    await expect(nomes('Da organização')).toEqual([
      'Impressoras de Jundiaí',
      'Equipamentos em uso',
    ]);
    await expect(nomes('Minhas visões')).toEqual(['Switches', 'Meus notebooks']);
    await expect(
      within(menu).getByRole('menuitemradio', { name: /Equipamentos em uso/ }),
    ).toHaveAttribute('aria-checked', 'true');
  },
};

/** A de fábrica se salva como nova e se duplica, e não se renomeia nem se remove. */
export const VisaoDeFabrica: Historia = {
  render: () => <Escolha aberta="fabrica" />,
  play: async ({ canvasElement }) => {
    const menu = await abrir(canvasElement);
    await expect(acoes(menu)).toEqual(['Salvar como nova visão…', 'Duplicar…']);
  },
};

/** A de fábrica personalizada se restaura, e "Restaurar a visão" apaga as mudanças da conta. */
export const FabricaPersonalizada: Historia = {
  args: { aoRestaurar: fn() },
  render: (args) => (
    <Escolha aberta="fabrica" estado="personalizada" aoRestaurar={args.aoRestaurar} />
  ),
  play: async ({ args, canvasElement }) => {
    const menu = await abrir(canvasElement);
    await expect(acoes(menu)).toEqual([
      'Salvar como nova visão…',
      'Duplicar…',
      'Restaurar a visão',
    ]);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Restaurar a visão' }));
    await expect(args.aoRestaurar).toHaveBeenCalledOnce();
    await waitFor(() => expect(within(document.body).queryByRole('menu')).toBeNull());
  },
};

/** A visão da conta guarda as mudanças nela mesma: as ações dela, sem salvar nem restaurar. */
export const Propria: Historia = {
  args: { aoDuplicar: fn() },
  render: (args) => <Escolha aberta="switches" aoDuplicar={args.aoDuplicar} />,
  play: async ({ args, canvasElement }) => {
    const menu = await abrir(canvasElement);
    await expect(acoes(menu)).toEqual([
      'Salvar como nova visão…',
      'Duplicar…',
      'Renomear…',
      'Remover…',
    ]);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Duplicar…' }));
    await expect(args.aoDuplicar).toHaveBeenCalledOnce();
  },
};

/** A tabela de um link volta à tabela da conta. */
export const DoLinkVolta: Historia = {
  args: { aoVoltar: fn() },
  render: (args) => <Escolha aberta="switches" estado="do-link" aoVoltar={args.aoVoltar} />,
  play: async ({ args, canvasElement }) => {
    const menu = await abrir(canvasElement);
    await expect(acoes(menu)).toEqual([
      'Salvar como nova visão…',
      'Duplicar…',
      'Voltar à minha tabela',
      'Renomear…',
      'Remover…',
    ]);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Voltar à minha tabela' }));
    await expect(args.aoVoltar).toHaveBeenCalledOnce();
  },
};

/** Sem `organizacao.editar`, a visão da organização personalizada fica só para a conta. */
export const OrganizacaoSemPermissao: Historia = {
  render: () => <Escolha aberta="impressoras" estado="personalizada" />,
  play: async ({ canvasElement }) => {
    const menu = await abrir(canvasElement);
    await expect(acoes(menu)).toEqual([
      'Salvar como nova visão…',
      'Duplicar…',
      'Restaurar a visão',
    ]);
  },
};

/** Com `organizacao.editar`, a visão da organização personalizada se grava para todos. */
export const OrganizacaoPersonalizadaComPermissao: Historia = {
  args: { aoSalvarNaOrganizacao: fn() },
  render: (args) => (
    <Escolha
      aberta="impressoras"
      estado="personalizada"
      padraoDaOrganizacao="em-uso"
      podeEditarAOrganizacao
      aoSalvarNaOrganizacao={args.aoSalvarNaOrganizacao}
    />
  ),
  play: async ({ args, canvasElement }) => {
    const menu = await abrir(canvasElement);
    await expect(acoes(menu)).toEqual([
      'Salvar na visão da organização',
      'Salvar como nova visão…',
      'Duplicar…',
      'Restaurar a visão',
      'Renomear…',
      'Remover…',
      'Usar como padrão da organização',
    ]);
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Salvar na visão da organização' }),
    );
    await expect(args.aoSalvarNaOrganizacao).toHaveBeenCalledOnce();
  },
};

/**
 * Com `organizacao.editar`, a visão da organização se edita e vira a padrão; a padrão diz isso em
 * texto no menu.
 */
export const OrganizacaoComPermissao: Historia = {
  args: { aoUsarComoPadrao: fn() },
  render: (args) => (
    <Escolha
      aberta="impressoras"
      padraoDaOrganizacao="em-uso"
      podeEditarAOrganizacao
      aoUsarComoPadrao={args.aoUsarComoPadrao}
    />
  ),
  play: async ({ args, canvasElement }) => {
    const menu = await abrir(canvasElement);
    await expect(acoes(menu)).toEqual([
      'Salvar como nova visão…',
      'Duplicar…',
      'Renomear…',
      'Remover…',
      'Usar como padrão da organização',
    ]);
    await expect(
      within(menu).getByRole('menuitemradio', { name: /Equipamentos em uso/ }),
    ).toHaveTextContent('Padrão da organização');
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Usar como padrão da organização' }),
    );
    await expect(args.aoUsarComoPadrao).toHaveBeenCalledOnce();
  },
};

/** A padrão da organização não se oferece de novo como padrão. */
export const JaEPadrao: Historia = {
  render: () => <Escolha aberta="em-uso" padraoDaOrganizacao="em-uso" podeEditarAOrganizacao />,
  play: async ({ canvasElement }) => {
    const menu = await abrir(canvasElement);
    await expect(acoes(menu)).not.toContain('Usar como padrão da organização');
  },
};

/** Escolher outra visão no menu a abre. */
export const EscolherOutra: Historia = {
  args: { aoEscolher: fn() },
  render: (args) => <Escolha aberta="fabrica" aoEscolher={args.aoEscolher} />,
  play: async ({ args, canvasElement }) => {
    const menu = await abrir(canvasElement);
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: /Meus notebooks/ }));
    await expect(args.aoEscolher).toHaveBeenLastCalledWith('notebooks');
  },
};

/** Uma visão no menu, pelo nome. */
const visaoNoMenu = (menu: HTMLElement, nome: RegExp) =>
  within(menu).getByRole('menuitemradio', { name: nome });

/**
 * As visões fixadas no menu (spec visoes-de-tabela, "Visões fixadas no menu"): "No menu" em texto
 * na fixada pela conta e na fixada pela organização, e "Fixar no menu" na aberta, só para a conta.
 */
export const FixarNoMenu: Historia = {
  args: { aoFixar: fn() },
  render: (args) => (
    <Escolha
      aberta="switches"
      fixadas={{ daConta: ['notebooks'], daOrganizacao: ['impressoras'] }}
      aoFixar={args.aoFixar}
      aoDesafixar={semAcao}
    />
  ),
  play: async ({ args, canvasElement }) => {
    const menu = await abrir(canvasElement);
    await expect(acoes(menu)).toEqual([
      'Salvar como nova visão…',
      'Duplicar…',
      'Fixar no menu',
      'Renomear…',
      'Remover…',
    ]);
    await expect(visaoNoMenu(menu, /Meus notebooks/)).toHaveAccessibleDescription('No menu');
    await expect(visaoNoMenu(menu, /Impressoras de Jundiaí/)).toHaveAccessibleDescription(
      'No menu',
    );
    await expect(visaoNoMenu(menu, /^Switches/)).not.toHaveAccessibleDescription();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Fixar no menu' }));
    await expect(args.aoFixar).toHaveBeenCalledOnce();
  },
};

/** A fixada pela conta se desafixa. */
export const DesafixarDoMenu: Historia = {
  args: { aoDesafixar: fn() },
  render: (args) => (
    <Escolha
      aberta="notebooks"
      fixadas={{ daConta: ['notebooks'], daOrganizacao: [] }}
      aoFixar={semAcao}
      aoDesafixar={args.aoDesafixar}
    />
  ),
  play: async ({ args, canvasElement }) => {
    const menu = await abrir(canvasElement);
    await expect(acoes(menu)).toEqual([
      'Salvar como nova visão…',
      'Duplicar…',
      'Desafixar do menu',
      'Renomear…',
      'Remover…',
    ]);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Desafixar do menu' }));
    await expect(args.aoDesafixar).toHaveBeenCalledOnce();
  },
};

/** A fixada pela organização já está no menu da conta, que não a desafixa só para si. */
export const FixadaPelaOrganizacao: Historia = {
  render: () => (
    <Escolha
      aberta="impressoras"
      fixadas={{ daConta: [], daOrganizacao: ['impressoras'] }}
      aoFixar={semAcao}
      aoDesafixar={semAcao}
    />
  ),
  play: async ({ canvasElement }) => {
    const menu = await abrir(canvasElement);
    await expect(acoes(menu)).toEqual(['Salvar como nova visão…', 'Duplicar…']);
  },
};

/** A de fábrica já é "Todos os ativos" no menu, e não se fixa. */
export const FabricaNaoSeFixa: Historia = {
  render: () => (
    <Escolha
      aberta="fabrica"
      fixadas={{ daConta: [], daOrganizacao: [] }}
      aoFixar={semAcao}
      aoDesafixar={semAcao}
    />
  ),
  play: async ({ canvasElement }) => {
    const menu = await abrir(canvasElement);
    await expect(acoes(menu)).toEqual(['Salvar como nova visão…', 'Duplicar…']);
  },
};

/** Com `organizacao.editar`, a visão da organização se fixa no menu de todos. */
export const FixarNoMenuDeTodos: Historia = {
  args: { aoFixarParaTodos: fn() },
  render: (args) => (
    <Escolha
      aberta="em-uso"
      padraoDaOrganizacao="em-uso"
      podeEditarAOrganizacao
      fixadas={{ daConta: [], daOrganizacao: [] }}
      aoFixar={semAcao}
      aoDesafixar={semAcao}
      aoFixarParaTodos={args.aoFixarParaTodos}
      aoDesafixarParaTodos={semAcao}
    />
  ),
  play: async ({ args, canvasElement }) => {
    const menu = await abrir(canvasElement);
    await expect(acoes(menu)).toEqual([
      'Salvar como nova visão…',
      'Duplicar…',
      'Fixar no menu',
      'Fixar no menu de todos',
      'Renomear…',
      'Remover…',
    ]);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Fixar no menu de todos' }));
    await expect(args.aoFixarParaTodos).toHaveBeenCalledOnce();
  },
};

/** A fixada pela organização se desafixa do menu de todos; a padrão diz as duas coisas. */
export const DesafixarDoMenuDeTodos: Historia = {
  args: { aoDesafixarParaTodos: fn() },
  render: (args) => (
    <Escolha
      aberta="em-uso"
      padraoDaOrganizacao="em-uso"
      podeEditarAOrganizacao
      fixadas={{ daConta: [], daOrganizacao: ['em-uso'] }}
      aoFixar={semAcao}
      aoDesafixar={semAcao}
      aoFixarParaTodos={semAcao}
      aoDesafixarParaTodos={args.aoDesafixarParaTodos}
    />
  ),
  play: async ({ args, canvasElement }) => {
    const menu = await abrir(canvasElement);
    await expect(acoes(menu)).toEqual([
      'Salvar como nova visão…',
      'Duplicar…',
      'Desafixar do menu de todos',
      'Renomear…',
      'Remover…',
    ]);
    await expect(visaoNoMenu(menu, /Equipamentos em uso/)).toHaveAccessibleDescription(
      'Padrão da organização · No menu',
    );
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Desafixar do menu de todos' }),
    );
    await expect(args.aoDesafixarParaTodos).toHaveBeenCalledOnce();
  },
};
