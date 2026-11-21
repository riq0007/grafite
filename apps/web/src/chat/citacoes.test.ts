import { describe, expect, it } from 'vitest';
import { type CitacaoNaMensagem, partesDoTexto } from './citacoes.ts';

const citacao = (numero: number, inicio: number, fim = inicio + `#${numero}`.length) =>
  ({ numero, inicio, fim, situacao: 'Em andamento', atende: 'Bruno Lima' }) as CitacaoNaMensagem;

describe('partesDoTexto', () => {
  it('sem citações, é o texto inteiro', () => {
    expect(partesDoTexto('a impressora já está no #1045', [])).toEqual([
      { tipo: 'texto', texto: 'a impressora já está no #1045' },
    ]);
  });

  it('a citação no meio fica entre os dois pedaços do texto', () => {
    const texto = 'a impressora já está no #1045. Ele passa aqui.';
    const doChamado = citacao(1045, 24);
    expect(partesDoTexto(texto, [doChamado])).toEqual([
      { tipo: 'texto', texto: 'a impressora já está no ' },
      { tipo: 'chamado', texto: '#1045', citacao: doChamado },
      { tipo: 'texto', texto: '. Ele passa aqui.' },
    ]);
  });

  it('no começo e no fim, sem pedaços vazios', () => {
    const primeiro = citacao(1044, 0);
    const segundo = citacao(1045, 8);
    expect(partesDoTexto('#1044 e #1045', [primeiro, segundo])).toEqual([
      { tipo: 'chamado', texto: '#1044', citacao: primeiro },
      { tipo: 'texto', texto: ' e ' },
      { tipo: 'chamado', texto: '#1045', citacao: segundo },
    ]);
  });

  it('as citações seguem a ordem do texto, mesmo fora de ordem na lista', () => {
    const primeiro = citacao(1044, 0);
    const segundo = citacao(1045, 8);
    expect(partesDoTexto('#1044 e #1045', [segundo, primeiro]).map(({ texto }) => texto)).toEqual([
      '#1044',
      ' e ',
      '#1045',
    ]);
  });

  it('conta os índices em unidades do UTF-16, como o slice', () => {
    const doChamado = citacao(1045, 3);
    expect(partesDoTexto('👍 #1045', [doChamado])).toEqual([
      { tipo: 'texto', texto: '👍 ' },
      { tipo: 'chamado', texto: '#1045', citacao: doChamado },
    ]);
  });

  it('a citação que não confere com o texto, que cruza outra ou que sai dele fica como o texto', () => {
    const texto = 'veja #1045 e #1044';
    expect(
      partesDoTexto(texto, [
        citacao(1030, 5, 10),
        citacao(1045, 5),
        citacao(1045, 6, 11),
        citacao(1044, 13),
        citacao(1044, 16, 21),
      ]).map(({ tipo, texto: pedaco }) => [tipo, pedaco]),
    ).toEqual([
      ['texto', 'veja '],
      ['chamado', '#1045'],
      ['texto', ' e '],
      ['chamado', '#1044'],
    ]);
  });
});
