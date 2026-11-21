import { describe, expect, it } from 'vitest';
import { ehDoChat, paraAJanelaDoChat, paraOAppDoChat } from './enderecos.ts';

// Os endereços do app do chat e da janela do Chat da casca (change chat-com-chamados, design,
// decisão 12): o mesmo lugar nos dois, com a busca e o fragmento.

describe('os endereços do chat', () => {
  it('o endereço do app é o /chat e o que vem abaixo dele, e só ele', () => {
    for (const endereco of ['/chat', '/chat/', '/chat/c/abc', '/chat?m=1', '/chat#fim']) {
      expect(ehDoChat(endereco), endereco).toBe(true);
    }
    for (const endereco of ['/', '/chatbot', '/chamados/1045', '/conversas', '/ativos/chat']) {
      expect(ehDoChat(endereco), endereco).toBe(false);
    }
  });

  it('do app à janela do Chat, no mesmo lugar, com a busca e o fragmento', () => {
    expect(paraAJanelaDoChat('/chat')).toBe('/conversas');
    expect(paraAJanelaDoChat('/chat/equipes')).toBe('/conversas/equipes');
    expect(paraAJanelaDoChat('/chat/c/abc?m=def')).toBe('/conversas/c/abc?m=def');
    expect(paraAJanelaDoChat('/chat/chamados/1041?vista=chamados')).toBe(
      '/conversas/chamados/1041?vista=chamados',
    );
    expect(paraAJanelaDoChat('/chat?m=1#fim')).toBe('/conversas?m=1#fim');
  });

  it('o endereço de fora do app fica como está', () => {
    for (const endereco of ['/', '/chatbot', '/chamados/1045', '/ativos/abc', '/conversas']) {
      expect(paraAJanelaDoChat(endereco), endereco).toBe(endereco);
    }
  });

  it('da janela do Chat ao app, o inverso', () => {
    expect(paraOAppDoChat('/conversas')).toBe('/chat');
    expect(paraOAppDoChat('/conversas/c/abc?m=def')).toBe('/chat/c/abc?m=def');
    expect(paraOAppDoChat('/conversas/chamados/1041?vista=chamados')).toBe(
      '/chat/chamados/1041?vista=chamados',
    );
    for (const endereco of ['/conversasx', '/chamados/1045', '/chat/equipes']) {
      expect(paraOAppDoChat(endereco), endereco).toBe(endereco);
    }
  });
});
