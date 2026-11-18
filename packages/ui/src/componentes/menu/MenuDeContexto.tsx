// O menu de contexto (spec componentes-base e tabelas-configuraveis): o mesmo menu, aberto no ponto
// do clique direito ou junto do elemento em foco, que fecha com Esc, com o clique fora e com a
// escolha de um item, e devolve o foco a quem o abriu. Os itens são os mesmos do menu com submenu:
// o item com `itens` abre a lista dele, com o mesmo teclado. A ação fica em cada item, como nos
// menus da casca, porque a do menu de fora não chega ao submenu.
import { useRef } from 'react';
import { Menu as MenuDoReactAria } from 'react-aria-components';
import { createPortal } from 'react-dom';
import estilosDoFlutuante from '../flutuante/Flutuante.module.css';
import { PainelFlutuante } from '../flutuante/Flutuante.tsx';
import estilos from './Menu.module.css';
import { ItemDeMenu, Submenu } from './Menu.tsx';

/** Um item que age quando escolhido. */
export interface AcaoDoMenuDeContexto {
  id: string;
  rotulo: string;
  aoEscolher: () => void;
  /** Ação que apaga ou encerra algo: texto na cor crítica. */
  destrutivo?: boolean;
  /** Texto de apoio abaixo do nome, como "2 abertos". */
  descricao?: string;
}

/** Um item que abre um submenu, com o nome do item, como "Passar para…". */
export interface SubmenuDoMenuDeContexto {
  id: string;
  rotulo: string;
  itens: readonly AcaoDoMenuDeContexto[];
}

export type ItemDoMenuDeContexto = AcaoDoMenuDeContexto | SubmenuDoMenuDeContexto;

export interface PropsDoMenuDeContexto {
  /** O nome do menu para o leitor de tela. */
  rotulo: string;
  /** Onde o menu abre, nas coordenadas da janela; nulo com o menu fechado. */
  posicao: { x: number; y: number } | null;
  itens: readonly ItemDoMenuDeContexto[];
  aoFechar: () => void;
  /** O elemento que recebe o foco de volta quando o menu fecha. */
  origem?: HTMLElement | null;
}

export function MenuDeContexto({
  rotulo,
  posicao,
  itens,
  aoFechar,
  origem,
}: PropsDoMenuDeContexto) {
  // O ponto onde o menu abre: um elemento sem tamanho, fixo na janela, que o painel segue.
  const ponto = useRef<HTMLDivElement>(null);
  const fechar = () => {
    aoFechar();
    requestAnimationFrame(() => origem?.focus());
  };
  // O menu fecha antes da ação, para a ação achar o foco já de volta em quem o abriu.
  const acao = ({ id, rotulo: nome, aoEscolher, destrutivo, descricao }: AcaoDoMenuDeContexto) => (
    <ItemDeMenu
      key={id}
      id={id}
      destrutivo={destrutivo}
      descricao={descricao}
      onAction={() => {
        fechar();
        aoEscolher();
      }}
    >
      {nome}
    </ItemDeMenu>
  );
  return (
    <>
      {createPortal(
        <div
          ref={ponto}
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: posicao?.x ?? 0,
            top: posicao?.y ?? 0,
            width: 0,
            height: 0,
          }}
        />,
        document.body,
      )}
      <PainelFlutuante
        triggerRef={ponto}
        isOpen={posicao !== null && itens.length > 0}
        onOpenChange={(aberto) => {
          if (!aberto) fechar();
        }}
        aria-label={rotulo}
        placement="bottom start"
        offset={0}
        className={estilosDoFlutuante.deMenu}
      >
        <MenuDoReactAria
          aria-label={rotulo}
          autoFocus="first"
          className={estilos.menu}
          onClose={fechar}
        >
          {itens.map((item) =>
            'itens' in item ? (
              <Submenu key={item.id} rotulo={item.rotulo}>
                {item.itens.map(acao)}
              </Submenu>
            ) : (
              acao(item)
            ),
          )}
        </MenuDoReactAria>
      </PainelFlutuante>
    </>
  );
}
