import { describe, expect, it } from 'vitest';
import { lerLista, lerListaMultipla, mostrarLista, mostrarListaMultipla } from './listas.ts';
import type { OpcaoDaLista } from './tipos.ts';

const aceita = (valor: unknown) => ({ ok: true, valor });
const recusa = (erro: string) => ({ ok: false, erro });

const opcoes: OpcaoDaLista[] = [
  { id: 'op-proprio', rotulo: 'Próprio', situacao: 'ativa' },
  { id: 'op-alugado', rotulo: 'Alugado', situacao: 'ativa' },
  { id: 'op-comodato', rotulo: 'Comodato', situacao: 'inativa' },
];

describe('lerLista', () => {
  it.each([
    ['Próprio', 'op-proprio'],
    ['proprio', 'op-proprio'],
    ['  ALUGADO ', 'op-alugado'],
    ['op-alugado', 'op-alugado'],
  ])('lê %j pelo rótulo, sem diferenciar acento e maiúsculas, ou pelo id', (entrada, valor) => {
    expect(lerLista(entrada, opcoes)).toEqual(aceita(valor));
  });

  it('lê o número de uma célula pelo rótulo', () => {
    const tensoes: OpcaoDaLista[] = [{ id: 'op-110', rotulo: '110', situacao: 'ativa' }];
    expect(lerLista(110, tensoes)).toEqual(aceita('op-110'));
  });

  it('recusa a opção inativa, pelo rótulo ou pelo id', () => {
    expect(lerLista('comodato', opcoes)).toEqual(recusa('A opção Comodato está inativa.'));
    expect(lerLista('op-comodato', opcoes)).toEqual(recusa('A opção Comodato está inativa.'));
  });

  it('recusa o que não é opção, dizendo as opções ativas', () => {
    expect(lerLista('Emprestado', opcoes)).toEqual(
      recusa('Escolha uma das opções: Próprio, Alugado.'),
    );
  });

  it('com mais de 10 opções, a recusa não as lista', () => {
    const muitas = Array.from({ length: 11 }, (_, i) => ({
      id: `op-${i}`,
      rotulo: `Opção ${i}`,
      situacao: 'ativa' as const,
    }));
    expect(lerLista('Outra', muitas)).toEqual(recusa('Escolha uma das opções do campo.'));
  });

  it('o vazio é a falta do valor', () => {
    expect(lerLista('', opcoes)).toEqual(aceita(null));
  });

  it('mostra o rótulo, com "(inativa)" na opção inativa', () => {
    expect(mostrarLista('op-alugado', opcoes)).toBe('Alugado');
    expect(mostrarLista('op-comodato', opcoes)).toBe('Comodato (inativa)');
  });
});

describe('lerListaMultipla', () => {
  it('lê as opções separadas por ";", sem repetir e na ordem das opções', () => {
    expect(lerListaMultipla('alugado; Próprio ;alugado', opcoes)).toEqual(
      aceita(['op-proprio', 'op-alugado']),
    );
  });

  it('lê a lista de opções', () => {
    expect(lerListaMultipla(['op-alugado', 'Próprio'], opcoes)).toEqual(
      aceita(['op-proprio', 'op-alugado']),
    );
  });

  it('recusa com a primeira opção que não serve', () => {
    expect(lerListaMultipla('Próprio; Emprestado', opcoes)).toEqual(
      recusa('Escolha uma das opções: Próprio, Alugado.'),
    );
    expect(lerListaMultipla(['op-comodato'], opcoes)).toEqual(
      recusa('A opção Comodato está inativa.'),
    );
  });

  it.each(['', ' ; ', [], null])('o vazio %j é a falta do valor', (entrada) => {
    expect(lerListaMultipla(entrada, opcoes)).toEqual(aceita(null));
  });

  it('mostra os rótulos separados por vírgula', () => {
    expect(mostrarListaMultipla(['op-proprio', 'op-comodato'], opcoes)).toBe(
      'Próprio, Comodato (inativa)',
    );
  });
});
