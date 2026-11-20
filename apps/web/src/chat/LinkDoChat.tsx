// O link entre as telas do app do chat. O TanStack Router tipa os endereços pelo roteador que a
// casca registra, e os do chat não são dela: o link é a âncora com o endereço, e o clique simples
// navega pelo roteador do chat, sem recarregar a página. Com Ctrl, Shift, Alt ou outro botão, o
// navegador abre o endereço, como em qualquer link.
import { useRouter } from '@tanstack/react-router';
import type { AnchorHTMLAttributes, MouseEvent } from 'react';

export interface PropsDoLinkDoChat extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  /** O endereço no chat, como `/chat/equipes`, com a busca, se houver. */
  para: string;
}

export function LinkDoChat({ para, onClick, ...resto }: PropsDoLinkDoChat) {
  const roteador = useRouter();
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
    void roteador.navigate({ href: para });
  };
  return <a {...resto} href={para} onClick={aoClicar} />;
}
