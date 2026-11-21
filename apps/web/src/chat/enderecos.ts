// Os endereços do app do chat (change chat-com-chamados, design, decisão 12): o app responde em
// /chat e abaixo, numa página própria do build, e a janela do Chat da casca tem as mesmas telas em
// /conversas, porque o /chat é do app. Vale no navegador, no service worker e no Vite.

/** O endereço em /chat ou abaixo dele, com ou sem a busca e o fragmento. */
export const DO_CHAT = /^\/chat(?:[/?#]|$)/;

/** A página do app do chat no build, que o servidor entrega a todo pedido de página em /chat. */
export const PAGINA_DO_CHAT = '/chat/index.html';

/** O endereço é do app do chat, e não da casca. */
export const ehDoChat = (endereco: string): boolean => DO_CHAT.test(endereco);

/** O endereço da janela do Chat na casca, como o app do chat tem o /chat. */
export const JANELA_DO_CHAT = '/conversas';

/** O endereço em /conversas ou abaixo dele, com ou sem a busca e o fragmento. */
const DA_JANELA_DO_CHAT = /^\/conversas(?=[/?#]|$)/;

/**
 * Do app do chat à janela do Chat da casca, no mesmo lugar, com a busca e o fragmento, como o
 * `?m=` da mensagem: `/chat/c/<id>?m=<id>` vai a `/conversas/c/<id>?m=<id>`. O de fora do chat
 * fica como está.
 */
export const paraAJanelaDoChat = (endereco: string): string =>
  endereco.replace(/^\/chat(?=[/?#]|$)/, JANELA_DO_CHAT);

/** Da janela do Chat da casca ao app do chat, no mesmo lugar: o inverso do `paraAJanelaDoChat`. */
export const paraOAppDoChat = (endereco: string): string =>
  endereco.replace(DA_JANELA_DO_CHAT, '/chat');
