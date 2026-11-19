// A tabela que se ordena (change chamados-da-ti, design, decisão 15 e "A tela dos tipos (tarefa
// 5.19)"): uma linha escolhida, que o clique e as setas trocam; a alça de cada linha, que leva o
// aperto ao arraste de quem usa a tabela (o `useArrastar` da web); a linha de encaixe, no alto ou
// embaixo da linha sob o ponteiro; e o menu da linha, pelo clique direito, pela tecla de menu e por
// Shift+F10, com o "Subir" e o "Descer" do teclado. A tabela não calcula a ordem: quem a usa a
// calcula e a grava.
import { GripVertical } from 'lucide-react';
import {
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useState,
} from 'react';
import { VisuallyHidden } from 'react-aria';
import { Cell, Column, Row, Table, TableBody, TableHeader } from 'react-aria-components';
import { Icone } from '../../icones/Icone.tsx';
import { type ItemDoMenuDeContexto, MenuDeContexto } from '../menu/MenuDeContexto.tsx';
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

/** O que a alça leva ao arraste: o aperto do ponteiro e o arrastar do navegador, desligado. */
export interface PropsDaAlca {
  onPointerDown: (evento: PointerEvent<HTMLElement>) => void;
  onDragStart?: (evento: DragEvent<HTMLElement>) => void;
}

/** O arraste em curso, como a tabela o mostra. */
export interface ArrasteNaTabela {
  /** A linha no ar, esmaecida. */
  noAr: string;
  /** A linha sob o ponteiro e a metade dela, que põe a linha de encaixe no alto ou embaixo dela. */
  encaixe: { id: string; metade: 'antes' | 'depois' } | null;
}

export interface PropsDaTabelaQueSeOrdena<T> {
  /** O id do título que dá o nome da tabela. */
  'aria-labelledby': string;
  itens: readonly T[];
  idDe: (item: T) => string;
  /** O nome do item, que o leitor de tela lê na linha e no menu dela ("Ações de Impressora"). */
  nomeDe: (item: T) => string;
  colunas: readonly ColunaQueSeOrdena<T>[];
  escolhido: string | null;
  aoEscolher: (id: string) => void;
  /** O aperto na alça da linha, para o arraste de quem usa a tabela. */
  alca: (item: T) => PropsDaAlca;
  /** As marcas da linha como alvo do arraste (`data-*`), que acham a linha sob o ponteiro. */
  alvo: (item: T) => Record<`data-${string}`, string>;
  arraste: ArrasteNaTabela | null;
  /** Os itens do menu da linha, como o "Subir" e o "Descer"; sem nenhum, o menu não abre. */
  menuDaLinha: (item: T) => readonly ItemDoMenuDeContexto[];
  /** A linha mais alta, como a que tem um selo embaixo do nome. */
  alta?: (item: T) => boolean;
}

interface MenuAberto {
  id: string;
  posicao: { x: number; y: number };
  origem: HTMLElement;
}

/** A linha do corpo em que o evento aconteceu; a do cabeçalho não conta. */
function linhaDoCorpo(alvo: EventTarget): HTMLElement | null {
  const linha = (alvo as HTMLElement).closest?.<HTMLElement>('[role="row"][data-key]') ?? null;
  return linha && !linha.querySelector('[role="columnheader"]') ? linha : null;
}

export function TabelaQueSeOrdena<T extends object>({
  'aria-labelledby': rotuladaPor,
  itens,
  idDe,
  nomeDe,
  colunas,
  escolhido,
  aoEscolher,
  alca,
  alvo,
  arraste,
  menuDaLinha,
  alta,
}: PropsDaTabelaQueSeOrdena<T>) {
  const porId = new Map(itens.map((item) => [idDe(item), item]));
  const [menu, definirMenu] = useState<MenuAberto | null>(null);
  const doMenu = menu ? porId.get(menu.id) : undefined;

  const abrirOMenu = (linha: HTMLElement, posicao: { x: number; y: number }) => {
    const id = linha.dataset.key;
    const item = id === undefined ? undefined : porId.get(id);
    if (id === undefined || !item || menuDaLinha(item).length === 0) return false;
    definirMenu({ id, posicao, origem: linha });
    return true;
  };
  // A tecla de menu e o Shift+F10 abrem o menu junto da linha em foco, como na tabela do kit.
  const aoTeclar = (evento: KeyboardEvent<HTMLDivElement>) => {
    const pedeMenu = evento.key === 'ContextMenu' || (evento.shiftKey && evento.key === 'F10');
    const linha = pedeMenu ? linhaDoCorpo(evento.target) : null;
    if (!linha) return;
    const caixa = linha.getBoundingClientRect();
    if (!abrirOMenu(linha, { x: caixa.left + 16, y: caixa.bottom })) return;
    evento.preventDefault();
    evento.stopPropagation();
  };
  const aoPedirOMenu = (evento: MouseEvent<HTMLDivElement>) => {
    const linha = linhaDoCorpo(evento.target);
    if (!linha || !abrirOMenu(linha, { x: evento.clientX, y: evento.clientY })) return;
    evento.preventDefault();
    linha.focus();
  };

  return (
    <div
      className={estilos.area}
      onKeyDownCapture={aoTeclar}
      onContextMenuCapture={aoPedirOMenu}
      data-arrastando={arraste ? '' : undefined}
      data-cursor-nativo={arraste ? '' : undefined}
    >
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
        {/* O React Aria guarda as linhas desenhadas: as colunas novas e as marcas do arraste só
            chegam a elas pelas dependências. */}
        <TableBody
          items={itens}
          dependencies={[colunas, arraste?.noAr, arraste?.encaixe?.id, arraste?.encaixe?.metade]}
        >
          {(item) => {
            const id = idDe(item);
            const { onPointerDown, onDragStart } = alca(item);
            return (
              <Row
                id={id}
                textValue={nomeDe(item)}
                className={alta?.(item) ? `${estilos.linha} ${estilos.alta}` : estilos.linha}
                {...alvo(item)}
                data-no-ar={arraste?.noAr === id ? '' : undefined}
                data-encaixe={arraste?.encaixe?.id === id ? arraste.encaixe.metade : undefined}
              >
                <Cell className={estilos.celulaDaAlca}>
                  {/* A alça é só do ponteiro: o teclado muda a ordem pelo menu da linha. O aperto
                      não chega à linha, que não troca de escolhida ao começar o arraste. */}
                  <span
                    className={estilos.alca}
                    aria-hidden="true"
                    data-cursor-nativo=""
                    onPointerDown={(evento) => {
                      onPointerDown(evento);
                      evento.stopPropagation();
                    }}
                    onDragStart={onDragStart}
                  >
                    <Icone icone={GripVertical} tamanho={14} />
                  </span>
                </Cell>
                {colunas.map((coluna) => (
                  <Cell key={coluna.id} className={coluna.mono ? estilos.mono : undefined}>
                    {coluna.celula(item)}
                  </Cell>
                ))}
              </Row>
            );
          }}
        </TableBody>
      </Table>
      <MenuDeContexto
        rotulo={doMenu ? `Ações de ${nomeDe(doMenu)}` : 'Ações da linha'}
        posicao={doMenu ? (menu?.posicao ?? null) : null}
        itens={doMenu ? menuDaLinha(doMenu) : []}
        aoFechar={() => definirMenu(null)}
        origem={menu?.origem}
      />
    </div>
  );
}
