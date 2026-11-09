import type { Meta, StoryObj } from '@storybook/react-vite';
import { MousePointer2, Palette, PanelBottom, UserRound } from 'lucide-react';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { CabecalhoDaPagina } from '../componentes/cabecalho/CabecalhoDaPagina.tsx';
import {
  JanelaComSecoes,
  type PropsDoLinkDaJanela,
  type SecaoDaJanela,
} from './JanelaComSecoes.tsx';

const meta: Meta = { title: 'Casca/Janela com seções' };
export default meta;

type Historia = StoryObj;

/** A Conta num grupo próprio, separada das preferências, como nos Ajustes. */
const CONTA: SecaoDaJanela[] = [{ id: 'conta', nome: 'Conta', icone: UserRound }];
const PREFERENCIAS: SecaoDaJanela[] = [
  { id: 'aparencia', nome: 'Aparência', icone: Palette },
  { id: 'dock', nome: 'Dock', icone: PanelBottom },
  { id: 'cursor', nome: 'Cursor', icone: MousePointer2 },
];
const SECOES = [...CONTA, ...PREFERENCIAS];

/** Um link que troca o "endereço" da história, sem sair dela. */
function LinkDaHistoria({
  para,
  aoSeguir,
  ...props
}: PropsDoLinkDaJanela & { para: string; aoSeguir: () => void }) {
  return (
    <a
      {...props}
      href={`?secao=${para}`}
      onClick={(evento) => {
        evento.preventDefault();
        aoSeguir();
      }}
    />
  );
}

/**
 * A janela com um roteador de mentira: cada link troca a seção à vista, e o endereço da janela
 * (`null`) é o da lista.
 */
function JanelaDeAjustes({ inicial = 'dock' }: { inicial?: string | null }) {
  const [endereco, definirEndereco] = useState<string | null>(inicial);
  const naLista = endereco === null;
  // No endereço da lista, o computador mostra a primeira seção de preferências.
  const atual = endereco ?? 'aparencia';
  const secao = SECOES.find((s) => s.id === atual);
  return (
    <JanelaComSecoes
      rotulo="Seções dos Ajustes"
      titulo="Ajustes do Sistema"
      grupos={[CONTA, PREFERENCIAS]}
      atual={atual}
      naLista={naLista}
      linkDaSecao={(s, props) => (
        <LinkDaHistoria {...props} para={s.id} aoSeguir={() => definirEndereco(s.id)} />
      )}
      linkDeVoltar={(props) => (
        <LinkDaHistoria {...props} para="ajustes" aoSeguir={() => definirEndereco(null)} />
      )}
    >
      <CabecalhoDaPagina titulo={secao?.nome} />
      <p>Os ajustes de {secao?.nome}.</p>
    </JanelaComSecoes>
  );
}

const lista = (canvas: HTMLElement) =>
  within(canvas).queryByRole('navigation', { name: 'Seções dos Ajustes' });

const titulo = (canvas: HTMLElement, nome: string) =>
  within(canvas).getByRole('heading', { level: 1, name: nome });

export const Padrao: Historia = { render: () => <JanelaDeAjustes /> };

/** A lista fica ao lado da seção, em grupos, com a seção à vista marcada. */
export const GruposESecaoMarcada: Historia = {
  render: () => <JanelaDeAjustes />,
  play: async ({ canvasElement }) => {
    const nav = lista(canvasElement) as HTMLElement;
    const grupos = within(nav).getAllByRole('list');
    await expect(grupos.map((grupo) => within(grupo).getAllByRole('link').length)).toEqual([1, 3]);
    await expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Conta', 'Aparência', 'Dock', 'Cursor']);
    await expect(within(nav).getByRole('link', { name: 'Dock' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(within(nav).getByRole('link', { name: 'Cursor' })).not.toHaveAttribute(
      'aria-current',
    );
    await expect(titulo(canvasElement, 'Dock')).toBeVisible();
  },
};

/** Escolher outra seção a mostra ao lado, e a marca passa para ela. */
export const EscolherUmaSecao: Historia = {
  render: () => <JanelaDeAjustes />,
  play: async ({ canvasElement }) => {
    const nav = lista(canvasElement) as HTMLElement;
    await userEvent.click(within(nav).getByRole('link', { name: 'Cursor' }));
    await expect(titulo(canvasElement, 'Cursor')).toBeVisible();
    await expect(within(nav).getByRole('link', { name: 'Cursor' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(within(nav).getByRole('link', { name: 'Dock' })).not.toHaveAttribute(
      'aria-current',
    );
  },
};

/** No endereço da janela, o computador mostra a seção inicial, marcada na lista. */
export const NoEnderecoDaJanela: Historia = {
  render: () => <JanelaDeAjustes inicial={null} />,
  play: async ({ canvasElement }) => {
    await expect(titulo(canvasElement, 'Aparência')).toBeVisible();
    await expect(
      within(lista(canvasElement) as HTMLElement).getByRole('link', { name: 'Aparência' }),
    ).toHaveAttribute('aria-current', 'page');
  },
};

/**
 * No celular, uma coisa de cada vez: no endereço da janela, só a lista, com o título dela; numa
 * seção, só ela, com Voltar para a lista.
 */
export const TrocaNoCelular: Historia = {
  globals: { viewport: { value: 'celular390' } },
  render: () => <JanelaDeAjustes inicial={null} />,
  play: async ({ canvasElement }) => {
    await expect(titulo(canvasElement, 'Ajustes do Sistema')).toBeVisible();
    const nav = lista(canvasElement) as HTMLElement;
    await expect(within(nav).getAllByRole('link')).toHaveLength(4);
    await expect(within(nav).getByRole('link', { name: 'Aparência' })).not.toHaveAttribute(
      'aria-current',
    );

    await userEvent.click(within(nav).getByRole('link', { name: 'Dock' }));
    await expect(titulo(canvasElement, 'Dock')).toBeVisible();
    await expect(lista(canvasElement)).toBeNull();

    await userEvent.click(within(canvasElement).getByRole('link', { name: 'Voltar' }));
    await expect(titulo(canvasElement, 'Ajustes do Sistema')).toBeVisible();
    await expect(lista(canvasElement)).not.toBeNull();
  },
};
