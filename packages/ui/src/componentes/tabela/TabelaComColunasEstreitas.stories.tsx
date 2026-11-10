import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { RotuloDeSituacao } from '../situacao/RotuloDeSituacao.tsx';
import { CabecalhoDaTabela, Celula, Coluna, CorpoDaTabela, Linha, Tabela } from './Tabela.tsx';
import estilos from './TabelaComColunasEstreitas.module.css';
import { ValorComposto } from './ValorComposto.tsx';

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

/**
 * Seis colunas sem largura guardada numa área de 720 px: a divisão da sobra deixaria cada uma em
 * 120 px, e a "Disponibilidade" cortaria a idade da leitura.
 */
function TabelaNaDivisao() {
  return (
    <div style={{ width: '720px' }}>
      <Tabela rotulo="Ativos, com a sobra dividida" redimensionavel>
        <CabecalhoDaTabela>
          <Coluna id="nome" principal>
            Ativo
          </Coluna>
          <Coluna id="patrimonio">Patrimônio</Coluna>
          <Coluna id="local">Local</Coluna>
          <Coluna id="serie">Série</Coluna>
          <Coluna id="responsavel">Responsável</Coluna>
          <Coluna id="disponibilidade" larguraMinima={210}>
            Disponibilidade
          </Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela itens={ATIVOS}>
          {(ativo) => (
            <Linha id={ativo.id}>
              <Celula>{ativo.nome}</Celula>
              <Celula mono>{ativo.id.toUpperCase()}</Celula>
              <Celula>Almoxarifado</Celula>
              <Celula mono>VNB3K12345</Celula>
              <Celula>Ana Souza</Celula>
              <Celula>
                <ValorComposto
                  fixo={<RotuloDeSituacao situacao="critico">Offline</RotuloDeSituacao>}
                >
                  <time className="mono">há 12 min</time>
                </ValorComposto>
              </Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
    </div>
  );
}

/**
 * A coluna que declara a largura que o conteúdo dela pede não fica mais estreita que ela na divisão
 * da sobra (spec componentes-base, "Tabela na largura toda"): a situação e a idade aparecem
 * inteiras, as outras colunas seguem com o mínimo da divisão, e a tabela rola de lado.
 */
export const LarguraQueOConteudoPede: Historia = {
  render: () => <TabelaNaDivisao />,
  play: async ({ canvasElement }) => {
    const largura = (nome: RegExp) =>
      Math.round(
        within(canvasElement).getByRole('columnheader', { name: nome }).getBoundingClientRect()
          .width,
      );
    await waitFor(() => expect(largura(/Disponibilidade/)).toBeGreaterThanOrEqual(210));
    await expect(largura(/Local/)).toBe(120);
    const restos = [...canvasElement.querySelectorAll<HTMLElement>('[data-parte="resto"]')];
    await expect(restos).toHaveLength(ATIVOS.length);
    for (const resto of restos) {
      await expect(resto.scrollWidth).toBeLessThanOrEqual(resto.clientWidth + 1);
    }
  },
};
