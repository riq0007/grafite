// Os avisos do push no service worker (spec notificacoes, "Push por severidade"; change
// p3c-email-e-push, design, decisão 7). O service worker gerado pelo Workbox importa este arquivo:
// ele mostra o push pelo sistema do aparelho, mesmo com o Grafite fechado, e, ao toque, foca a
// janela aberta do Grafite e pede que ela abra o endereço, ou abre uma nova nele. Só endereços do
// próprio Grafite são abertos. A janela é escolhida pelo caminho (change chat-com-chamados, design,
// decisão 12): o destino do chat vai à janela do app do chat ou, sem ela, à da casca, que o traduz;
// os outros vão só à da casca, porque o app do chat não tem as telas dela.

/** O endereço em /chat ou abaixo dele, o do app do chat, como o `DO_CHAT` de `chat/enderecos.ts`. */
const DO_CHAT = /^\/chat(?:[/?#]|$)/;

const SEM_CONTEUDO = {
  titulo: 'Grafite',
  corpo: 'Há uma notificação nova.',
  destino: '/',
  severidade: 'info',
  etiqueta: 'grafite',
};

/** O conteúdo do push, ou o aviso do Grafite quando ele não pode ser lido. */
function lerConteudo(dados) {
  try {
    const conteudo = dados?.json();
    return conteudo && typeof conteudo.titulo === 'string' ? conteudo : SEM_CONTEUDO;
  } catch {
    return SEM_CONTEUDO;
  }
}

/** O endereço dentro do Grafite; o de outro site vira a tela inicial. */
function noGrafite(destino) {
  const origem = self.location.origin;
  try {
    const url = new URL(typeof destino === 'string' ? destino : '/', origem);
    return url.origin === origem ? url : new URL('/', origem);
  } catch {
    return new URL('/', origem);
  }
}

/** O caminho com a busca e o fragmento, como o `?m=` da mensagem do chat. */
const comABusca = (url) => `${url.pathname}${url.search}${url.hash}`;

/** A janela aberta para o destino: a do app do chat, para o do chat, ou a da casca. */
function janelaPara(janelas, url) {
  const doGrafite = janelas.filter((janela) => new URL(janela.url).origin === self.location.origin);
  const doChat = (janela) => DO_CHAT.test(new URL(janela.url).pathname);
  const doApp = DO_CHAT.test(url.pathname) ? doGrafite.find(doChat) : undefined;
  return doApp ?? doGrafite.find((janela) => !doChat(janela));
}

self.addEventListener('push', (evento) => {
  const conteudo = lerConteudo(evento.data);
  evento.waitUntil(
    self.registration.showNotification(conteudo.titulo, {
      body: conteudo.corpo,
      tag: conteudo.etiqueta,
      icon: '/icones/pwa-192.png',
      data: { destino: comABusca(noGrafite(conteudo.destino)) },
      // O crítico fica até o toque, como o aviso crítico na tela.
      requireInteraction: conteudo.severidade === 'critico',
    }),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const url = noGrafite(evento.notification.data?.destino);
  const destino = comABusca(url);
  evento.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const aberta = janelaPara(janelas, url);
      if (aberta) {
        await aberta.focus();
        aberta.postMessage({ tipo: 'grafite:abrir', destino });
        return;
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});
