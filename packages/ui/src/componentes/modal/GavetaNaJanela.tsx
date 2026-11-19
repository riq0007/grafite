import type { ReactNode } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import estilos from './Modal.module.css';

export interface PropsDaGavetaNaJanela {
  aberta: boolean;
  aoMudarAberta: (aberta: boolean) => void;
  /**
   * O elemento da tela onde a gaveta abre, posicionado (`position: relative`): o véu o cobre
   * inteiro, e a gaveta fica presa à borda direita dele. Sem ele, ainda não montado, nada aparece.
   */
  dentroDe: HTMLElement | null;
  /** O id do título de dentro, que dá o nome à gaveta, como o nome do tipo no editor. */
  idDoTitulo: string;
  /** A classe da gaveta, que dá onde ela começa, como a borda da coluna do editor. */
  className?: string;
  children: ReactNode;
}

/**
 * A gaveta dentro da janela (ANTISLOP §22), como a do rascunho do tipo de chamado (m08): o véu
 * escurece a tela, e a gaveta cobre a parte da direita, sem cabeçalho próprio, com o título que
 * vem de dentro. Prende o foco, fecha com Esc e com o clique no véu, e devolve o foco a quem a
 * abriu. Quem a usa decide o que fechar quer dizer, como pedir a confirmação das mudanças.
 */
export function GavetaNaJanela({
  aberta,
  aoMudarAberta,
  dentroDe,
  idDoTitulo,
  className,
  children,
}: PropsDaGavetaNaJanela) {
  if (!dentroDe) return null;
  return (
    <ModalOverlay
      isDismissable
      isOpen={aberta}
      onOpenChange={aoMudarAberta}
      UNSTABLE_portalContainer={dentroDe}
      className={estilos.veuNaJanela}
    >
      <Modal className={[estilos.gavetaNaJanela, className].filter(Boolean).join(' ')}>
        <Dialog aria-labelledby={idDoTitulo} className={estilos.dialogoNaJanela}>
          {children}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
