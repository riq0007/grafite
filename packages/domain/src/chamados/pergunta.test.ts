import { describe, expect, it } from 'vitest';
import { conferirOpcoes, MENSAGENS_DA_PERGUNTA } from './pergunta.ts';

describe('as opções da pergunta', () => {
  it('a mensagem sem opções não pergunta nada', () => {
    expect(conferirOpcoes([])).toEqual({ ok: true, opcoes: [] });
  });

  it('vão de 2 a 3, sem os espaços das pontas', () => {
    expect(conferirOpcoes([' Pode ser ', 'Agora não\n'])).toEqual({
      ok: true,
      opcoes: ['Pode ser', 'Agora não'],
    });
    expect(conferirOpcoes(['Pode ser', 'Agora não', 'Amanhã cedo'])).toEqual({
      ok: true,
      opcoes: ['Pode ser', 'Agora não', 'Amanhã cedo'],
    });
  });

  it('uma só ou quatro recusam', () => {
    const recusa = { ok: false, erro: 'Use de 2 a 3 opções.' };
    expect(conferirOpcoes(['Pode ser'])).toEqual(recusa);
    expect(conferirOpcoes(['Sim', 'Não', 'Talvez', 'Amanhã'])).toEqual(recusa);
  });

  it('cada opção pede o texto', () => {
    expect(conferirOpcoes(['Pode ser', '  '])).toEqual({ ok: false, erro: 'Escreva a opção.' });
  });

  it('cada opção vai até 40 caracteres, contados em caracteres', () => {
    expect(conferirOpcoes(['Pode ser', '👍'.repeat(40)])).toMatchObject({ ok: true });
    expect(conferirOpcoes(['Pode ser', 'a'.repeat(41)])).toEqual({
      ok: false,
      erro: 'Use até 40 caracteres.',
    });
  });

  it('as opções são diferentes, sem contar os acentos e as maiúsculas', () => {
    const recusa = { ok: false, erro: 'As opções precisam ser diferentes.' };
    expect(conferirOpcoes(['Sim', 'sim'])).toEqual(recusa);
    expect(conferirOpcoes(['Não', 'Sim', 'Nao '])).toEqual(recusa);
  });

  it('as frases das recusas da escolha são as da spec', () => {
    expect(MENSAGENS_DA_PERGUNTA.respondida).toBe('Esta pergunta já foi respondida.');
    expect(MENSAGENS_DA_PERGUNTA.deFora).toBe('Escolha uma opção da pergunta.');
  });
});
