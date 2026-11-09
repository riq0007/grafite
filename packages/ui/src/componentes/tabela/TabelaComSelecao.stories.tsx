import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ATIVOS } from './exemplos.ts';
import {
  CabecalhoDaTabela,
  Celula,
  Coluna,
  ContagemDaSelecao,
  CorpoDaTabela,
  Linha,
  Tabela,
} from './Tabela.tsx';

const meta: Meta = { title: 'Componentes/Tabela com seleção' };
export default meta;

interface Espioes {
  aoAbrirLinha?: (chave: string) => void;
  aoPreverLinha?: (chave: string) => void;
}

type Historia = StoryObj<Espioes>;

/** A tabela dos ativos com a seleção, a contagem dela e as ações de abrir e de prever. */
function TabelaComSelecao({
  aoAbrirLinha,
  aoPreverLinha,
  selecaoInicial = [],
}: Espioes & { selecaoInicial?: string[] }) {
  const [selecao, definirSelecao] = useState<ReadonlySet<string>>(new Set(selecaoInicial));
  return (
    <div style={{ display: 'grid', gap: 'var(--esp-2)' }}>
      <ContagemDaSelecao quantas={selecao.size} aoLimpar={() => definirSelecao(new Set())} />
      <Tabela
        rotulo="Ativos"
        selecao={selecao}
        aoMudarSelecao={definirSelecao}
        aoAbrirLinha={aoAbrirLinha}
        aoPreverLinha={aoPreverLinha}
        alturaMaxima="360px"
      >
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
    </div>
  );
}

const linha = (canvas: HTMLElement, nome: string) =>
  within(canvas).getByRole('row', { name: new RegExp(nome) });

const selecionadas = (canvas: HTMLElement) =>
  within(canvas)
    .getAllByRole('row')
    .filter((elemento) => elemento.getAttribute('aria-selected') === 'true')
    .map((elemento) => within(elemento).getAllByRole('rowheader')[0]?.textContent);

/** O clique com a tecla apertada: a mesma sessão do usuário guarda a tecla entre os passos. */
const clicarCom = async (elemento: HTMLElement, tecla: 'Control' | 'Shift') => {
  const usuario = userEvent.setup();
  await usuario.keyboard(`{${tecla}>}`);
  await usuario.click(elemento);
  await usuario.keyboard(`{/${tecla}}`);
};

/** Ctrl+clique põe e tira a linha da seleção, sem abrir o registro, e a tabela diz quantas. */
export const CtrlClique: Historia = {
  args: { aoAbrirLinha: fn() },
  render: (args) => <TabelaComSelecao aoAbrirLinha={args.aoAbrirLinha} />,
  play: async ({ args, canvasElement }) => {
    for (const nome of ['HP LaserJet', 'Aruba', 'Nobreak']) {
      await clicarCom(linha(canvasElement, nome), 'Control');
    }
    await expect(selecionadas(canvasElement)).toEqual([
      'HP LaserJet M404dn',
      'Aruba 2930F 48p',
      'Nobreak 3 kVA',
    ]);
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent('3 selecionados');
    await clicarCom(linha(canvasElement, 'Aruba'), 'Control');
    await expect(selecionadas(canvasElement)).toEqual(['HP LaserJet M404dn', 'Nobreak 3 kVA']);
    await expect(args.aoAbrirLinha).not.toHaveBeenCalled();
  },
};

/** A cor do destaque como o navegador a calcula, para comparar com a sombra da célula. */
const corDoDestaque = (canvas: HTMLElement) => {
  const amostra = document.createElement('span');
  amostra.style.color = 'var(--cor-destaque)';
  canvas.append(amostra);
  const cor = getComputedStyle(amostra).color;
  amostra.remove();
  return cor;
};

/** A linha selecionada tem a marca lateral de 2 px no destaque, além do fundo; as outras, não. */
export const MarcaDaSelecao: Historia = {
  args: { aoAbrirLinha: fn() },
  render: (args) => <TabelaComSelecao aoAbrirLinha={args.aoAbrirLinha} />,
  play: async ({ canvasElement }) => {
    await clicarCom(linha(canvasElement, 'HP LaserJet'), 'Control');
    const marca = (nome: string) =>
      getComputedStyle(linha(canvasElement, nome).firstElementChild as HTMLElement).boxShadow;
    await expect(marca('HP LaserJet')).toContain(corDoDestaque(canvasElement));
    await expect(marca('HP LaserJet')).toMatch(/2px 0px 0px( 0px)? inset/);
    await expect(marca('Aruba')).toBe('none');
  },
};

/** Shift+clique seleciona da última linha escolhida até a clicada. */
export const ShiftClique: Historia = {
  render: () => <TabelaComSelecao />,
  play: async ({ canvasElement }) => {
    await clicarCom(linha(canvasElement, 'Dell OptiPlex'), 'Control');
    await clicarCom(linha(canvasElement, 'Câmera'), 'Shift');
    await expect(selecionadas(canvasElement)).toEqual([
      'Dell OptiPlex 7010',
      'Aruba 2930F 48p',
      'Control iD iDFace',
      'Nobreak 3 kVA',
      'Câmera Intelbras VIP',
    ]);
  },
};

/** O clique simples abre o registro, com ou sem seleção. */
export const CliqueSimplesAbre: Historia = {
  args: { aoAbrirLinha: fn() },
  render: (args) => <TabelaComSelecao aoAbrirLinha={args.aoAbrirLinha} />,
  play: async ({ args, canvasElement }) => {
    await clicarCom(linha(canvasElement, 'HP LaserJet'), 'Control');
    await clicarCom(linha(canvasElement, 'Dell OptiPlex'), 'Control');
    await userEvent.click(within(linha(canvasElement, 'Aruba')).getByText('CPD · Rack A'));
    await expect(args.aoAbrirLinha).toHaveBeenCalledWith('3');
    await expect(args.aoAbrirLinha).toHaveBeenCalledOnce();
  },
};

/** Pelo teclado: Shift com as setas estende a seleção, Ctrl+A seleciona todas e Esc limpa. */
export const SelecaoPeloTeclado: Historia = {
  args: { aoAbrirLinha: fn() },
  render: (args) => <TabelaComSelecao aoAbrirLinha={args.aoAbrirLinha} />,
  play: async ({ args, canvasElement }) => {
    await userEvent.tab();
    await waitFor(() => expect(document.activeElement).toBe(linha(canvasElement, 'HP LaserJet')));
    // As setas sozinhas só movem o foco.
    await userEvent.keyboard('{ArrowDown}');
    await expect(selecionadas(canvasElement)).toEqual([]);
    await userEvent.keyboard('{Shift>}{ArrowDown}{ArrowDown}{/Shift}');
    await expect(selecionadas(canvasElement)).toEqual([
      'Dell OptiPlex 7010',
      'Aruba 2930F 48p',
      'Control iD iDFace',
    ]);
    await userEvent.keyboard('{Control>}a{/Control}');
    await waitFor(() => expect(selecionadas(canvasElement)).toHaveLength(8));
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent('8 selecionados');
    await userEvent.keyboard('{Escape}');
    await expect(selecionadas(canvasElement)).toEqual([]);
    // Enter continua abrindo o registro da linha em foco.
    await userEvent.keyboard('{Enter}');
    await expect(args.aoAbrirLinha).toHaveBeenCalledWith('4');
  },
};

/** O espaço continua pedindo a prévia, e a seleção fica como estava. */
export const EspacoComSelecao: Historia = {
  args: { aoPreverLinha: fn() },
  render: (args) => <TabelaComSelecao aoPreverLinha={args.aoPreverLinha} />,
  play: async ({ args, canvasElement }) => {
    await clicarCom(linha(canvasElement, 'HP LaserJet'), 'Control');
    await clicarCom(linha(canvasElement, 'Aruba'), 'Control');
    await userEvent.keyboard(' ');
    await expect(args.aoPreverLinha).toHaveBeenCalledWith('3');
    await expect(selecionadas(canvasElement)).toEqual(['HP LaserJet M404dn', 'Aruba 2930F 48p']);
  },
};

/** "Limpar seleção" esvazia a seleção, e a contagem some. */
export const LimparSelecao: Historia = {
  render: () => <TabelaComSelecao />,
  play: async ({ canvasElement }) => {
    await clicarCom(linha(canvasElement, 'Rack'), 'Control');
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent('1 selecionado');
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Limpar seleção' }));
    await expect(selecionadas(canvasElement)).toEqual([]);
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent('');
  },
};

/** Duas linhas selecionadas, para a captura de referência. */
export const ComLinhasSelecionadas: Historia = {
  render: () => <TabelaComSelecao selecaoInicial={['2', '5']} />,
};
