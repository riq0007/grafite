import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { CartaoDoRegistro } from '../referencia/CartaoDoRegistro.tsx';
import { ReferenciaComCartao } from '../referencia/ReferenciaComCartao.tsx';
import { ATIVOS } from './exemplos.ts';
import { CabecalhoDaTabela, Celula, Coluna, CorpoDaTabela, Linha, Tabela } from './Tabela.tsx';

const meta: Meta = { title: 'Componentes/Tabela com referências' };
export default meta;

interface Espioes {
  aoAbrirLinha: (chave: string) => void;
  aoSeguir: (destino: string) => void;
}

type Historia = StoryObj<Espioes>;

/**
 * A tabela dos ativos com a seleção, e o local como referência com cartão (change relacoes-vivas,
 * decisão 2): o link é da tela, que o segue pelo roteador.
 */
function TabelaComReferencias({ aoAbrirLinha, aoSeguir }: Espioes) {
  const [selecao, definirSelecao] = useState<ReadonlySet<string>>(new Set());
  return (
    <Tabela
      rotulo="Ativos"
      selecao={selecao}
      aoMudarSelecao={definirSelecao}
      aoAbrirLinha={aoAbrirLinha}
      alturaMaxima="360px"
    >
      <CabecalhoDaTabela>
        <Coluna id="nome" principal>
          Equipamento
        </Coluna>
        <Coluna id="local">Local</Coluna>
      </CabecalhoDaTabela>
      <CorpoDaTabela itens={ATIVOS}>
        {(ativo) => (
          <Linha id={ativo.id}>
            <Celula>{ativo.nome}</Celula>
            <Celula>
              <ReferenciaComCartao
                titulo={`Resumo de ${ativo.local}`}
                cartao={() => (
                  <CartaoDoRegistro
                    nome={ativo.local}
                    tipo="Local"
                    detalhes={['Ativos: 3 aqui · 5 com os de dentro']}
                    acoes={<a href="#local">Abrir</a>}
                  />
                )}
              >
                <a
                  href={`#local-${ativo.id}`}
                  onClick={(evento) => {
                    evento.preventDefault();
                    aoSeguir(ativo.local);
                  }}
                >
                  {ativo.local}
                </a>
              </ReferenciaComCartao>
            </Celula>
          </Linha>
        )}
      </CorpoDaTabela>
    </Tabela>
  );
}

const referencia = (canvas: HTMLElement, local: string) =>
  within(canvas).getAllByRole('link', { name: local })[0] as HTMLElement;

/** O clique na referência segue o link: a linha não abre nem entra na seleção. */
export const CliqueSegueOLink: Historia = {
  args: { aoAbrirLinha: fn(), aoSeguir: fn() },
  render: (args) => <TabelaComReferencias {...args} />,
  play: async ({ args, canvasElement }) => {
    await userEvent.click(referencia(canvasElement, 'CPD · Rack A'));
    await expect(args.aoSeguir).toHaveBeenCalledWith('CPD · Rack A');
    await expect(args.aoAbrirLinha).not.toHaveBeenCalled();
    const selecionadas = within(canvasElement)
      .getAllByRole('row')
      .filter((linha) => linha.getAttribute('aria-selected') === 'true');
    await expect(selecionadas).toHaveLength(0);
  },
};

/** O Enter na referência em foco segue o link, sem abrir a linha. */
export const EnterSegueOLink: Historia = {
  args: { aoAbrirLinha: fn(), aoSeguir: fn() },
  render: (args) => <TabelaComReferencias {...args} />,
  play: async ({ args, canvasElement }) => {
    referencia(canvasElement, 'CPD · Rack A').focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.aoSeguir).toHaveBeenCalledWith('CPD · Rack A');
    await expect(args.aoAbrirLinha).not.toHaveBeenCalled();
  },
};

/** O ponteiro parado sobre a referência abre o cartão dela, sobre a tabela. */
export const CartaoNaCelula: Historia = {
  args: { aoAbrirLinha: fn(), aoSeguir: fn() },
  render: (args) => <TabelaComReferencias {...args} />,
  play: async ({ args, canvasElement }) => {
    await userEvent.hover(referencia(canvasElement, 'CPD · Rack A'));
    const cartao = await within(document.body).findByRole('dialog', {
      name: 'Resumo de CPD · Rack A',
    });
    await waitFor(() =>
      expect(within(cartao).getByText('Ativos: 3 aqui · 5 com os de dentro')).toBeVisible(),
    );
    await expect(args.aoAbrirLinha).not.toHaveBeenCalled();
  },
};

/** Na célula, a seta para baixo é da grade; Alt+seta para baixo abre o cartão da referência. */
export const AltSetaAbreOCartao: Historia = {
  args: { aoAbrirLinha: fn(), aoSeguir: fn() },
  render: (args) => <TabelaComReferencias {...args} />,
  play: async ({ canvasElement }) => {
    referencia(canvasElement, 'CPD · Rack A').focus();
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    const cartao = await within(document.body).findByRole('dialog', {
      name: 'Resumo de CPD · Rack A',
    });
    await waitFor(() => expect(cartao).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
    await expect(referencia(canvasElement, 'CPD · Rack A')).toHaveFocus();
  },
};
