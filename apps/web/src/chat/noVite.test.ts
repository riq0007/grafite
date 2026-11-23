import { describe, expect, it, vi } from 'vitest';
import { levarAPaginaDoChat, paginaDoChat, pedePaginaDoChat } from './noVite.ts';

const pagina = { accept: 'text/html,application/xhtml+xml' };

describe('a página do chat no servidor do Vite', () => {
  it.each([
    '/chat',
    '/chat/',
    '/chat?m=0199a6e0',
    '/chat/c/0199a6e0-0000-7000-8000-00000000c0a1',
    '/chat/chamados/1045?m=12',
    '/chat/equipes',
  ])('o pedido de página em %s recebe a página do chat', (url) => {
    expect(pedePaginaDoChat({ method: 'GET', url, headers: pagina })).toBe(true);
  });

  it.each([
    ['o manifesto, que é arquivo', 'GET', '/chat/manifest.webmanifest', pagina],
    ['a casca', 'GET', '/', pagina],
    ['um endereço que só começa com chat', 'GET', '/chatbot', pagina],
    ['as rotas do chat na API', 'GET', '/api/chat/conversas', pagina],
    ['o pedido que não é de página', 'GET', '/chat/chamados', { accept: 'application/json' }],
    ['outro método', 'POST', '/chat', pagina],
  ])('fica de fora: %s', (_caso, method, url, headers) => {
    expect(pedePaginaDoChat({ method, url, headers })).toBe(false);
  });

  it('troca o endereço pelo da página e segue para o Vite', () => {
    const pedido = { method: 'GET', url: '/chat/c/abc?m=1', headers: pagina };
    const seguir = vi.fn();
    levarAPaginaDoChat(pedido as never, {} as never, seguir);
    expect(pedido.url).toBe('/chat/index.html');
    expect(seguir).toHaveBeenCalledOnce();
  });

  it('vale no pnpm dev e no vite preview', () => {
    const plugin = paginaDoChat();
    for (const gancho of [plugin.configureServer, plugin.configurePreviewServer]) {
      const use = vi.fn();
      (gancho as (servidor: unknown) => void)({ middlewares: { use } });
      expect(use).toHaveBeenCalledWith(levarAPaginaDoChat);
    }
  });
});
