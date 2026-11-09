import { X } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Dialog, DialogTrigger, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { BotaoDeIcone } from '../../icones/Icone.tsx';
import estilos from './Modal.module.css';

export interface PropsDaGaveta {
  /**
   * Um componente pressionável da biblioteca, como o botão. Sem gatilho, a gaveta é controlada por
   * `aberta` e `aoMudarAberta`, como a central de notificações, aberta pelo sino da barra.
   */
  gatilho?: ReactElement;
  aberta?: boolean;
  aoMudarAberta?: (aberta: boolean) => void;
  titulo: string;
  children: ReactNode;
}

/**
 * Painel lateral que mantém o contexto da tela (ANTISLOP §22). Prende o foco, fecha com Esc,
 * pelo botão ou clicando fora, e devolve o foco a quem abriu.
 */
export function Gaveta({ gatilho, aberta, aoMudarAberta, titulo, children }: PropsDaGaveta) {
  const camada = (
    <ModalOverlay
      isDismissable
      isOpen={gatilho ? undefined : aberta}
      onOpenChange={gatilho ? undefined : aoMudarAberta}
      className={`${estilos.veu} ${estilos.veuDaGaveta}`}
    >
      <Modal className={estilos.gaveta}>
        <Dialog className={estilos.dialogo}>
          <div className={estilos.cabecalho}>
            <Heading slot="title" className={estilos.titulo}>
              {titulo}
            </Heading>
            <BotaoDeIcone icone={X} rotulo="Fechar" slot="close" comDica={false} />
          </div>
          <div className={estilos.conteudo}>{children}</div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
  if (!gatilho) return camada;
  return (
    <DialogTrigger>
      {gatilho}
      {camada}
    </DialogTrigger>
  );
}
