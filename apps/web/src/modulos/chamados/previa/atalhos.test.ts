// Os atalhos da grade dos tipos (change chamados-da-ti, design, decisão 16): as teclas 1 a 9
// escolhem o tipo da posição, sem modificador e fora de um campo do formulário.
import { describe, expect, it } from 'vitest';
import { atalhoDoEvento, tipoPeloAtalho, ultimoAtalho } from './atalhos.ts';

const IDS = ['toner', 'computador', 'impressora'];

describe('tipoPeloAtalho', () => {
  it('a tecla escolhe o tipo da posição', () => {
    expect(tipoPeloAtalho('1', IDS)).toBe('toner');
    expect(tipoPeloAtalho('3', IDS)).toBe('impressora');
  });

  it('fora de 1 a 9, ou além dos tipos, nada', () => {
    expect(tipoPeloAtalho('4', IDS)).toBeNull();
    expect(tipoPeloAtalho('0', IDS)).toBeNull();
    expect(tipoPeloAtalho('10', IDS)).toBeNull();
    expect(tipoPeloAtalho('a', IDS)).toBeNull();
    expect(tipoPeloAtalho('Enter', IDS)).toBeNull();
  });

  it('o décimo tipo não tem atalho', () => {
    const dez = Array.from({ length: 10 }, (_, i) => `t${i + 1}`);
    expect(tipoPeloAtalho('9', dez)).toBe('t9');
    expect(dez.map((_, i) => tipoPeloAtalho(String(i + 1), dez))).toEqual([
      ...dez.slice(0, 9),
      null,
    ]);
  });
});

describe('ultimoAtalho', () => {
  it('o do último tipo, até o 9', () => {
    expect(ultimoAtalho(0)).toBe(0);
    expect(ultimoAtalho(1)).toBe(1);
    expect(ultimoAtalho(8)).toBe(8);
    expect(ultimoAtalho(12)).toBe(9);
  });
});

describe('atalhoDoEvento', () => {
  const evento = (parte: Partial<Parameters<typeof atalhoDoEvento>[0]> = {}) => ({
    key: '3',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    target: document.createElement('button'),
    ...parte,
  });

  it('a tecla sem modificador', () => {
    expect(atalhoDoEvento(evento())).toBe('3');
  });

  it('com o Ctrl, o Alt ou o Command, nada: o atalho é do sistema', () => {
    expect(atalhoDoEvento(evento({ ctrlKey: true }))).toBeNull();
    expect(atalhoDoEvento(evento({ altKey: true }))).toBeNull();
    expect(atalhoDoEvento(evento({ metaKey: true }))).toBeNull();
  });

  it('num campo do formulário, a tecla é dele', () => {
    expect(atalhoDoEvento(evento({ target: document.createElement('input') }))).toBeNull();
    expect(atalhoDoEvento(evento({ target: document.createElement('textarea') }))).toBeNull();
    expect(atalhoDoEvento(evento({ target: document.createElement('select') }))).toBeNull();
    // O cartão da escolha única é um rádio: o 3 nele não troca o tipo.
    const radio = document.createElement('input');
    radio.type = 'radio';
    expect(atalhoDoEvento(evento({ target: radio }))).toBeNull();
    const editavel = document.createElement('div');
    editavel.setAttribute('contenteditable', 'true');
    const dentro = document.createElement('span');
    editavel.append(dentro);
    expect(atalhoDoEvento(evento({ target: editavel }))).toBeNull();
    expect(atalhoDoEvento(evento({ target: dentro }))).toBeNull();
  });

  it('o texto que deixou de ser editável não é campo: a tecla vale', () => {
    const fixo = document.createElement('div');
    fixo.setAttribute('contenteditable', 'false');
    const dentro = document.createElement('span');
    fixo.append(dentro);
    expect(atalhoDoEvento(evento({ target: fixo }))).toBe('3');
    expect(atalhoDoEvento(evento({ target: dentro }))).toBe('3');
  });

  it('fora de um elemento, como na janela, a tecla vale', () => {
    expect(atalhoDoEvento(evento({ target: null }))).toBe('3');
  });
});
