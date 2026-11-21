// Os destinos à vista (change chat-com-chamados, design, decisão 6): a notificação com o destino de
// uma tela à vista não vira aviso. O destino vale sem a busca, e cada tela marca e desmarca o dela.
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import {
  ContextoDosDestinosAVista,
  criarDestinosAVista,
  useChamadoAVista,
} from './destinosAVista.tsx';

const CONVERSA = '/chat/c/0199a6e0-0000-7000-8000-00000000c0e1';

describe('os destinos à vista', () => {
  it('o destino vale sem a busca e o fragmento, como o ?m= da mensagem, e com o id em maiúsculas', () => {
    const destinos = criarDestinosAVista();
    destinos.marcar(CONVERSA);
    expect(destinos.estaAVista(`${CONVERSA}?m=0199a6e0-0000-7000-8000-000000000006`)).toBe(true);
    expect(destinos.estaAVista(`${CONVERSA}#fim`)).toBe(true);
    expect(destinos.estaAVista(CONVERSA.toUpperCase())).toBe(true);
    expect(destinos.estaAVista(`${CONVERSA}0`)).toBe(false);
    expect(destinos.estaAVista('/chat/chamados/1045')).toBe(false);
  });

  it('fica à vista enquanto uma tela o marca, e desmarcar duas vezes não tira a marca da outra', () => {
    const destinos = criarDestinosAVista();
    const primeira = destinos.marcar(CONVERSA);
    const segunda = destinos.marcar(CONVERSA);
    primeira();
    primeira();
    expect(destinos.estaAVista(CONVERSA)).toBe(true);
    segunda();
    expect(destinos.estaAVista(CONVERSA)).toBe(false);
  });
});

describe('o chamado à vista', () => {
  it('marca os dois endereços do chamado, o da TI e o de quem participa, enquanto está à vista', () => {
    const destinos = criarDestinosAVista();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(ContextoDosDestinosAVista.Provider, { value: destinos }, children);
    const { rerender, unmount } = renderHook(
      ({ aVista }: { aVista: boolean }) => useChamadoAVista(1045, aVista),
      { wrapper, initialProps: { aVista: true } },
    );
    expect(destinos.estaAVista('/chamados/1045')).toBe(true);
    expect(destinos.estaAVista('/chat/chamados/1045')).toBe(true);
    expect(destinos.estaAVista('/chamados/1041')).toBe(false);
    rerender({ aVista: false });
    expect(destinos.estaAVista('/chamados/1045')).toBe(false);
    expect(destinos.estaAVista('/chat/chamados/1045')).toBe(false);
    rerender({ aVista: true });
    unmount();
    expect(destinos.estaAVista('/chamados/1045')).toBe(false);
  });
});
