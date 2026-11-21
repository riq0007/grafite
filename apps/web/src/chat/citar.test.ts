// O "#" da caixa do chat (spec modulo-chat, "Caixa de escrever do chat"): onde ele começa, os
// chamados da conta que a busca acha e o texto com o chamado escolhido.
import { describe, expect, it } from 'vitest';
import { chamadosParaCitar, citacaoNoCursor, citarNoTexto } from './citar.ts';

describe('citacaoNoCursor', () => {
  it('acha o "#" separado das outras palavras antes do cursor, com o que vem depois dele', () => {
    expect(citacaoNoCursor('a impressora está no #10', 24)).toEqual({ inicio: 21, busca: '10' });
    expect(citacaoNoCursor('#', 1)).toEqual({ inicio: 0, busca: '' });
    expect(citacaoNoCursor('linha\n#imp', 10)).toEqual({ inicio: 6, busca: 'imp' });
  });

  it('o cursor no meio do texto olha só o que vem antes dele', () => {
    expect(citacaoNoCursor('no #10 agora', 6)).toEqual({ inicio: 3, busca: '10' });
  });

  it('o "#" colado a outra palavra, depois de um espaço ou repetido não cita', () => {
    expect(citacaoNoCursor('abc#10', 6)).toBeNull();
    expect(citacaoNoCursor('no #10 ', 7)).toBeNull();
    expect(citacaoNoCursor('##1', 3)).toBeNull();
    expect(citacaoNoCursor('sem cerquilha', 13)).toBeNull();
  });
});

const CHAMADOS = [
  { numero: 1041, titulo: 'Sem acesso à pasta do Financeiro' },
  { numero: 1044, titulo: 'Teclado com teclas falhando' },
  { numero: 1045, titulo: 'Impressora manchando' },
  { numero: 1030, titulo: 'Instalar o Excel' },
];
const numeros = (chamados: readonly { numero: number }[]) => chamados.map(({ numero }) => numero);

describe('chamadosParaCitar', () => {
  it('sem busca, todos, na ordem da lista, até o máximo', () => {
    expect(numeros(chamadosParaCitar(CHAMADOS, ''))).toEqual([1041, 1044, 1045, 1030]);
    expect(numeros(chamadosParaCitar(CHAMADOS, '', 2))).toEqual([1041, 1044]);
  });

  it('com números, pelo começo do número', () => {
    expect(numeros(chamadosParaCitar(CHAMADOS, '104'))).toEqual([1041, 1044, 1045]);
    expect(numeros(chamadosParaCitar(CHAMADOS, '1045'))).toEqual([1045]);
    expect(numeros(chamadosParaCitar(CHAMADOS, '45'))).toEqual([]);
  });

  it('com letras, pelo título, sem diferenciar os acentos e as maiúsculas', () => {
    expect(numeros(chamadosParaCitar(CHAMADOS, 'impress'))).toEqual([1045]);
    expect(numeros(chamadosParaCitar(CHAMADOS, 'ACESSO'))).toEqual([1041]);
    expect(numeros(chamadosParaCitar(CHAMADOS, 'pasta'))).toEqual([1041]);
    expect(numeros(chamadosParaCitar(CHAMADOS, 'a'))).toEqual([1041, 1044, 1045, 1030]);
  });
});

describe('citarNoTexto', () => {
  it('troca o "#" escrito pelo chamado, com um espaço depois, e põe o cursor nele', () => {
    expect(citarNoTexto('no #10', 3, 6, 1045)).toEqual({ texto: 'no #1045 ', cursor: 9 });
    expect(citarNoTexto('#', 0, 1, 1041)).toEqual({ texto: '#1041 ', cursor: 6 });
  });

  it('com um espaço logo depois, não põe outro, e o cursor passa por ele', () => {
    expect(citarNoTexto('no #10 agora', 3, 6, 1045)).toEqual({
      texto: 'no #1045 agora',
      cursor: 9,
    });
  });
});
