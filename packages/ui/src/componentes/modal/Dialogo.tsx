import type { ReactElement, ReactNode } from 'react';
import { Dialog, DialogTrigger, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { usePostura } from '../../casca/postura.ts';
import { Botao } from '../botao/Botao.tsx';
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
  /**
   * O diálogo de um formulário curto, de 576 px, no lugar dos 480 da decisão, como o transformar em
   * chamado do chat (m02), em que os tipos em chips quebram em menos linhas.
   */
  largo?: boolean;
  /**
   * No celular, o diálogo ocupa a tela, com "Cancelar" e o título no alto, e o conteúdo rola por
   * baixo deles, como o transformar em chamado do chat (m09). As ações ficam num pé preso embaixo;
   * o conteúdo que traz as dele, como um formulário, prende o pé no recuo da tela cheia
   * (`--recuo-da-tela-cheia`) e deixa o "Cancelar" de fora, porque o do alto fecha.
   */
  telaCheiaNoCelular?: boolean;
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
  largo = false,
  telaCheiaNoCelular = false,
}: PropsDoDialogo) {
  // Na troca de postura com ele aberto, como ao girar o celular, o conteúdo fica montado: muda só a
  // forma em volta dele.
  const celular = usePostura() === 'celular';
  const cheia = telaCheiaNoCelular && celular;
  return (
    <DialogTrigger isOpen={aberto} onOpenChange={aoMudarAberto}>
      {gatilho}
      <ModalOverlay className={cheia ? `${estilos.veu} ${estilos.veuDaTelaCheia}` : estilos.veu}>
        <Modal
          className={
            cheia
              ? estilos.telaCheia
              : [estilos.janela, largo && estilos.janelaLarga].filter(Boolean).join(' ')
          }
        >
          <Dialog
            role={alerta ? 'alertdialog' : 'dialog'}
            className={cheia ? estilos.dialogoDaTelaCheia : estilos.dialogo}
          >
            {({ close }) => {
              const nome = (
                <Heading
                  slot="title"
                  className={cheia ? estilos.tituloDaTelaCheia : estilos.titulo}
                >
                  {titulo}
                </Heading>
              );
              return (
                <>
                  {cheia ? (
                    <div className={estilos.topoDaTelaCheia}>
                      <Botao nivel="terciario" className={estilos.cancelarNoTopo} onPress={close}>
                        Cancelar
                      </Botao>
                      {nome}
                    </div>
                  ) : (
                    nome
                  )}
                  <div className={cheia ? estilos.conteudoDaTelaCheia : estilos.conteudo}>
                    {mostrar(children, close)}
                  </div>
                  {acoes && (
                    <div className={cheia ? estilos.acoesDaTelaCheia : estilos.acoes}>
                      {mostrar(acoes, close)}
                    </div>
                  )}
                </>
              );
            }}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
