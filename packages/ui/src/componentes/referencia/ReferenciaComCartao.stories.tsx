import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { tempos } from '../../tokens/tempos.ts';
import { Avatar } from '../avatar/Avatar.tsx';
import { MiniaturaDeAtivo } from '../miniatura/MiniaturaDeAtivo.tsx';
import { CartaoDoRegistro } from './CartaoDoRegistro.tsx';
import { ReferenciaComCartao } from './ReferenciaComCartao.tsx';

const meta: Meta = { title: 'Componentes/Referência com cartão' };
export default meta;

interface Args {
  aoBuscar: () => void;
  aoCancelar: () => void;
}

type Historia = StoryObj<Args>;

const corpoDe = (elemento: HTMLElement) => within(elemento.ownerDocument.body);

/** A moldura da camada flutuante, como o cartão aparece sobre a tela. */
const MOLDURA = {
  border: '1px solid var(--cor-material-linha)',
  borderRadius: 'var(--raio-menu)',
  backgroundColor: 'var(--cor-material)',
  boxShadow: 'var(--sombra-material)',
};
const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/**
 * O conteúdo do cartão como a tela o faz: busca o resumo ao montar, com o cartão aberto, e cancela a
 * busca ao desmontar antes da resposta.
 */
function ResumoDeAna({ aoBuscar, aoCancelar, demora }: Args & { demora: number }) {
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    aoBuscar();
    let respondido = false;
    const resposta = setTimeout(() => {
      respondido = true;
      setPronto(true);
    }, demora);
    return () => {
      clearTimeout(resposta);
      if (!respondido) aoCancelar();
    };
  }, [aoBuscar, aoCancelar, demora]);
  return (
    <CartaoDoRegistro
      nome="Ana Souza"
      tipo="Pessoa"
      midia={<Avatar nome="Ana Souza" tamanho="ficha" decorativo />}
      estado={pronto ? 'pronto' : 'carregando'}
      detalhes={['Jundiaí › Expedição', '3 ativos sob responsabilidade']}
      acoes={
        <>
          <a href="#pessoa">Abrir</a>
          <a href="#ativos-de-ana">Ver ativos</a>
        </>
      }
    />
  );
}

const ResponsavelNaTabela = ({ demora = 0, ...args }: Args & { demora?: number }) => (
  <p>
    Responsável:{' '}
    <ReferenciaComCartao
      titulo="Resumo de Ana Souza"
      cartao={() => <ResumoDeAna {...args} demora={demora} />}
    >
      <a href="#pessoa">Ana Souza</a>
    </ReferenciaComCartao>
  </p>
);

/** O ponteiro parado 500 ms sobre a referência abre o cartão, que busca o resumo só então. */
export const PeloPonteiro: Historia = {
  args: { aoBuscar: fn(), aoCancelar: fn() },
  render: (args) => <ResponsavelNaTabela {...args} />,
  play: async ({ args, canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    const referencia = within(canvasElement).getByRole('link', { name: 'Ana Souza' });
    await userEvent.hover(referencia);
    await esperar(tempos.cartao.abrir / 2);
    await expect(corpo.queryByRole('dialog')).toBeNull();
    await expect(args.aoBuscar).not.toHaveBeenCalled();

    const cartao = await corpo.findByRole('dialog', { name: 'Resumo de Ana Souza' });
    // O cartão aparece esmaecendo: a espera cobre a troca de opacidade.
    await waitFor(() =>
      expect(within(cartao).getByText('3 ativos sob responsabilidade')).toBeVisible(),
    );
    await expect(within(cartao).getByRole('link', { name: 'Abrir' })).toBeVisible();
    await expect(within(cartao).getByRole('link', { name: 'Ver ativos' })).toBeVisible();
    await expect(args.aoBuscar).toHaveBeenCalledTimes(1);
    // O foco fica onde estava: o cartão do ponteiro não o rouba.
    await expect(cartao).not.toContainElement(cartao.ownerDocument.activeElement as HTMLElement);

    // Do link ao cartão, ele continua aberto; fora dos dois, fecha.
    await userEvent.hover(cartao);
    await esperar(tempos.cartao.fechar + 200);
    await expect(corpo.getByRole('dialog')).toBeVisible();
    await userEvent.unhover(cartao);
    await waitFor(() => expect(corpo.queryByRole('dialog')).toBeNull());
  },
};

/** A seta para baixo no foco abre o cartão com o foco nele; Esc o fecha e devolve o foco. */
export const PeloTeclado: Historia = {
  render: () => (
    <p>
      Local:{' '}
      <ReferenciaComCartao
        titulo="Resumo de Jundiaí › Expedição"
        cartao={() => (
          <CartaoDoRegistro
            nome="Jundiaí › Expedição"
            tipo="Setor"
            detalhes={['Ativos: 12 aqui · 30 com os de dentro', 'Pessoas: 4']}
            acoes={
              <>
                <a href="#local">Abrir</a>
                <a href="#ativos-do-local">Ver ativos</a>
              </>
            }
          />
        )}
      >
        <a href="#local">Jundiaí › Expedição</a>
      </ReferenciaComCartao>
    </p>
  ),
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    const referencia = within(canvasElement).getByRole('link', { name: 'Jundiaí › Expedição' });
    await userEvent.tab();
    await expect(referencia).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    const cartao = await corpo.findByRole('dialog', { name: 'Resumo de Jundiaí › Expedição' });
    await waitFor(() => expect(cartao).toHaveFocus());
    await userEvent.tab();
    await expect(within(cartao).getByRole('link', { name: 'Abrir' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpo.queryByRole('dialog')).toBeNull());
    await expect(referencia).toHaveFocus();
  },
};

/** Fechar antes da resposta desmonta o conteúdo, e a busca é cancelada. */
export const CancelaAoFechar: Historia = {
  args: { aoBuscar: fn(), aoCancelar: fn() },
  render: (args) => <ResponsavelNaTabela {...args} demora={60_000} />,
  play: async ({ args, canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    const referencia = within(canvasElement).getByRole('link', { name: 'Ana Souza' });
    await userEvent.hover(referencia);
    const cartao = await corpo.findByRole('dialog', { name: 'Resumo de Ana Souza' });
    await expect(within(cartao).getByRole('status')).toHaveTextContent('Carregando o resumo…');
    // Mesmo sem o resumo, dá para abrir a ficha.
    await waitFor(() => expect(within(cartao).getByRole('link', { name: 'Abrir' })).toBeVisible());
    await userEvent.unhover(referencia);
    await waitFor(() => expect(corpo.queryByRole('dialog')).toBeNull());
    await expect(args.aoCancelar).toHaveBeenCalledTimes(1);
  },
};

/** No toque não há ponteiro parado: a referência é só o link, sem cartão. */
export const NoToque: Historia = {
  args: { aoBuscar: fn(), aoCancelar: fn() },
  render: (args) => <ResponsavelNaTabela {...args} />,
  play: async ({ args, canvasElement }) => {
    const referencia = within(canvasElement).getByRole('link', { name: 'Ana Souza' });
    await userEvent.pointer({ keys: '[TouchA>]', target: referencia });
    await esperar(tempos.cartao.abrir + 300);
    await userEvent.pointer({ keys: '[/TouchA]', target: referencia });
    await expect(corpoDe(canvasElement).queryByRole('dialog')).toBeNull();
    await expect(args.aoBuscar).not.toHaveBeenCalled();
  },
};

/**
 * Os estados do cartão: o resumo de um ativo, com a miniatura; carregando; e a busca que falhou,
 * sempre com o "Abrir". Fora do acesso de quem vê, a referência é só texto.
 */
export const Estados: Historia = {
  tags: ['captura'],
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--esp-4)', justifyItems: 'start' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--esp-4)', alignItems: 'start' }}>
        <div style={MOLDURA}>
          <CartaoDoRegistro
            nome="HP LaserJet M404"
            tipo="Impressora · PAT-00412"
            midia={<MiniaturaDeAtivo tipo="impressora" />}
            detalhes={['Jundiaí › Expedição', 'Em uso', 'Ligados: 5']}
            acoes={
              <>
                <a href="#ativo">Abrir</a>
                <a href="#ligados">Ver ligados</a>
              </>
            }
          />
        </div>
        <div style={MOLDURA}>
          <CartaoDoRegistro
            nome="Ana Souza"
            tipo="Pessoa"
            midia={<Avatar nome="Ana Souza" tamanho="ficha" decorativo />}
            estado="carregando"
            acoes={<a href="#pessoa">Abrir</a>}
          />
        </div>
        <div style={MOLDURA}>
          <CartaoDoRegistro
            nome="LaserJet M404"
            tipo="Modelo"
            estado="erro"
            acoes={<a href="#modelo">Abrir</a>}
          />
        </div>
      </div>
      <p>
        Ligado a: <span>Ativo fora do seu acesso</span>
      </p>
    </div>
  ),
};
