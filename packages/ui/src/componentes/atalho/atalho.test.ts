import { describe, expect, it } from 'vitest';
import { formatarAtalho } from './atalho.ts';

describe('formatarAtalho', () => {
  it('"mod" é Ctrl no Windows e no Linux', () => {
    expect(formatarAtalho(['mod', 'k'], 'outra')).toEqual([
      { simbolo: 'Ctrl', nome: 'Ctrl' },
      { simbolo: 'K', nome: 'K' },
    ]);
  });

  it('"mod" é ⌘ no Mac, com o nome por extenso para o leitor de tela', () => {
    expect(formatarAtalho(['mod', 'shift', 'k'], 'mac')).toEqual([
      { simbolo: '⌘', nome: 'Command' },
      { simbolo: '⇧', nome: 'Shift' },
      { simbolo: 'K', nome: 'K' },
    ]);
  });

  it('teclas especiais têm nome em pt-BR quando é diferente do símbolo', () => {
    expect(formatarAtalho(['enter', 'esc', 'up'], 'outra')).toEqual([
      { simbolo: 'Enter', nome: 'Enter' },
      { simbolo: 'Esc', nome: 'Esc' },
      { simbolo: '↑', nome: 'Seta para cima' },
    ]);
  });
});
