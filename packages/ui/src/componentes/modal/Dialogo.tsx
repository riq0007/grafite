import type { ReactElement, ReactNode } from 'react';
import { Dialog, DialogTrigger, Heading, Modal, ModalOverlay } from 'react-aria-components';
import estilos from './Modal.module.css';

/** Conteúdo fixo, ou uma função que recebe o fechar (para os botões de ação). */
type Conteudo = ReactNode | ((fechar: () => void) => ReactNode);

const mostrar = (conteudo: Conteudo, fechar: () => void) =>
  typeof conteudo === 'function' ? conteudo(fechar) : conteudo;

export interface PropsDoDialogo {
  /**
   * Um componente pressionável da biblioteca, como o botão. Sem ele, o diálogo é aberto por fora,
   * pelo `aberto`, como a confirmação ao sair de uma tela com mudanças.
   */
  gatilho?: ReactElement;
  titulo: string;
  /** Confirmação de ação sem volta (excluir, dar baixa): o leitor de tela anuncia como alerta. */
  alerta?: boolean;
  /**
   * Aberto ou fechado por fora, para o diálogo que muda depois da ação, como o que passa a mostrar
   * a senha temporária, e para quem precisa saber quando ele fecha, por qualquer caminho. Sem
   * isto, o gatilho abre e as ações fecham.
   */
  aberto?: boolean;
  aoMudarAberto?: (aberto: boolean) => void;
  children: Conteudo;
  /** Botões do rodapé, alinhados à direita; a ação principal vem por último. */
  acoes?: Conteudo;
}

/**
 * Decisão curta ou confirmação (ANTISLOP §22). Prende o foco, fecha com Esc e devolve o foco a
 * quem abriu. Clicar fora não fecha: a decisão é explícita.
 */
export function Dialogo({
  gatilho,
  titulo,
  alerta = false,
  aberto,
  aoMudarAberto,
  children,
  acoes,
}: PropsDoDialogo) {
  return (
    <DialogTrigger isOpen={aberto} onOpenChange={aoMudarAberto}>
      {gatilho}
      <ModalOverlay className={estilos.veu}>
        <Modal className={estilos.janela}>
          <Dialog role={alerta ? 'alertdialog' : 'dialog'} className={estilos.dialogo}>
            {({ close }) => (
              <>
                <Heading slot="title" className={estilos.titulo}>
                  {titulo}
                </Heading>
                <div className={estilos.conteudo}>{mostrar(children, close)}</div>
                {acoes && <div className={estilos.acoes}>{mostrar(acoes, close)}</div>}
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
