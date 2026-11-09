import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { MiniaturaDeAtivo } from '../miniatura/MiniaturaDeAtivo.tsx';
import { ATIVOS } from './exemplos.ts';
import {
  CabecalhoDaTabela,
  Celula,
  CelulaDaMiniatura,
  Coluna,
  ColunaDaMiniatura,
  CorpoDaTabela,
  Linha,
  type Ordenacao,
  Tabela,
} from './Tabela.tsx';

const meta: Meta = { title: 'Componentes/Tabela configurável' };
export default meta;

interface Espioes {
  aoFiltrar?: (coluna: string) => void;
  aoRedimensionar?: (larguras: ReadonlyMap<string, number>) => void;
}

type Historia = StoryObj<Espioes>;

const VALORES: Record<string, string> = {
  '1': '1.500,00',
  '2': '800,00',
  '3': '12.300,00',
  '4': '950,00',
  '5': '2.100,00',
  '6': '640,00',
  '7': '720,00',
  '8': '3.900,00',
};

/** As colunas que mudam de largura, com o menu de cada uma, como a tabela dos ativos. */
function TabelaRedimensionavel({ aoFiltrar, aoRedimensionar }: Espioes) {
  const [ordenacao, setOrdenacao] = useState<Ordenacao>();
  const [ocultas, setOcultas] = useState<string[]>([]);
  const [larguras, setLarguras] = useState<ReadonlyMap<string, number>>(
    new Map([
      ['nome', 240],
      ['patrimonio', 140],
      ['local', 200],
      ['valor', 140],
    ]),
  );
  const ordenados = useMemo(() => {
    if (!ordenacao) return ATIVOS;
    const sinal = ordenacao.direcao === 'crescente' ? 1 : -1;
    return [...ATIVOS].sort((a, b) => a.patrimonio.localeCompare(b.patrimonio) * sinal);
  }, [ordenacao]);
  const visivel = (coluna: string) => !ocultas.includes(coluna);
  const menu = (coluna: string) => ({
    aoFiltrar: () => aoFiltrar?.(coluna),
    aoOcultar: () => setOcultas((atuais) => [...atuais, coluna]),
  });
  return (
    <Tabela
      rotulo="Ativos"
      ordenacao={ordenacao}
      aoOrdenar={setOrdenacao}
      alturaMaxima="320px"
      redimensionavel
      aoRedimensionar={(novas) => {
        setLarguras((atuais) => new Map([...atuais, ...novas]));
        aoRedimensionar?.(novas);
      }}
    >
      <CabecalhoDaTabela>
        <ColunaDaMiniatura />
        <Coluna id="nome" principal largura={larguras.get('nome')} menu={menu('nome')}>
          Equipamento
        </Coluna>
        {visivel('patrimonio') ? (
          <Coluna
            id="patrimonio"
            ordenavel
            largura={larguras.get('patrimonio')}
            menu={menu('patrimonio')}
          >
            Patrimônio
          </Coluna>
        ) : null}
        {visivel('local') ? (
          <Coluna id="local" largura={larguras.get('local')} menu={menu('local')}>
            Local
          </Coluna>
        ) : null}
        {visivel('valor') ? (
          <Coluna id="valor" largura={larguras.get('valor')} alinhamento="fim" menu={menu('valor')}>
            Valor de compra
          </Coluna>
        ) : null}
      </CabecalhoDaTabela>
      <CorpoDaTabela itens={ordenados} dependencias={[ocultas]}>
        {(ativo) => (
          <Linha id={ativo.id}>
            <CelulaDaMiniatura>
              <MiniaturaDeAtivo tipo={ativo.tipo} />
            </CelulaDaMiniatura>
            <Celula>{ativo.nome}</Celula>
            {visivel('patrimonio') ? <Celula mono>{ativo.patrimonio}</Celula> : null}
            {visivel('local') ? <Celula>{ativo.local}</Celula> : null}
            {visivel('valor') ? (
              <Celula mono alinhamento="fim">
                {`R$ ${VALORES[ativo.id] ?? ''}`}
              </Celula>
            ) : null}
          </Linha>
        )}
      </CorpoDaTabela>
    </Tabela>
  );
}

const cabecalho = (canvas: HTMLElement, nome: string) =>
  within(canvas).getByRole('columnheader', { name: new RegExp(nome) });

const larguraDa = (canvas: HTMLElement, nome: string) =>
  cabecalho(canvas, nome).getBoundingClientRect().width;

/** A borda que arrasta: o React Aria a anuncia como um controle deslizante, dentro do elemento dela. */
const bordaDa = (canvas: HTMLElement, nome: string) =>
  within(cabecalho(canvas, nome)).getByRole('slider', {
    name: new RegExp(`^Redimensionar ${nome}`),
  });

/** Arrasta a borda direita do cabeçalho da coluna. */
async function arrastarABorda(canvas: HTMLElement, nome: string, deslocamento: number) {
  const borda = bordaDa(canvas, nome).parentElement as HTMLElement;
  const caixa = borda.getBoundingClientRect();
  const x = caixa.left + caixa.width / 2;
  const y = caixa.top + caixa.height / 2;
  // Os eventos do mouse de verdade, com o botão apertado durante o movimento: o React Aria segue o
  // ponteiro pela janela até ele ser solto.
  const evento = (tipo: string, clientX: number, buttons: number) =>
    new PointerEvent(tipo, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons,
      clientX,
      clientY: y,
    });
  borda.dispatchEvent(evento('pointerdown', x, 1));
  for (const passo of [0.25, 0.5, 0.75, 1]) {
    borda.dispatchEvent(evento('pointermove', x + deslocamento * passo, 1));
  }
  borda.dispatchEvent(evento('pointerup', x + deslocamento, 0));
  await userEvent.unhover(borda);
}

/** O arraste da borda direita do cabeçalho muda a largura da coluna, e só dela. */
export const ColunasRedimensionaveis: Historia = {
  args: { aoRedimensionar: fn() },
  render: (args) => <TabelaRedimensionavel aoRedimensionar={args.aoRedimensionar} />,
  play: async ({ args, canvasElement }) => {
    const local = larguraDa(canvasElement, 'Local');
    const patrimonio = larguraDa(canvasElement, 'Patrimônio');
    await arrastarABorda(canvasElement, 'Local', 80);
    await waitFor(() =>
      expect(Math.round(larguraDa(canvasElement, 'Local') - local)).toBeGreaterThanOrEqual(78),
    );
    await expect(Math.round(larguraDa(canvasElement, 'Patrimônio'))).toBe(Math.round(patrimonio));
    const espiao = args.aoRedimensionar as ReturnType<typeof fn>;
    const larguras = espiao.mock.lastCall?.[0] as ReadonlyMap<string, number>;
    await expect(larguras.get('local')).toBeGreaterThanOrEqual(278);
  },
};

/** A coluna para em 64 px, por mais que a borda seja arrastada. */
export const LarguraMinima: Historia = {
  render: () => <TabelaRedimensionavel />,
  play: async ({ canvasElement }) => {
    await arrastarABorda(canvasElement, 'Local', -400);
    await waitFor(() => expect(Math.round(larguraDa(canvasElement, 'Local'))).toBe(64));
  },
};

const abrirMenuDa = async (canvas: HTMLElement, nome: string) => {
  await userEvent.click(within(canvas).getByRole('button', { name: `Opções da coluna ${nome}` }));
  return within(document.body).findByRole('menu', { name: `Opções da coluna ${nome}` });
};

const itensDe = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent);

/** O menu da coluna ordena, filtra, oculta e redimensiona, conforme a coluna. */
export const MenuDaColuna: Historia = {
  args: { aoFiltrar: fn() },
  render: (args) => <TabelaRedimensionavel aoFiltrar={args.aoFiltrar} />,
  play: async ({ args, canvasElement }) => {
    const doPatrimonio = await abrirMenuDa(canvasElement, 'Patrimônio');
    await expect(itensDe(doPatrimonio)).toEqual([
      'Ordenar crescente',
      'Ordenar decrescente',
      'Filtrar…',
      'Ocultar coluna',
      'Redimensionar coluna',
    ]);
    await userEvent.click(
      within(doPatrimonio).getByRole('menuitem', { name: 'Ordenar decrescente' }),
    );
    await waitFor(() =>
      expect(cabecalho(canvasElement, 'Patrimônio')).toHaveAttribute('aria-sort', 'descending'),
    );
    await expect(within(canvasElement).getAllByRole('row')[1]).toHaveTextContent('PAT-00619');

    // A coluna principal não sai da tabela.
    const doEquipamento = await abrirMenuDa(canvasElement, 'Equipamento');
    await expect(itensDe(doEquipamento)).toEqual(['Filtrar…', 'Redimensionar coluna']);
    await userEvent.click(within(doEquipamento).getByRole('menuitem', { name: 'Filtrar…' }));
    await expect(args.aoFiltrar).toHaveBeenCalledWith('nome');

    const doLocal = await abrirMenuDa(canvasElement, 'Local');
    await userEvent.click(within(doLocal).getByRole('menuitem', { name: 'Ocultar coluna' }));
    await waitFor(() =>
      expect(within(canvasElement).queryByRole('columnheader', { name: /Local/ })).toBeNull(),
    );
  },
};

/** O clique no rótulo de uma coluna que se ordena ordena, crescente e depois decrescente. */
export const OrdenarPeloRotulo: Historia = {
  render: () => <TabelaRedimensionavel />,
  play: async ({ canvasElement }) => {
    const patrimonio = cabecalho(canvasElement, 'Patrimônio');
    await userEvent.click(within(patrimonio).getByText('Patrimônio'));
    await waitFor(() => expect(patrimonio).toHaveAttribute('aria-sort', 'ascending'));
    await userEvent.click(within(patrimonio).getByText('Patrimônio'));
    await waitFor(() => expect(patrimonio).toHaveAttribute('aria-sort', 'descending'));
  },
};

/**
 * Pelo teclado: "Redimensionar coluna" põe o foco na borda, as setas mudam a largura e Enter
 * termina, com o foco de volta ao cabeçalho.
 */
export const RedimensionarPeloTeclado: Historia = {
  render: () => <TabelaRedimensionavel />,
  play: async ({ canvasElement }) => {
    const antes = larguraDa(canvasElement, 'Patrimônio');
    const menu = await abrirMenuDa(canvasElement, 'Patrimônio');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Redimensionar coluna' }));
    await waitFor(() =>
      expect(bordaDa(canvasElement, 'Patrimônio').contains(document.activeElement)).toBe(true),
    );
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    await waitFor(() => expect(larguraDa(canvasElement, 'Patrimônio')).toBeGreaterThan(antes));
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(cabecalho(canvasElement, 'Patrimônio').contains(document.activeElement)).toBe(true),
    );
  },
};

/** Os números à direita, com algarismos tabulares, e os identificadores na fonte mono. */
export const NumerosADireita: Historia = {
  render: () => <TabelaRedimensionavel />,
  play: async ({ canvasElement }) => {
    const valor = within(canvasElement).getByRole('gridcell', { name: 'R$ 1.500,00' });
    await expect(getComputedStyle(valor).textAlign).toBe('end');
    await expect(getComputedStyle(valor).fontVariantNumeric).toContain('tabular-nums');
    await expect(getComputedStyle(valor).fontFamily).toContain('JetBrains Mono');
    await expect(getComputedStyle(cabecalho(canvasElement, 'Valor de compra')).textAlign).toBe(
      'end',
    );
  },
};

/** A tabela redimensionável parada, para a captura de referência: o menu e a borda de cada coluna. */
export const Configuravel: Historia = { render: () => <TabelaRedimensionavel /> };

/**
 * Sem largura guardada, as colunas dividem a largura toda da área, e a principal fica com o dobro
 * (change redesenho-da-interface, design, decisão 2).
 */
export const NaLarguraToda: Historia = {
  render: () => (
    <Tabela rotulo="Ativos" redimensionavel>
      <CabecalhoDaTabela>
        <Coluna id="nome" principal>
          Equipamento
        </Coluna>
        <Coluna id="patrimonio">Patrimônio</Coluna>
        <Coluna id="local">Local</Coluna>
      </CabecalhoDaTabela>
      <CorpoDaTabela itens={ATIVOS}>
        {(ativo) => (
          <Linha id={ativo.id}>
            <Celula>{ativo.nome}</Celula>
            <Celula mono>{ativo.patrimonio}</Celula>
            <Celula>{ativo.local}</Celula>
          </Linha>
        )}
      </CorpoDaTabela>
    </Tabela>
  ),
  play: async ({ canvasElement }) => {
    const area = canvasElement.querySelector('[data-rolagem]') as HTMLElement;
    const soma = () =>
      larguraDa(canvasElement, 'Equipamento') +
      larguraDa(canvasElement, 'Patrimônio') +
      larguraDa(canvasElement, 'Local');
    await waitFor(() => expect(Math.abs(soma() - area.clientWidth)).toBeLessThanOrEqual(2));
    const nome = larguraDa(canvasElement, 'Equipamento');
    await expect(Math.abs(nome - 2 * larguraDa(canvasElement, 'Local'))).toBeLessThanOrEqual(2);
  },
};
