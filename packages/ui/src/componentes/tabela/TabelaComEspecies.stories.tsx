import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Botao } from '../botao/Botao.tsx';
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

// A espécie da coluna, que a célula segue (spec componentes-base, "Espécie da coluna da tabela";
// change tabelas-consistentes, design, decisões 1 e 2).
const meta: Meta = { title: 'Componentes/Tabela com espécies' };
export default meta;

type Historia = StoryObj;

const SALDOS = [
  {
    id: 'cf258a',
    nome: 'HP 58A',
    codigo: 'CF258A',
    saldo: 2,
    minimo: 3,
    desde: '22/10/2026 11:00',
  },
  {
    id: 'tn1060',
    nome: 'Brother TN-1060',
    codigo: 'TN-1060',
    saldo: 14,
    minimo: 4,
    desde: '28/10/2026 09:15',
  },
];

function TabelaDoEstoque() {
  return (
    <div style={{ padding: 'var(--esp-4)', background: 'var(--cor-superficie)' }}>
      <Tabela rotulo="Estoque">
        <CabecalhoDaTabela>
          <Coluna id="nome" principal>
            Consumível
          </Coluna>
          <Coluna id="codigo" especie="codigo">
            Código
          </Coluna>
          <Coluna id="saldo" especie="numero">
            Saldo
          </Coluna>
          <Coluna id="minimo" especie="numero">
            Mínimo
          </Coluna>
          <Coluna id="desde" especie="data">
            Última movimentação
          </Coluna>
          <Coluna id="situacao" especie="situacao">
            Situação
          </Coluna>
          <ColunaDeAcoes />
        </CabecalhoDaTabela>
        <CorpoDaTabela itens={SALDOS}>
          {(saldo) => (
            <Linha id={saldo.id}>
              <Celula>{saldo.nome}</Celula>
              <Celula>{saldo.codigo}</Celula>
              <Celula>{saldo.saldo}</Celula>
              <Celula>{saldo.minimo}</Celula>
              <Celula>{saldo.desde}</Celula>
              <Celula>
                {saldo.saldo < saldo.minimo ? (
                  <RotuloDeSituacao situacao="atencao">Abaixo do mínimo</RotuloDeSituacao>
                ) : (
                  <RotuloDeSituacao situacao="sucesso">Em dia</RotuloDeSituacao>
                )}
              </Celula>
              <Celula>
                <Botao>Definir mínimo</Botao>
                <Botao>Lançar</Botao>
              </Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
    </div>
  );
}

/** A fonte mono como o navegador a calcula, para comparar com a da célula. */
const fonteMono = (canvas: HTMLElement) => {
  const amostra = document.createElement('span');
  amostra.style.fontFamily = 'var(--fonte-mono)';
  canvas.append(amostra);
  const fonte = getComputedStyle(amostra).fontFamily;
  amostra.remove();
  return fonte;
};

/**
 * O número à direita e na mono, no cabeçalho e no valor, sem a célula repetir; o código na mono; e
 * as ações lado a lado, numa linha da altura das outras.
 */
export const EspeciesDasColunas: Historia = {
  // Com a interação, ela também entra na regressão visual, como a referência das espécies.
  tags: ['captura'],
  render: () => <TabelaDoEstoque />,
  play: async ({ canvasElement }) => {
    const tabela = within(canvasElement).getByRole('grid', { name: 'Estoque' });
    const cabecalhos = within(tabela).getAllByRole('columnheader');
    const indice = (nome: string) => cabecalhos.findIndex((c) => c.textContent?.includes(nome));
    const [linha] = within(tabela)
      .getAllByRole('row')
      .filter((r) => within(r).queryAllByRole('gridcell').length > 0) as [HTMLElement];
    const celulas = [...linha.children] as HTMLElement[];
    const celulaDe = (nome: string) => celulas[indice(nome)] as HTMLElement;
    const mono = fonteMono(canvasElement);
    /** O texto da célula: onde ele termina e a fonte em que está. */
    const texto = (celula: HTMLElement) => {
      const no = document.createTreeWalker(celula, NodeFilter.SHOW_TEXT).nextNode() as Text;
      const trecho = document.createRange();
      trecho.selectNodeContents(no);
      return {
        direita: trecho.getBoundingClientRect().right,
        fonte: getComputedStyle(no.parentElement as HTMLElement).fontFamily,
      };
    };
    const direitaDoConteudo = (celula: HTMLElement) =>
      celula.getBoundingClientRect().right -
      Number.parseFloat(getComputedStyle(celula).paddingRight);

    // Número alinhado: o cabeçalho e o valor à direita, e o valor na mono.
    await expect(getComputedStyle(cabecalhos[indice('Saldo')] as HTMLElement).textAlign).toBe(
      'end',
    );
    const saldo = celulaDe('Saldo');
    await expect(Math.abs(texto(saldo).direita - direitaDoConteudo(saldo))).toBeLessThanOrEqual(1);
    await expect(texto(saldo).fonte).toBe(mono);
    await expect(texto(celulaDe('Código')).fonte).toBe(mono);
    await expect(texto(celulaDe('Consumível')).fonte).not.toBe(mono);

    // Ações numa linha: o cabeçalho "Ações" e os dois botões lado a lado, sem a linha crescer.
    await expect(cabecalhos[indice('Ações')]?.textContent).toContain('Ações');
    const [definir, lancar] = within(celulaDe('Ações')).getAllByRole('button') as [
      HTMLElement,
      HTMLElement,
    ];
    await expect(definir.getBoundingClientRect().top).toBe(lancar.getBoundingClientRect().top);
    const altura = Number.parseFloat(getComputedStyle(tabela).getPropertyValue('--altura-linha'));
    await expect(linha.getBoundingClientRect().height).toBeLessThanOrEqual(altura + 1);
  },
};
