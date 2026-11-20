// Os endereços do app do chat (change chat-com-chamados, design, decisão 12): o app responde em
// /chat e abaixo, numa página própria do build. Vale no navegador, no service worker e no Vite.

/** O endereço em /chat ou abaixo dele, com ou sem a busca e o fragmento. */
export const DO_CHAT = /^\/chat(?:[/?#]|$)/;

/** A página do app do chat no build, que o servidor entrega a todo pedido de página em /chat. */
export const PAGINA_DO_CHAT = '/chat/index.html';

/** O endereço é do app do chat, e não da casca. */
export const ehDoChat = (endereco: string): boolean => DO_CHAT.test(endereco);
