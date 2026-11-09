import type { ReactElement, ReactNode, RefObject } from 'react';
import { Dialog, DialogTrigger, Heading, type PopoverProps } from 'react-aria-components';
import estilos from './Flutuante.module.css';
import { PainelFlutuante } from './Flutuante.tsx';

export interface PropsDoPopover {
  /**
   * Um componente pressionável da biblioteca, como o botão. Sem ele, o popover abre por fora, pelo
   * `aberto`, preso à `ancora`, como o editor de um filtro escolhido num menu.
   */
  gatilho?: ReactElement;
  /** Onde o popover aberto por fora se prende, como o botão do menu de onde ele veio. */
  ancora?: RefObject<Element | null>;
  aberto?: boolean;
  aoMudarAberto?: (aberto: boolean) => void;
  titulo: string;
  /** Quando o gatilho já diz o que é, o título fica só para o leitor de tela. */
  ocultarTitulo?: boolean;
  children: ReactNode;
  posicao?: PopoverProps['placement'];
}

/**
 * Conteúdo interativo sobreposto, preso ao gatilho: o foco entra ao abrir; Esc ou clicar fora
 * fecham, e o foco volta ao gatilho.
 */
export function Popover({
  gatilho,
  ancora,
  aberto,
  aoMudarAberto,
  titulo,
  ocultarTitulo = false,
  children,
  posicao = 'bottom start',
}: PropsDoPopover) {
  const painel = (
    <PainelFlutuante
      placement={posicao}
      offset={8}
      className={estilos.popover}
      {...(gatilho ? {} : { triggerRef: ancora, isOpen: aberto, onOpenChange: aoMudarAberto })}
    >
      <Dialog aria-label={ocultarTitulo ? titulo : undefined} className={estilos.dialogo}>
        {!ocultarTitulo && (
          <Heading slot="title" className={estilos.tituloDoPopover}>
            {titulo}
          </Heading>
        )}
        {children}
      </Dialog>
    </PainelFlutuante>
  );
  if (!gatilho) return painel;
  return (
    <DialogTrigger isOpen={aberto} onOpenChange={aoMudarAberto}>
      {gatilho}
      {painel}
    </DialogTrigger>
  );
}
