import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { RotuloDeSituacao } from '../situacao/RotuloDeSituacao.tsx';
import { CabecalhoDaTabela, Celula, Coluna, CorpoDaTabela, Linha, Tabela } from './Tabela.tsx';
import estilos from './TabelaComColunasEstreitas.module.css';

// A célula numa linha só (spec componentes-base, "Célula numa linha só"; change celulas-numa-linha,
// design, decisões 1 e 5): as células compostas dos módulos, em colunas na largura mínima, não
// aumentam a altura da linha nem passam para a linha de baixo, em nenhuma densidade.
const meta: Meta = { title: 'Componentes/Tabela com colunas estreitas' };
export default meta;

type Historia = StoryObj;

/** As três densidades, com a altura da linha de cada uma, em px. */
const DENSIDADES = [
  ['compacta', 36],
  ['normal', 44],
  ['confortavel', 52],
] as const;

const ATIVOS = [
  { id: 'pat-00412', nome: 'Impressora do RH' },
  { id: 'pat-00413', nome: 'Impressora do Financeiro' },
  { id: 'pat-00777', nome: 'Controle da portaria' },
];

/** A tabela redimensionável com as colunas da coleta em 64 px, a menor largura que ela aceita. */
function TabelaEstreita({ virtualizada }: { virtualizada: boolean }) {
  return (
    <div className={virtualizada ? estilos.virtualizada : undefined}>
      <Tabela
        rotulo={virtualizada ? 'Ativos, só as linhas visíveis' : 'Ativos'}
        redimensionavel
        virtualizada={virtualizada}
      >
        <CabecalhoDaTabela>
          <Coluna id="nome" principal largura={180}>
            Ativo
          </Coluna>
          <Coluna id="disponibilidade" largura={64}>
            Disponibilidade
          </Coluna>
          <Coluna id="suprimentos" largura={64}>
            Suprimentos
          </Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela itens={ATIVOS}>
          {(ativo) => (
            <Linha id={ativo.id}>
              <Celula>{ativo.nome}</Celula>
              <Celula>
                <span className={estilos.queQuebra} data-composto>
                  <RotuloDeSituacao situacao="critico">Offline</RotuloDeSituacao>
                  <time className="mono">há 12 min</time>
                  <RotuloDeSituacao situacao="atencao">Desatualizado</RotuloDeSituacao>
                </span>
              </Celula>
              <Celula>
                <span className={estilos.queQuebra} data-composto>
                  <span className="mono">8%</span>
                  <span>Black Toner Cartridge</span>
                </span>
              </Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
    </div>
  );
}

function NasTresDensidades({ virtualizada }: { virtualizada: boolean }) {
  return (
    <div className={estilos.faixas}>
      {DENSIDADES.map(([densidade]) => (
        <div key={densidade} data-density={densidade} data-faixa={densidade}>
          <TabelaEstreita virtualizada={virtualizada} />
        </div>
      ))}
    </div>
  );
}

const linhasDe = (faixa: HTMLElement) =>
  within(faixa)
    .getAllByRole('row')
    .filter((linha) => !linha.querySelector('[role="columnheader"]'));

/** Toda linha na altura da densidade, e toda célula composta numa linha só. */
async function conferirUmaLinha(canvasElement: HTMLElement) {
  for (const [densidade, altura] of DENSIDADES) {
    const faixa = canvasElement.querySelector(`[data-faixa="${densidade}"]`) as HTMLElement;
    await waitFor(() => expect(linhasDe(faixa)).toHaveLength(ATIVOS.length));
    for (const linha of linhasDe(faixa)) {
      await expect(Math.round(linha.getBoundingClientRect().height)).toBe(altura);
    }
    const compostos = [...faixa.querySelectorAll<HTMLElement>('[data-composto]')];
    await expect(compostos).toHaveLength(ATIVOS.length * 2);
    for (const composto of compostos) {
      await expect(Math.round(composto.getBoundingClientRect().height)).toBeLessThanOrEqual(altura);
    }
  }
}

/** Na tabela redimensionável, a linha não cresce com a célula composta numa coluna de 64 px. */
export const ColunasEstreitas: Historia = {
  render: () => <NasTresDensidades virtualizada={false} />,
  play: async ({ canvasElement }) => conferirUmaLinha(canvasElement),
};

/** Na tabela que desenha só as linhas visíveis, o conteúdo não passa da altura fixa da linha. */
export const ColunasEstreitasSoComAsLinhasVisiveis: Historia = {
  render: () => <NasTresDensidades virtualizada />,
  play: async ({ canvasElement }) => conferirUmaLinha(canvasElement),
};
