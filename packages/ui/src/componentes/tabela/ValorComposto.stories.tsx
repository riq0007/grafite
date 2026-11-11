import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import { RotuloDeSituacao } from '../situacao/RotuloDeSituacao.tsx';
import { CabecalhoDaTabela, Celula, Coluna, CorpoDaTabela, Linha, Tabela } from './Tabela.tsx';
import { ValorComposto } from './ValorComposto.tsx';

// O valor composto da célula (spec componentes-base, "Célula numa linha só"; change
// celulas-numa-linha, design, decisões 2 e 4): os rótulos de situação ficam inteiros, e o texto que
// os acompanha é o que encolhe, com reticências.
const meta: Meta = { title: 'Componentes/Valor composto' };
export default meta;

type Historia = StoryObj;

const offline = (
  <ValorComposto fixo={<RotuloDeSituacao situacao="critico">Offline</RotuloDeSituacao>}>
    <time className="mono">há 12 min</time>
  </ValorComposto>
);

const toner = (
  <ValorComposto fixo={<span className="mono">8%</span>}>Black Toner Cartridge</ValorComposto>
);

/** Uma linha de impressora, com a disponibilidade e os suprimentos nas larguras dadas. */
function TabelaDaColeta({ disponibilidade, suprimentos }: Record<string, number>) {
  return (
    <div style={{ padding: 'var(--esp-4)', background: 'var(--cor-superficie)' }}>
      <Tabela rotulo="Ativos" redimensionavel>
        <CabecalhoDaTabela>
          <Coluna id="nome" principal largura={180}>
            Ativo
          </Coluna>
          <Coluna id="disponibilidade" largura={disponibilidade}>
            Disponibilidade
          </Coluna>
          <Coluna id="suprimentos" largura={suprimentos}>
            Suprimentos
          </Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela itens={[{ id: 'pat-00412' }]}>
          {(ativo) => (
            <Linha id={ativo.id}>
              <Celula>Impressora do RH</Celula>
              <Celula>{offline}</Celula>
              <Celula>{toner}</Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
    </div>
  );
}

const partesDe = (canvas: HTMLElement, parte: 'fixo' | 'resto') => [
  ...canvas.querySelectorAll<HTMLElement>(`[data-parte="${parte}"]`),
];

/** O texto da parte foi cortado: ele pede mais largura do que a parte tem. */
const cortada = (parte: HTMLElement) => parte.scrollWidth > parte.clientWidth;

/** Na coluna estreita, o fixo fica inteiro, e o resto termina em reticências, numa linha só. */
export const NaColunaEstreita: Historia = {
  tags: ['captura'],
  render: () => <TabelaDaColeta disponibilidade={110} suprimentos={110} />,
  play: async ({ canvasElement }) => {
    const linha = within(canvasElement).getByRole('row', { name: /Impressora do RH/ });
    await waitFor(() => expect(partesDe(canvasElement, 'fixo')).toHaveLength(2));
    // O fixo fica inteiro: dentro da célula dele, sem corte.
    for (const fixo of partesDe(canvasElement, 'fixo')) {
      const celula = fixo.closest('[role="gridcell"]') as HTMLElement;
      await expect(cortada(fixo)).toBe(false);
      await expect(fixo.getBoundingClientRect().right).toBeLessThanOrEqual(
        celula.getBoundingClientRect().right,
      );
    }
    // O resto termina em reticências.
    for (const resto of partesDe(canvasElement, 'resto')) {
      await expect(cortada(resto)).toBe(true);
      await expect(getComputedStyle(resto).textOverflow).toBe('ellipsis');
    }
    // E a linha continua com a altura da densidade em que a história roda.
    const altura = Number.parseFloat(getComputedStyle(linha).getPropertyValue('--altura-linha'));
    await expect(Math.round(linha.getBoundingClientRect().height)).toBe(altura);
  },
};

/** Com a coluna larga, nada é cortado. */
export const NaColunaLarga: Historia = {
  render: () => <TabelaDaColeta disponibilidade={260} suprimentos={280} />,
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(partesDe(canvasElement, 'resto')).toHaveLength(2));
    for (const parte of [...partesDe(canvasElement, 'fixo'), ...partesDe(canvasElement, 'resto')]) {
      await expect(cortada(parte)).toBe(false);
    }
  },
};

/**
 * O que cada coluna da coleta pede para mostrar a situação e a idade sem corte, na densidade normal:
 * a largura de fábrica da coluna, em `packages/domain/src/ativos/colunas.ts`, é a daqui. O respiro
 * da célula é de 12 px de cada lado.
 */
const LARGURAS_DE_FABRICA = {
  disponibilidade: 210,
  controlId: 280,
  suprimentos: 340,
  paginas: 200,
} as const;

/**
 * O cabeçalho "Total de páginas", com a ordem e o menu, pede mais que o conteúdo da coluna: 196 px
 * na densidade confortável (história "Cabeçalhos na largura de fábrica").
 */
const O_QUE_O_CABECALHO_PEDE: Partial<Record<keyof typeof LARGURAS_DE_FABRICA, number>> = {
  paginas: 196,
};

const RESPIRO_DA_CELULA = 24;

/** A largura de fábrica vale nas três densidades. */
const DENSIDADES = ['compacta', 'normal', 'confortavel'] as const;

const idade = <time className="mono">há 59 min</time>;

/** O lugar do medidor compacto da coluna dos suprimentos, que tem 40 px. */
const medidor = <span style={{ display: 'inline-block', inlineSize: '40px' }} />;

/** O conteúdo mais largo que cada coluna mostra no dia a dia, com a idade de até uma hora. */
const O_QUE_A_COLETA_MOSTRA: Record<keyof typeof LARGURAS_DE_FABRICA, ReactNode> = {
  disponibilidade: (
    <ValorComposto fixo={<RotuloDeSituacao situacao="atencao">Sem dado</RotuloDeSituacao>}>
      {idade}
    </ValorComposto>
  ),
  controlId: (
    <ValorComposto fixo={<RotuloDeSituacao situacao="info">Resposta inesperada</RotuloDeSituacao>}>
      {idade}
    </ValorComposto>
  ),
  suprimentos: (
    <ValorComposto
      fixo={
        <>
          {medidor}
          <span className="mono">100%</span>
        </>
      }
    >
      <span>Black Toner Cartridge</span>
      {idade}
    </ValorComposto>
  ),
  paginas: <ValorComposto fixo={<span className="mono">1.234.567</span>}>{idade}</ValorComposto>,
};

/** A largura que cada coluna da coleta pede, medida sem coluna nenhuma em volta. */
export const LargurasQueAColetaPede: Historia = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--esp-4)', padding: 'var(--esp-4)' }}>
      {DENSIDADES.map((densidade) => (
        <div
          key={densidade}
          data-density={densidade}
          style={{ display: 'grid', gap: 'var(--esp-2)' }}
        >
          {Object.entries(O_QUE_A_COLETA_MOSTRA).map(([coluna, conteudo]) => (
            <div key={coluna} data-coluna={coluna} style={{ justifySelf: 'start' }}>
              {conteudo}
            </div>
          ))}
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const coluna of Object.keys(LARGURAS_DE_FABRICA) as (keyof typeof LARGURAS_DE_FABRICA)[]) {
      const largura = LARGURAS_DE_FABRICA[coluna];
      const medidas = [...canvasElement.querySelectorAll<HTMLElement>(`[data-coluna="${coluna}"]`)];
      await expect(medidas).toHaveLength(DENSIDADES.length);
      const conteudo =
        Math.max(...medidas.map((medida) => Math.ceil(medida.getBoundingClientRect().width))) +
        RESPIRO_DA_CELULA;
      // A coluna comporta o conteúdo e o cabeçalho, e a largura acompanha a maior das duas medidas,
      // sem sobrar mais que 20 px. A mesma fonte mede alguns pixels a menos no Linux: no Windows, em
      // que as larguras foram medidas, sobram até 9 px; no Linux do CI, até 14, na "Disponibilidade"
      // e nos "Suprimentos".
      const pede = Math.max(conteudo, O_QUE_O_CABECALHO_PEDE[coluna] ?? 0);
      await expect(pede).toBeLessThanOrEqual(largura);
      await expect(largura - pede).toBeLessThan(20);
    }
  },
};

const NOMES_DAS_COLUNAS: Record<keyof typeof LARGURAS_DE_FABRICA, string> = {
  disponibilidade: 'Disponibilidade',
  controlId: 'Control iD',
  suprimentos: 'Suprimentos',
  paginas: 'Total de páginas',
};

const COLUNAS_DA_COLETA = Object.keys(LARGURAS_DE_FABRICA) as (keyof typeof LARGURAS_DE_FABRICA)[];

/** O nome da coluna no cabeçalho: o elemento de texto que termina em reticências quando não cabe. */
const nomeNoCabecalho = (cabecalho: HTMLElement) =>
  [...cabecalho.querySelectorAll<HTMLElement>('*')].find(
    (parte) => parte.children.length === 0 && getComputedStyle(parte).textOverflow === 'ellipsis',
  );

/**
 * O cabeçalho de cada coluna da coleta, com a ordem e o menu, cabe na largura de fábrica nas três
 * densidades: o nome da coluna não termina em reticências.
 */
export const CabecalhosNaLarguraDeFabrica: Historia = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--esp-4)', padding: 'var(--esp-4)' }}>
      {DENSIDADES.map((densidade) => (
        <div key={densidade} data-density={densidade}>
          <Tabela rotulo={`Colunas da coleta, densidade ${densidade}`} redimensionavel>
            <CabecalhoDaTabela>
              <Coluna id="nome" principal largura={180}>
                Ativo
              </Coluna>
              {COLUNAS_DA_COLETA.map((coluna) => (
                <Coluna key={coluna} id={coluna} ordenavel largura={LARGURAS_DE_FABRICA[coluna]}>
                  {NOMES_DAS_COLUNAS[coluna]}
                </Coluna>
              ))}
            </CabecalhoDaTabela>
            <CorpoDaTabela itens={[{ id: 'pat-00412' }]}>
              {(ativo) => (
                <Linha id={ativo.id}>
                  <Celula>Impressora do RH</Celula>
                  {COLUNAS_DA_COLETA.map((coluna) => (
                    <Celula key={coluna}>{O_QUE_A_COLETA_MOSTRA[coluna]}</Celula>
                  ))}
                </Linha>
              )}
            </CorpoDaTabela>
          </Tabela>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const nome of Object.values(NOMES_DAS_COLUNAS)) {
      const cabecalhos = within(canvasElement).getAllByRole('columnheader', {
        name: new RegExp(nome),
      });
      await expect(cabecalhos).toHaveLength(DENSIDADES.length);
      for (const cabecalho of cabecalhos) {
        const texto = nomeNoCabecalho(cabecalho) as HTMLElement;
        await expect(texto).toBeDefined();
        await expect(texto.scrollWidth).toBeLessThanOrEqual(texto.clientWidth);
      }
    }
    // E o conteúdo de cada coluna continua inteiro, nas três densidades.
    for (const parte of [...partesDe(canvasElement, 'fixo'), ...partesDe(canvasElement, 'resto')]) {
      await expect(cortada(parte)).toBe(false);
    }
  },
};
