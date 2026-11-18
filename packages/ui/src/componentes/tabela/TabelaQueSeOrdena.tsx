// A tabela que se ordena pelo arraste (change chamados-da-ti, design, "A tela dos tipos (tarefa
// 5.19)"): uma linha escolhida, que o clique e as setas trocam, e a alça de cada linha, que muda a
// ordem com o ponteiro ou pelo teclado (o Enter na alça, as setas e o Enter, que o React Aria
// anuncia). Quem usa a tabela calcula a ordem nova a partir da soltura e a grava.
import { GripVertical } from 'lucide-react';
import type { ReactNode } from 'react';
import { VisuallyHidden } from 'react-aria';
import {
  Cell,
  Column,
  DropIndicator,
  Row,
  Table,
  TableBody,
  TableHeader,
  useDragAndDrop,
} from 'react-aria-components';
import { BotaoDeIcone } from '../../icones/Icone.tsx';
import estilos from './TabelaQueSeOrdena.module.css';

export interface ColunaQueSeOrdena<T> {
  id: string;
  titulo: string;
  /** A largura fixa, em px; sem ela, a coluna fica com o resto da largura. */
  largura?: number;
  /** A coluna que dá o nome da linha, que o leitor de tela lê ao entrar nela. */
  nomeDaLinha?: boolean;
  /** Números e prazos, em mono. */
  mono?: boolean;
  celula: (item: T) => ReactNode;
}

/** Onde os itens arrastados foram soltos: antes ou depois do alvo. */
export interface SolturaNaTabela {
  movidos: string[];
  alvo: string;
  posicao: 'before' | 'after';
}

export interface PropsDaTabelaQueSeOrdena<T> {
  /** O id do título que dá o nome da tabela. */
  'aria-labelledby': string;
  itens: readonly T[];
  idDe: (item: T) => string;
  /** O nome do item, na alça ("Arrastar Impressora") e no que o arraste leva. */
  nomeDe: (item: T) => string;
  colunas: readonly ColunaQueSeOrdena<T>[];
  escolhido: string | null;
  aoEscolher: (id: string) => void;
  aoSoltar: (soltura: SolturaNaTabela) => void;
  /** A linha mais alta, como a que tem um selo embaixo do nome. */
  alta?: (item: T) => boolean;
}

export function TabelaQueSeOrdena<T extends object>({
  'aria-labelledby': rotuladaPor,
  itens,
  idDe,
  nomeDe,
  colunas,
  escolhido,
  aoEscolher,
  aoSoltar,
  alta,
}: PropsDaTabelaQueSeOrdena<T>) {
  const porId = new Map(itens.map((item) => [idDe(item), item]));
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (chaves) =>
      [...chaves].map((chave) => {
        const item = porId.get(String(chave));
        return { 'text/plain': item ? nomeDe(item) : '' };
      }),
    onReorder: ({ keys, target }) =>
      aoSoltar({
        movidos: [...keys].map(String),
        alvo: String(target.key),
        posicao: target.dropPosition === 'before' ? 'before' : 'after',
      }),
    renderDropIndicator: (alvo) => <DropIndicator target={alvo} className={estilos.indicador} />,
  });

  return (
    <Table
      aria-labelledby={rotuladaPor}
      selectionMode="single"
      selectionBehavior="replace"
      disallowEmptySelection
      selectedKeys={escolhido === null ? [] : [escolhido]}
      onSelectionChange={(chaves) => {
        if (chaves === 'all') return;
        const [id] = chaves;
        if (id !== undefined && String(id) !== escolhido) aoEscolher(String(id));
      }}
      dragAndDropHooks={dragAndDropHooks}
      className={estilos.tabela}
    >
      <TableHeader>
        <Column id="alca" className={estilos.colunaDaAlca}>
          <VisuallyHidden>Ordem</VisuallyHidden>
        </Column>
        {colunas.map((coluna) => (
          <Column
            key={coluna.id}
            id={coluna.id}
            isRowHeader={coluna.nomeDaLinha}
            style={coluna.largura === undefined ? undefined : { width: coluna.largura }}
          >
            {coluna.titulo}
          </Column>
        ))}
      </TableHeader>
      <TableBody items={itens}>
        {(item) => (
          <Row
            id={idDe(item)}
            textValue={nomeDe(item)}
            className={alta?.(item) ? `${estilos.linha} ${estilos.alta}` : estilos.linha}
          >
            <Cell className={estilos.celulaDaAlca}>
              <BotaoDeIcone
                slot="drag"
                icone={GripVertical}
                rotulo={`Arrastar ${nomeDe(item)}`}
                comDica={false}
              />
            </Cell>
            {colunas.map((coluna) => (
              <Cell key={coluna.id} className={coluna.mono ? estilos.mono : undefined}>
                {coluna.celula(item)}
              </Cell>
            ))}
          </Row>
        )}
      </TableBody>
    </Table>
  );
}
