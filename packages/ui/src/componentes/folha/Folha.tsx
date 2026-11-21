// A folha de baixo (change chat-com-chamados, design, decisão 15, "O celular"): a camada que sobe
// da borda de baixo, no toque, como o menu da mensagem no m09 e "Neste chamado" no chamado do
// celular. O véu atrás, o foco preso nela, o Esc e o toque fora fecham, e o foco volta a quem
// estava com ele antes de ela abrir. Acima dela, sobre o véu, pode ficar o que a folha é de, como
// a mensagem levantada e as reações. Sobe em 300 ms, sem deslocamento com "reduzir movimento".
import { X } from 'lucide-react';
import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { BotaoDeIcone } from '../../icones/Icone.tsx';
import estilos from './Folha.module.css';

/** Conteúdo fixo, ou uma função que recebe o fechar (para as ações que fecham a folha). */
type Conteudo = ReactNode | ((fechar: () => void) => ReactNode);

export interface PropsDaFolha {
  aberta: boolean;
  aoMudarAberta: (aberta: boolean) => void;
  /** O título à vista, com "Fechar" ao lado, como "Neste chamado". */
  titulo?: string;
  /**
   * Sem o título à vista, o nome da folha para o leitor de tela, como "Ações da mensagem de Paulo
   * Nunes".
   */
  rotulo?: string;
  /** O que fica acima da folha, sobre o véu, como a mensagem levantada e as reações, no m09. */
  acima?: ReactNode;
  /**
   * Chamado quando a folha sai da tela, depois da saída animada, antes de o foco voltar: a ação que
   * leva o foco a outro lugar, como o responder, que o põe na caixa, age aqui. Antes, a folha ainda
   * prende o foco, e o diálogo aberto guardaria o item da folha, que sai, como o lugar da volta.
   */
  aoSair?: () => void;
  children: Conteudo;
}

export function Folha({
  aberta,
  aoMudarAberta,
  titulo,
  rotulo,
  acima,
  aoSair,
  children,
}: PropsDaFolha) {
  return (
    <ModalOverlay
      isOpen={aberta}
      onOpenChange={aoMudarAberta}
      isDismissable
      className={estilos.veu}
    >
      <Modal className={estilos.folha}>
        <Dialog aria-label={titulo ? undefined : rotulo} className={estilos.dialogo}>
          {({ close }) => (
            <>
              {aoSair && <AvisoDaSaida aoSair={aoSair} />}
              {acima && <div className={estilos.acima}>{acima}</div>}
              <div className={estilos.painel}>
                <div className={estilos.alca} aria-hidden="true" />
                {titulo && (
                  <div className={estilos.cabecalho}>
                    <Heading slot="title" className={estilos.titulo}>
                      {titulo}
                    </Heading>
                    <BotaoDeIcone
                      icone={X}
                      rotulo="Fechar"
                      slot="close"
                      comDica={false}
                      className={estilos.fechar}
                    />
                  </div>
                )}
                <div className={estilos.conteudo}>
                  {typeof children === 'function' ? children(close) : children}
                </div>
              </div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/**
 * Avisa quando a folha sai: ele sai com ela, depois da saída animada. No modo estrito, o React
 * desmonta e monta de novo na hora, ao abrir: a volta acontece antes da conferência, e o aviso não
 * vai.
 */
function AvisoDaSaida({ aoSair }: { aoSair: () => void }) {
  const ultimo = useRef(aoSair);
  const montado = useRef(false);
  useLayoutEffect(() => {
    ultimo.current = aoSair;
  });
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      queueMicrotask(() => {
        if (!montado.current) ultimo.current();
      });
    };
  }, []);
  return null;
}
