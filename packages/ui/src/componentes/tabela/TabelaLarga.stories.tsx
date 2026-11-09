import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { RotuloDeSituacao } from '../situacao/RotuloDeSituacao.tsx';
import {
  CabecalhoDaTabela,
  Celula,
  Coluna,
  ColunaDeAcoes,
  CorpoDaTabela,
  Linha,
  Tabela,
} from './Tabela.tsx';

// A borda da tabela que rola para o lado (spec componentes-base, "Borda da tabela que rola para o
// lado"; change rolagem-das-tabelas, design, decisões 1 e 2).
const meta: Meta = { title: 'Componentes/Tabela larga' };
export default meta;

type Historia = StoryObj;

const REGRAS = [
  {
    id: 'offline',
    nome: 'Ativo offline',
    condicao: 'Ativo offline',
    duracao: '5 min',
    escopo: 'Organização inteira',
    excecoes: 'Sem exceções',
  },
  {
    id: 'toner',
    nome: 'Toner em 10% ou menos',
    condicao: 'Nível do toner em 10% ou menos, volta acima de 15%',
    duracao: 'Na hora',
    escopo: 'Organização inteira',
    excecoes: '1 exceção',
  },
];

/** As regras de alerta, com mais colunas do que cabem na largura dada. */
function RegrasDeAlerta({ largura }: { largura: string }) {
  return (
    <div style={{ width: largura, padding: 'var(--esp-4)', background: 'var(--cor-superficie)' }}>
      <Tabela rotulo="Regras de alerta">
        <CabecalhoDaTabela>
          <Coluna id="nome" principal>
            Nome
          </Coluna>
          <Coluna id="condicao">Condição</Coluna>
          <Coluna id="duracao">Duração</Coluna>
          <Coluna id="escopo">Escopo</Coluna>
          <Coluna id="excecoes">Exceções</Coluna>
          <Coluna id="situacao" especie="situacao">
            Situação
          </Coluna>
          <ColunaDeAcoes />
        </CabecalhoDaTabela>
        <CorpoDaTabela itens={REGRAS}>
          {(regra) => (
            <Linha id={regra.id}>
              <Celula>{regra.nome}</Celula>
              <Celula>{regra.condicao}</Celula>
              <Celula>{regra.duracao}</Celula>
              <Celula>{regra.escopo}</Celula>
              <Celula>{regra.excecoes}</Celula>
              <Celula>
                <RotuloDeSituacao situacao="sucesso">Ativa</RotuloDeSituacao>
              </Celula>
              <Celula>Inativar</Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
    </div>
  );
}

const areaDa = (canvas: HTMLElement) => canvas.querySelector('[data-rolagem]') as HTMLElement;
const esmaece = (area: HTMLElement) => getComputedStyle(area).maskImage !== 'none';

/** Mais colunas à direita: no começo da rolagem, só a borda direita esmaece. */
export const MaisColunasADireita: Historia = {
  tags: ['captura'],
  render: () => <RegrasDeAlerta largura="calc(var(--esp-12) * 10)" />,
  play: async ({ canvasElement }) => {
    const area = areaDa(canvasElement);
    await expect(area.scrollWidth).toBeGreaterThan(area.clientWidth);
    await waitFor(() => expect(area.hasAttribute('data-mais-a-direita')).toBe(true));
    await expect(area.hasAttribute('data-mais-a-esquerda')).toBe(false);
    await expect(esmaece(area)).toBe(true);
  },
};

/** Rolada até o fim: só a borda esquerda esmaece. */
export const RoladaAteOFim: Historia = {
  render: () => <RegrasDeAlerta largura="calc(var(--esp-12) * 10)" />,
  play: async ({ canvasElement }) => {
    const area = areaDa(canvasElement);
    area.scrollLeft = area.scrollWidth;
    await waitFor(() => expect(area.hasAttribute('data-mais-a-esquerda')).toBe(true));
    await expect(area.hasAttribute('data-mais-a-direita')).toBe(false);
    await expect(esmaece(area)).toBe(true);

    // No meio da rolagem, as duas bordas.
    area.scrollLeft = (area.scrollWidth - area.clientWidth) / 2;
    await waitFor(() => expect(area.hasAttribute('data-mais-a-direita')).toBe(true));
    await expect(area.hasAttribute('data-mais-a-esquerda')).toBe(true);
  },
};

/** Tabela que cabe: nenhuma borda esmaece. */
export const TabelaQueCabe: Historia = {
  render: () => <RegrasDeAlerta largura="100%" />,
  play: async ({ canvasElement }) => {
    const area = areaDa(canvasElement);
    await expect(area.scrollWidth).toBeLessThanOrEqual(area.clientWidth + 1);
    // Um quadro depois da medida, a área continua sem as marcas.
    await new Promise((pronto) => requestAnimationFrame(() => requestAnimationFrame(pronto)));
    await expect(area.hasAttribute('data-mais-a-direita')).toBe(false);
    await expect(area.hasAttribute('data-mais-a-esquerda')).toBe(false);
    await expect(esmaece(area)).toBe(false);
  },
};
