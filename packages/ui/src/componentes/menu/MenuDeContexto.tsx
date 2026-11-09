// O menu de contexto (spec componentes-base e tabelas-configuraveis): o mesmo menu, aberto no ponto
// do clique direito ou junto do elemento em foco, que fecha com Esc, com o clique fora e com a
// escolha de um item, e devolve o foco a quem o abriu.
import { useRef } from 'react';
import { Menu as MenuDoReactAria } from 'react-aria-components';
import { createPortal } from 'react-dom';
import estilosDoFlutuante from '../flutuante/Flutuante.module.css';
import { PainelFlutuante } from '../flutuante/Flutuante.tsx';
import estilos from './Menu.module.css';
import { ItemDeMenu } from './Menu.tsx';

export interface ItemDoMenuDeContexto {
  id: string;
  rotulo: string;
  aoEscolher: () => void;
  /** Ação que apaga ou encerra algo: texto na cor crítica. */
  destrutivo?: boolean;
}

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
          onAction={(id) => {
            const item = itens.find((candidato) => candidato.id === id);
            fechar();
            item?.aoEscolher();
          }}
          onClose={fechar}
        >
          {itens.map((item) => (
            <ItemDeMenu key={item.id} id={item.id} destrutivo={item.destrutivo}>
              {item.rotulo}
            </ItemDeMenu>
          ))}
        </MenuDoReactAria>
      </PainelFlutuante>
    </>
  );
}
