import { type RefObject, useId, useRef } from 'react';
import { Menu as MenuDoReactAria } from 'react-aria-components';
import estilosDoFlutuante from '../componentes/flutuante/Flutuante.module.css';
import { PainelFlutuante } from '../componentes/flutuante/Flutuante.tsx';
import estilosDoMenu from '../componentes/menu/Menu.module.css';
import estilos from './Dock.module.css';
import { itensDoMenu } from './itensDoMenu.tsx';
import type { ModuloDaCasca, PosicaoDoDock } from './tipos.ts';

/** O menu abre para dentro da tela, do lado oposto à borda do dock. */
const LADO_DO_MENU = { embaixo: 'top', esquerda: 'right', direita: 'left' } as const;

export interface PropsDoMenuDoDock {
  modulo: ModuloDaCasca;
  aberto: boolean;
  /** O item do dock onde o menu se ancora. */
  gatilho: RefObject<Element | null>;
  posicao: PosicaoDoDock;
  /** Aberto pelo teclado: o foco vai ao primeiro item. */
  focoNoPrimeiro: boolean;
  /**
   * Muda a cada abertura pelo teclado: o menu monta de novo, e o foco vai ao primeiro item mesmo
   * quando o painel anterior ainda sai da tela e é reaproveitado.
   */
  aberturaPeloTeclado: number;
  aoEntrarComOPonteiro: () => void;
  aoSairComOPonteiro: () => void;
  aoEscolher: (idDoItem: string) => void;
  /** Com peloTeclado, o menu fechou com Esc, e o foco volta ao item do dock. */
  aoFechar: (peloTeclado: boolean) => void;
}

/**
 * Menu em árvore de um módulo do dock. É um popover não modal: com ele aberto, o ponteiro
 * continua podendo passar aos outros itens do dock, que trocam de menu (design, decisão 8).
 */
export function MenuDoDock({
  modulo,
  aberto,
  gatilho,
  posicao,
  focoNoPrimeiro,
  aberturaPeloTeclado,
  aoEntrarComOPonteiro,
  aoSairComOPonteiro,
  aoEscolher,
  aoFechar,
}: PropsDoMenuDoDock) {
  const idDoTitulo = useId();
  const comEsc = useRef(false);
  const fechar = () => {
    aoFechar(comEsc.current);
    comEsc.current = false;
  };
  return (
    <PainelFlutuante
      triggerRef={gatilho}
      isOpen={aberto}
      isNonModal
      onOpenChange={(abrir) => {
        if (!abrir) fechar();
      }}
      placement={LADO_DO_MENU[posicao]}
      offset={10}
      className={estilosDoFlutuante.deMenu}
    >
      <div
        data-menu-do-dock=""
        onPointerEnter={aoEntrarComOPonteiro}
        onPointerLeave={aoSairComOPonteiro}
        // O menu trata o Esc e não o deixa subir; na captura, dá para saber que foi o teclado.
        onKeyDownCapture={(evento) => {
          if (evento.key === 'Escape') comEsc.current = true;
        }}
      >
        <p id={idDoTitulo} className={estilos.tituloDoMenu}>
          {modulo.nome}
        </p>
        <MenuDoReactAria
          key={aberturaPeloTeclado}
          aria-labelledby={idDoTitulo}
          className={estilosDoMenu.menu}
          autoFocus={focoNoPrimeiro ? 'first' : false}
          onClose={fechar}
        >
          {itensDoMenu(modulo.menu ?? [], aoEscolher)}
        </MenuDoReactAria>
      </div>
    </PainelFlutuante>
  );
}
