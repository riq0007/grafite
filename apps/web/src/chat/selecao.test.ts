// A ordem das marcadas na seleção (spec modulo-chat, "Mensagens selecionadas" e "Transformar em
// chamado na tela"): na ordem da conversa, e não na de marcar, sem a que já virou chamado.
import { describe, expect, it } from 'vitest';
import { id, mensagem } from '../teste/conversaDoChat.ts';
import { marcadasNaOrdem } from './selecao.ts';

const conhecidas = new Map(
  [
    mensagem(1),
    mensagem(2),
    mensagem(3, { chamado: { numero: 1045, abrir: true, mensagem: id(3), mensagens: 1 } }),
    mensagem(12),
  ].map((m) => [m.id, m]),
);

describe('marcadasNaOrdem', () => {
  it('cita as marcadas na ordem da conversa, e não na de marcar', () => {
    expect(marcadasNaOrdem([id(12), id(1), id(2)], conhecidas).map(({ texto }) => texto)).toEqual([
      'Mensagem 1',
      'Mensagem 2',
      'Mensagem 12',
    ]);
  });

  it('tira a que já virou chamado e a que a tela não leu', () => {
    expect(marcadasNaOrdem([id(3), id(2), id(40)], conhecidas).map(({ texto }) => texto)).toEqual([
      'Mensagem 2',
    ]);
  });
});
