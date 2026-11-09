import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { CabecalhoDaTabela, Celula, Coluna, CorpoDaTabela, Linha, Tabela } from './Tabela.tsx';

const meta: Meta = { title: 'Componentes/Tabela virtualizada' };
export default meta;

type Historia = StoryObj<{ aoCarregar?: () => void }>;

interface Item {
  id: string;
  nome: string;
  patrimonio: string;
}

const itens = (quantos: number, inicio = 0): Item[] =>
  Array.from({ length: quantos }, (_, indice) => {
    const numero = inicio + indice + 1;
    return {
      id: String(numero),
      nome: `Equipamento ${numero.toLocaleString('pt-BR')}`,
      patrimonio: `PAT-${String(numero).padStart(5, '0')}`,
    };
  });

const DEZ_MIL = itens(10_000);

function TabelaDeItens({
  lista,
  carregarMais,
}: {
  lista: Item[];
  carregarMais?: { haMais: boolean; carregando: boolean; aoCarregar: () => void };
}) {
  return (
    <div style={{ height: '320px', display: 'flex', flexDirection: 'column' }}>
      <Tabela
        rotulo="Equipamentos"
        virtualizada
        redimensionavel
        aoAbrirLinha={() => {}}
        carregarMais={carregarMais}
      >
        <CabecalhoDaTabela>
          <Coluna id="nome" principal largura={260}>
            Equipamento
          </Coluna>
          <Coluna id="patrimonio" largura={160}>
            Patrimônio
          </Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela itens={lista}>
          {(item) => (
            <Linha id={item.id}>
              <Celula>{item.nome}</Celula>
              <Celula mono>{item.patrimonio}</Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
    </div>
  );
}

/** A grade que rola: no modo virtualizado, a própria tabela. */
const grade = (canvas: HTMLElement) => within(canvas).getByRole('grid', { name: 'Equipamentos' });

const linhasDesenhadas = (canvas: HTMLElement) =>
  within(grade(canvas))
    .getAllByRole('row')
    .filter((linha) => !linha.querySelector('[role="columnheader"]'));

/** Com 10 mil linhas, só as perto da área visível ficam desenhadas, e o cabeçalho fica fixo. */
export const DezMilLinhas: Historia = {
  render: () => <TabelaDeItens lista={DEZ_MIL} />,
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(linhasDesenhadas(canvasElement).length).toBeGreaterThan(0));
    await expect(linhasDesenhadas(canvasElement).length).toBeLessThan(60);
    // As linhas alternam pela posição, mesmo reaproveitadas pela virtualização.
    const fundoDa = (nome: RegExp) =>
      getComputedStyle(within(canvasElement).getByRole('row', { name: nome })).backgroundColor;
    await expect(fundoDa(/Equipamento 1\b/)).not.toBe(fundoDa(/Equipamento 2\b/));
    await expect(fundoDa(/Equipamento 1\b/)).toBe(fundoDa(/Equipamento 3\b/));
    const rolagem = grade(canvasElement);
    rolagem.scrollTop = rolagem.scrollHeight;
    await waitFor(() =>
      expect(within(rolagem).getByRole('row', { name: /Equipamento 10\.000/ })).toBeVisible(),
    );
    await expect(linhasDesenhadas(canvasElement).length).toBeLessThan(60);
    const cabecalho = within(rolagem).getByRole('columnheader', { name: /Equipamento/ });
    const topo = rolagem.getBoundingClientRect().top;
    await expect(Math.abs(cabecalho.getBoundingClientRect().top - topo)).toBeLessThan(2);
  },
};

/** Trinta de noventa itens, que chegam de trinta em trinta, como a lista paginada da API. */
function ListaQueCarrega({ aoCarregar }: { aoCarregar?: () => void }) {
  const [lista, definirLista] = useState(() => itens(30));
  const [carregando, definirCarregando] = useState(false);
  return (
    <TabelaDeItens
      lista={lista}
      carregarMais={{
        haMais: lista.length < 90,
        carregando,
        aoCarregar: () => {
          aoCarregar?.();
          definirCarregando(true);
          setTimeout(() => {
            definirLista((atual) => [...atual, ...itens(30, atual.length)]);
            definirCarregando(false);
          }, 200);
        },
      }}
    />
  );
}

/** Ao fim da rolagem, "Carregando mais…" e as próximas trinta ao fim, sem pedir duas vezes. */
export const CargaAoFimDaRolagem: Historia = {
  args: { aoCarregar: fn() },
  render: (args) => <ListaQueCarrega aoCarregar={args.aoCarregar} />,
  play: async ({ args, canvasElement }) => {
    const rolagem = grade(canvasElement);
    await waitFor(() => expect(linhasDesenhadas(canvasElement).length).toBeGreaterThan(0));
    rolagem.scrollTop = rolagem.scrollHeight;
    rolagem.dispatchEvent(new Event('scroll'));
    rolagem.scrollTop = rolagem.scrollHeight;
    await within(rolagem).findByText('Carregando mais…');
    await waitFor(() => expect(within(rolagem).queryByText('Carregando mais…')).toBeNull());
    await expect(args.aoCarregar).toHaveBeenCalledOnce();
    rolagem.scrollTop = rolagem.scrollHeight;
    await waitFor(() =>
      expect(within(rolagem).getByRole('row', { name: /Equipamento 60/ })).toBeInTheDocument(),
    );
  },
};

/** Pelo teclado: chegar à última linha carregada traz a página seguinte, e a seta segue nela. */
export const CargaAoFimPeloTeclado: Historia = {
  args: { aoCarregar: fn() },
  render: (args) => <ListaQueCarrega aoCarregar={args.aoCarregar} />,
  play: async ({ args, canvasElement }) => {
    await userEvent.tab();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(canvasElement).getByRole('row', { name: /Equipamento 1\b/ }),
      ),
    );
    for (let vez = 0; vez < 29; vez++) await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(document.activeElement).toHaveTextContent('Equipamento 30'));
    await waitFor(() => expect(args.aoCarregar).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        within(canvasElement).getByRole('row', { name: /Equipamento 31/ }),
      ).toBeInTheDocument(),
    );
    await userEvent.keyboard('{ArrowDown}');
    await expect(document.activeElement).toHaveTextContent('Equipamento 31');
  },
};

/** A tabela virtualizada parada, para a captura de referência. */
export const Virtualizada: Historia = { render: () => <TabelaDeItens lista={DEZ_MIL} /> };

/** A última linha enquanto a página seguinte chega, para a captura de referência. */
export const CarregandoMais: Historia = {
  render: () => (
    <TabelaDeItens
      lista={itens(3)}
      carregarMais={{ haMais: true, carregando: true, aoCarregar: () => {} }}
    />
  ),
};
