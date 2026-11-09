import {
  CabecalhoDaTabela,
  Celula,
  CelulaDaMiniatura,
  Coluna,
  ColunaDaMiniatura,
  CorpoDaTabela,
  Formulario,
  Interruptor,
  Linha,
  MiniaturaDeAtivo,
  ProvedorDaTabela,
  Tabela,
} from '@grafite/ui';
import {
  RestaurarPadroes,
  TituloDaSecao,
  useAlvoDasPreferencias,
  useAlvoEhAConta,
} from '../../../preferencias/alvo.tsx';
import { MudancasNasTabelas } from './MudancasNasTabelas.tsx';
import estilos from './Secoes.module.css';

/** Linhas da tabela de exemplo: dados fictícios, marcados como exemplo na legenda e no patrimônio. */
const EXEMPLO = [
  {
    id: '1',
    tipo: 'impressora',
    nome: 'Impressora laser',
    patrimonio: 'EXEMPLO-01',
    local: 'Recepção',
  },
  { id: '2', tipo: 'notebook', nome: 'Notebook', patrimonio: 'EXEMPLO-02', local: 'Financeiro' },
  { id: '3', tipo: 'switch', nome: 'Switch de 24 portas', patrimonio: 'EXEMPLO-03', local: 'CPD' },
  { id: '4', tipo: 'nobreak', nome: 'Nobreak de 3 kVA', patrimonio: 'EXEMPLO-04', local: 'CPD' },
];

/**
 * Seção Tabelas: as linhas alternadas, a miniatura no início da linha e o resumo da linha, para
 * todas as tabelas, com uma tabela de exemplo que muda na hora e segue as preferências em edição.
 * Nas preferências da conta, também as mudanças dela nas visões, para restaurar.
 */
export function SecaoTabelas() {
  const { preferencias, mudar } = useAlvoDasPreferencias();
  const daConta = useAlvoEhAConta();
  const { linhasAlternadas, miniaturas, resumoDaLinha } = preferencias.tabelas;
  return (
    <>
      <TituloDaSecao>Tabelas</TituloDaSecao>
      <Formulario aria-label="Tabelas" onSubmit={(evento) => evento.preventDefault()}>
        <Interruptor
          data-foco="linhas-alternadas"
          isSelected={linhasAlternadas}
          onChange={(ligado) => mudar('tabelas', { linhasAlternadas: ligado })}
        >
          Linhas alternadas
        </Interruptor>

        <Interruptor
          data-foco="miniaturas"
          isSelected={miniaturas}
          onChange={(ligado) => mudar('tabelas', { miniaturas: ligado })}
        >
          Miniaturas
        </Interruptor>

        <Interruptor
          data-foco="resumo-da-linha"
          isSelected={resumoDaLinha}
          onChange={(ligado) => mudar('tabelas', { resumoDaLinha: ligado })}
          descricao="Ao parar o mouse 1,5 s sobre uma linha, mostra as colunas que estão fora da tela."
        >
          Resumo da linha
        </Interruptor>

        <figure className={estilos.exemplo}>
          <figcaption className={estilos.tituloDoGrupo}>Exemplo com dados fictícios</figcaption>
          <ProvedorDaTabela linhasAlternadas={linhasAlternadas} miniaturas={miniaturas}>
            <Tabela rotulo="Tabela de exemplo">
              <CabecalhoDaTabela>
                <ColunaDaMiniatura />
                <Coluna id="nome" principal>
                  Equipamento
                </Coluna>
                <Coluna id="patrimonio" especie="codigo">
                  Patrimônio
                </Coluna>
                <Coluna id="local">Local</Coluna>
              </CabecalhoDaTabela>
              <CorpoDaTabela itens={EXEMPLO}>
                {(linha) => (
                  <Linha id={linha.id}>
                    <CelulaDaMiniatura>
                      <MiniaturaDeAtivo tipo={linha.tipo} />
                    </CelulaDaMiniatura>
                    <Celula>{linha.nome}</Celula>
                    <Celula>{linha.patrimonio}</Celula>
                    <Celula>{linha.local}</Celula>
                  </Linha>
                )}
              </CorpoDaTabela>
            </Tabela>
          </ProvedorDaTabela>
        </figure>

        <div>
          <RestaurarPadroes secao="tabelas" />
        </div>

        {daConta && <MudancasNasTabelas />}
      </Formulario>
    </>
  );
}
