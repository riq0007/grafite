// O link entre as telas do chat. O TanStack Router tipa os endereços pelo roteador que a casca
// registra, e os do app do chat não são dela: o link é a âncora com o endereço, e o clique simples
// navega pelo roteador de onde o chat está, sem recarregar a página. O endereço é o do app, que a
// janela do Chat da casca troca pelo dela (`base.tsx`). O de fora do chat, como a ficha de um ativo,
// abre o Grafite numa janela nova no app, que não tem as telas da casca, e na casca, nela mesma.
// Com Ctrl, Shift, Alt ou outro botão, o navegador abre o endereço, como em qualquer link.
import { useRouter } from '@tanstack/react-router';
import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { noChatDeAgora, useOndeEstaOChat } from './base.tsx';
import { ehDoChat } from './enderecos.ts';

export interface PropsDoLinkDoChat extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  /** O endereço no app do chat, como `/chat/equipes`, com a busca, se houver, ou um da casca. */
  para: string;
}

export function LinkDoChat({ para, onClick, ...resto }: PropsDoLinkDoChat) {
  const roteador = useRouter();
  const onde = useOndeEstaOChat();
  const href = noChatDeAgora(para, onde);
  if (!ehDoChat(para) && onde === 'app') {
    return <a {...resto} href={href} onClick={onClick} target="_blank" rel="noopener noreferrer" />;
  }
  const aoClicar = (evento: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(evento);
    const doNavegador =
      evento.button !== 0 ||
      evento.metaKey ||
      evento.ctrlKey ||
      evento.shiftKey ||
      evento.altKey ||
      (resto.target !== undefined && resto.target !== '_self');
    if (evento.defaultPrevented || doNavegador) return;
    evento.preventDefault();
    void roteador.navigate({ href });
  };
  return <a {...resto} href={href} onClick={aoClicar} />;
}
