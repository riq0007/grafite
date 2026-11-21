// A página do chat no servidor do Vite (change chat-com-chamados, design, decisão 12). O build
// tem duas páginas, e o Vite só acha a do chat em /chat/, com a barra; nos outros endereços dela,
// como /chat e /chat/c/..., ele entregaria o index.html da casca. O plugin entrega a página do
// chat a todo pedido de página em /chat, no pnpm dev e no vite preview, como a API faz.
import type { Connect, Plugin } from 'vite';
import { DO_CHAT, PAGINA_DO_CHAT } from './enderecos.ts';

/** Arquivo com extensão, como o manifesto: vai como arquivo, nunca como a página. */
const EXTENSAO = /\.[a-z0-9]+$/i;

/** O pedido de uma página do chat: GET ou HEAD, em /chat ou abaixo, sem extensão, aceitando HTML. */
export function pedePaginaDoChat({
  method,
  url = '/',
  headers,
}: Pick<Connect.IncomingMessage, 'method' | 'url' | 'headers'>): boolean {
  const caminho = url.split('?')[0] ?? '';
  return (
    (method === 'GET' || method === 'HEAD') &&
    DO_CHAT.test(caminho) &&
    !EXTENSAO.test(caminho) &&
    (headers.accept ?? '').includes('text/html')
  );
}

/** Troca o endereço do pedido de página do chat pelo da página, antes do Vite procurá-la. */
export const levarAPaginaDoChat: Connect.NextHandleFunction = (pedido, _resposta, seguir) => {
  if (pedePaginaDoChat(pedido)) pedido.url = PAGINA_DO_CHAT;
  seguir();
};

export function paginaDoChat(): Plugin {
  return {
    name: 'grafite:pagina-do-chat',
    configureServer(servidor) {
      servidor.middlewares.use(levarAPaginaDoChat);
    },
    configurePreviewServer(servidor) {
      servidor.middlewares.use(levarAPaginaDoChat);
    },
  };
}
