// O botão com o cartão do resumo (change chat-com-chamados, design, decisão 15): o botão que a tela
// desenha, como o chip do chamado citado, e o cartão embaixo dele, na camada opaca, pelo
// PreviewTrigger do React Aria. O cartão abre com o ponteiro parado 500 ms sobre o botão ou com o
// foco do teclado parado nele pelo mesmo tempo, sem tirar o foco do lugar, e fica aberto enquanto o
// ponteiro estiver no botão, no cartão ou entre os dois, ou o foco estiver num deles. O Tab leva do
// botão ao cartão, e, depois do cartão, ao que vem depois do botão; o Esc fecha o cartão, com o foco
// de volta no botão. Escolher o botão abre o cartão na hora e, pelo teclado ou pelo leitor de tela,
// leva o foco a ele, como a seta para baixo na referência com cartão. No toque, que não tem ponteiro
// parado, o toque abre e fecha o cartão, o toque fora o fecha, e o toque longo o abre com o foco nele.
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useInteractOutside } from 'react-aria';
import { Button, type PressEvent, PreviewTrigger } from 'react-aria-components';
import { tempos } from '../../tokens/tempos.ts';
import { PainelFlutuante } from '../flutuante/Flutuante.tsx';
import estilos from './GatilhoComCartao.module.css';

export interface PropsDoGatilhoComCartao {
  /** O que o botão mostra, como o número, o selo e quem atende do chamado citado. */
  children: ReactNode;
  /** A classe do botão, que a tela desenha. */
  className?: string;
  /** O nome do cartão para o leitor de tela, como "Resumo do chamado 1045". */
  titulo: string;
  /**
   * O conteúdo do cartão, desenhado só com ele aberto: é ele que busca o resumo, e a busca é
   * cancelada quando ele sai antes da resposta.
   */
  cartao: () => ReactNode;
}

export function GatilhoComCartao({ children, className, titulo, cartao }: PropsDoGatilhoComCartao) {
  const [aberto, definirAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLElement>(null);
  /** O cartão aberto pelo teclado ou pelo leitor de tela recebe o foco quando aparece. */
  const focarAoAbrir = useRef(false);

  useEffect(() => {
    if (!aberto || !focarAoAbrir.current) return;
    focarAoAbrir.current = false;
    painel.current?.focus({ preventScroll: true });
  }, [aberto]);

  // O Esc no cartão fecha na hora: o do React Aria fecha com a espera do ponteiro que sai. A escuta
  // é a do próprio cartão, na captura, para valer também com o foco nele, e não só num botão dele.
  useEffect(() => {
    const elemento = painel.current;
    if (!aberto || !elemento) return;
    const fecharNaHora = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') definirAberto(false);
    };
    elemento.addEventListener('keydown', fecharNaHora, true);
    return () => elemento.removeEventListener('keydown', fecharNaHora, true);
  }, [aberto]);

  // O toque ou o clique fora fecha o cartão; o do botão é dele.
  useInteractOutside({
    ref: painel,
    isDisabled: !aberto,
    onInteractOutside: (evento) => {
      if (!(evento.target instanceof Node && botao.current?.contains(evento.target))) {
        definirAberto(false);
      }
    },
  });

  const levarAoCartao = () => {
    if (aberto) {
      painel.current?.focus({ preventScroll: true });
      return;
    }
    focarAoAbrir.current = true;
    definirAberto(true);
  };

  const escolher = (evento: PressEvent) => {
    if (evento.pointerType === 'keyboard' || evento.pointerType === 'virtual') {
      // O leitor de tela escolhe o botão sem levar o foco a ele: com o foco no botão antes de o
      // cartão abrir, é a ele que o foco volta quando o cartão fecha.
      botao.current?.focus({ preventScroll: true });
      levarAoCartao();
    } else if (evento.pointerType === 'touch') definirAberto(!aberto);
    // O ponteiro já pode ter aberto o cartão: o clique não o fecha.
    else definirAberto(true);
  };

  return (
    <PreviewTrigger
      isOpen={aberto}
      onOpenChange={definirAberto}
      delay={tempos.cartao.abrir}
      closeDelay={tempos.cartao.fechar}
    >
      <Button
        ref={botao}
        className={className}
        onPress={escolher}
        onKeyDown={(evento) => {
          const sozinha = !evento.altKey && !evento.ctrlKey && !evento.metaKey && !evento.shiftKey;
          if (evento.key === 'ArrowDown' && sozinha) {
            evento.preventDefault();
            levarAoCartao();
            return;
          }
          // As outras teclas seguem, como os atalhos da tela em volta.
          evento.continuePropagation();
        }}
      >
        {children}
      </Button>
      <PainelFlutuante
        ref={painel}
        opaco
        placement="bottom start"
        offset={8}
        aria-label={titulo}
        className={estilos.painel}
      >
        {cartao()}
      </PainelFlutuante>
    </PreviewTrigger>
  );
}
