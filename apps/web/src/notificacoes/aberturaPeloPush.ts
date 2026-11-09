// A abertura pelo toque no push (spec notificacoes, "Push por severidade"; change p3c-email-e-push,
// design, decisão 7): o service worker pede à janela aberta do Grafite que abra o endereço da
// notificação, e ela o abre pelo roteador, sem recarregar. Só um endereço do próprio Grafite vale.

/** O que a abertura usa do `navigator.serviceWorker`. */
export interface ContainerDoServiceWorker {
  addEventListener(tipo: 'message', ouvinte: (evento: MessageEvent) => void): void;
  removeEventListener(tipo: 'message', ouvinte: (evento: MessageEvent) => void): void;
}

/** Um caminho do próprio Grafite, como "/ativos/1", e não o de outro site. */
const caminhoDoGrafite = (destino: unknown): destino is string =>
  typeof destino === 'string' && destino.startsWith('/') && !destino.startsWith('//');

/** Ouve os pedidos de abertura do service worker; devolve o que para de ouvir. */
export function ouvirAberturaPeloPush(
  container: ContainerDoServiceWorker | undefined,
  navegar: (destino: string) => void,
): () => void {
  if (!container) return () => {};
  const ouvinte = (evento: MessageEvent) => {
    const { tipo, destino } = (evento.data ?? {}) as { tipo?: unknown; destino?: unknown };
    if (tipo === 'grafite:abrir' && caminhoDoGrafite(destino)) navegar(destino);
  };
  container.addEventListener('message', ouvinte);
  return () => container.removeEventListener('message', ouvinte);
}
