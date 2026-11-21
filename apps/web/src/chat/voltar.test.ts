import { createMemoryHistory } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import { lembrarAsEntradas, voltarParaALista } from './voltar.ts';

/** O histórico do chat com as entradas lembradas, aberto no primeiro endereço. */
function historicoEm(...enderecos: string[]) {
  const [primeiro = '/chat', ...seguintes] = enderecos;
  const historico = createMemoryHistory({ initialEntries: [primeiro] });
  lembrarAsEntradas(historico);
  for (const endereco of seguintes) historico.push(endereco);
  return historico;
}

describe('a volta à lista, no celular', () => {
  it('volta pelo histórico quando a entrada anterior é a lista, que volta como estava', () => {
    const historico = historicoEm('/chat', '/chat/c/a');
    const trocar = vi.fn();
    voltarParaALista(historico, '/chat', trocar);
    expect(historico.location.pathname).toBe('/chat');
    expect(historico.location.state.__TSR_index).toBe(0);
    expect(trocar).not.toHaveBeenCalled();
  });

  it('casa a lista como o roteador: sem a barra do fim e sem diferenciar as maiúsculas', () => {
    const historico = historicoEm('/Chat/', '/chat/c/a');
    const trocar = vi.fn();
    voltarParaALista(historico, '/chat', trocar);
    expect(historico.location.state.__TSR_index).toBe(0);
    expect(trocar).not.toHaveBeenCalled();
  });

  it('volta à lista da vista, como a dos Chamados, para o chamado aberto por ela', () => {
    const historico = historicoEm('/chat/chamados', '/chat/chamados/1045?vista=chamados');
    const trocar = vi.fn();
    voltarParaALista(historico, '/chat/chamados', trocar);
    expect(historico.location.pathname).toBe('/chat/chamados');
    expect(trocar).not.toHaveBeenCalled();
  });

  it('a conversa aberta direto, como por um aviso, troca a entrada dela pela lista', () => {
    const historico = historicoEm('/chat/c/a');
    const trocar = vi.fn();
    voltarParaALista(historico, '/chat', trocar);
    expect(trocar).toHaveBeenCalledWith('/chat');
    expect(historico.location.pathname).toBe('/chat/c/a');
  });

  it('vinda de outra conversa, e não da lista, vai à lista sem voltar à outra', () => {
    const historico = historicoEm('/chat', '/chat/c/a', '/chat/c/b');
    const trocar = vi.fn();
    voltarParaALista(historico, '/chat', trocar);
    expect(trocar).toHaveBeenCalledWith('/chat');
    expect(historico.location.pathname).toBe('/chat/c/b');
  });

  it('lembra a entrada trocada, como a direta que vira a conversa ao nascer', () => {
    const historico = historicoEm('/chat', '/chat/direta/p');
    historico.replace('/chat/c/a');
    historico.push('/chat/c/b');
    historico.back();
    const trocar = vi.fn();
    voltarParaALista(historico, '/chat', trocar);
    expect(historico.location.pathname).toBe('/chat');
    expect(trocar).not.toHaveBeenCalled();
  });

  it('sem as entradas lembradas, como depois de recarregar a página, vai à lista', () => {
    const historico = createMemoryHistory({ initialEntries: ['/chat', '/chat/c/a'] });
    const trocar = vi.fn();
    voltarParaALista(historico, '/chat', trocar);
    expect(trocar).toHaveBeenCalledWith('/chat');
    expect(historico.location.pathname).toBe('/chat/c/a');
  });
});
