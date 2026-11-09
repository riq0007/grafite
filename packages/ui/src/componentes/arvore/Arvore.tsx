import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { CSSProperties, ReactNode, Ref } from 'react';
import {
  Button,
  Collection,
  type Key,
  Tree,
  TreeItem,
  TreeItemContent,
} from 'react-aria-components';
import { Icone } from '../../icones/Icone.tsx';
import { RotuloDeSituacao, type Situacao } from '../situacao/RotuloDeSituacao.tsx';
import estilos from './Arvore.module.css';

export interface ItemDaArvore {
  id: string;
  rotulo: string;
  icone: LucideIcon;
  /** Um texto secundário ao lado do rótulo, como o tipo do local. */
  detalhe?: string;
  /** A situação dita por texto, como "Inativo". */
  situacao?: { tipo: Situacao; texto: string };
  filhos?: ItemDaArvore[];
}

export interface PropsDaArvore {
  /** Nome da árvore para o leitor de tela. */
  rotulo: string;
  itens: ItemDaArvore[];
  /** O item escolhido. Sem `aoEscolher`, a árvore só mostra e expande. */
  escolhido?: string | null;
  /** Enter ou o clique no item. As setas só movem o foco. */
  aoEscolher?: (id: string) => void;
  /** Os itens expandidos, quando quem usa a árvore controla a expansão. */
  expandidos?: Iterable<string>;
  /** Os itens que começam expandidos, quando a árvore controla a expansão. */
  expandidosNoComeco?: Iterable<string>;
  aoExpandir?: (expandidos: Set<string>) => void;
  /**
   * Os itens que não podem ser escolhidos. Eles continuam à vista e expansíveis, para os de dentro
   * deles serem alcançados.
   */
  desabilitados?: Iterable<string>;
  /** O estado vazio, sem itens. */
  vazio?: ReactNode;
  className?: string;
  /** O elemento da árvore, para quem a usa levar o foco a ela. */
  ref?: Ref<HTMLDivElement>;
}

/** O nome do item para o leitor de tela: o rótulo, o detalhe e a situação. */
const nomeDo = ({ rotulo, detalhe, situacao }: ItemDaArvore) =>
  [rotulo, detalhe, situacao?.texto].filter(Boolean).join(', ');

const comoTextos = (chaves: Iterable<Key>) => new Set([...chaves].map(String));

/**
 * Árvore navegável pelo teclado: o indicador e as setas para a direita e para a esquerda expandem
 * e recolhem, as setas para cima e para baixo movem o foco, e Enter ou o clique escolhem o item.
 * Cada item tem o ícone, o rótulo e, se houver, o detalhe e a situação por texto, na altura da
 * densidade.
 */
export function Arvore({
  rotulo,
  itens,
  escolhido,
  aoEscolher,
  expandidos,
  expandidosNoComeco,
  aoExpandir,
  desabilitados,
  vazio,
  className,
  ref,
}: PropsDaArvore) {
  const naoEscolhe = new Set(desabilitados ?? []);
  return (
    <Tree
      ref={ref}
      aria-label={rotulo}
      items={itens}
      selectionMode={aoEscolher ? 'single' : 'none'}
      disallowEmptySelection
      disabledKeys={desabilitados}
      disabledBehavior="selection"
      selectedKeys={escolhido ? [escolhido] : []}
      onSelectionChange={(chaves) => {
        if (chaves === 'all') return;
        const [id] = chaves;
        if (id !== undefined) aoEscolher?.(String(id));
      }}
      expandedKeys={expandidos}
      defaultExpandedKeys={expandidosNoComeco}
      onExpandedChange={aoExpandir ? (chaves) => aoExpandir(comoTextos(chaves)) : undefined}
      renderEmptyState={vazio ? () => vazio : undefined}
      className={[estilos.arvore, className].filter(Boolean).join(' ')}
    >
      {function itemDaArvore(item: ItemDaArvore) {
        return (
          <TreeItem
            id={item.id}
            textValue={item.rotulo}
            aria-label={
              naoEscolhe.has(item.id) ? `${nomeDo(item)}, não pode ser escolhido` : nomeDo(item)
            }
            data-nao-escolhe={naoEscolhe.has(item.id) ? '' : undefined}
            className={estilos.item}
          >
            <TreeItemContent>
              {({ hasChildItems, isExpanded, level }) => (
                <div className={estilos.conteudo} style={{ '--nivel': level } as CSSProperties}>
                  {hasChildItems ? (
                    <Button
                      slot="chevron"
                      aria-label={isExpanded ? 'Recolher' : 'Expandir'}
                      className={estilos.indicador}
                    >
                      <Icone icone={ChevronRight} tamanho={14} />
                    </Button>
                  ) : (
                    <span className={estilos.semIndicador} />
                  )}
                  <span className={estilos.icone}>
                    <Icone icone={item.icone} />
                  </span>
                  <span className={estilos.rotulo}>{item.rotulo}</span>
                  {item.detalhe && <span className={estilos.detalhe}>{item.detalhe}</span>}
                  {item.situacao && (
                    <RotuloDeSituacao situacao={item.situacao.tipo}>
                      {item.situacao.texto}
                    </RotuloDeSituacao>
                  )}
                </div>
              )}
            </TreeItemContent>
            <Collection items={item.filhos ?? []}>{itemDaArvore}</Collection>
          </TreeItem>
        );
      }}
    </Tree>
  );
}
