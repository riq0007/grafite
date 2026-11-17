import { describe, expect, it } from 'vitest';
import { MAIOR_NUMERO_DE_CHAMADO, termoDaBusca } from './busca.ts';

describe('o termo da busca dos chamados', () => {
  it('com o "#", só o número, e o título fica de fora', () => {
    expect(termoDaBusca('#1042')).toEqual({ numero: 1042, palavras: [] });
    expect(termoDaBusca(' #1042 ')).toEqual({ numero: 1042, palavras: [] });
    expect(termoDaBusca('#007')).toEqual({ numero: 7, palavras: [] });
  });

  it('só os algarismos pedem o número e também o título que os tem', () => {
    expect(termoDaBusca('1042')).toEqual({ numero: 1042, palavras: ['1042'] });
    expect(termoDaBusca('404')).toEqual({ numero: 404, palavras: ['404'] });
  });

  it('o número fora da faixa do banco não pede número nenhum', () => {
    expect(MAIOR_NUMERO_DE_CHAMADO).toBe(2_147_483_647);
    expect(termoDaBusca(`#${MAIOR_NUMERO_DE_CHAMADO}`)).toEqual({
      numero: MAIOR_NUMERO_DE_CHAMADO,
      palavras: [],
    });
    expect(termoDaBusca(`#${MAIOR_NUMERO_DE_CHAMADO + 1}`)).toEqual({ numero: null, palavras: [] });
    expect(termoDaBusca('#99999999999')).toEqual({ numero: null, palavras: [] });
    expect(termoDaBusca('#0')).toEqual({ numero: null, palavras: [] });
    expect(termoDaBusca('0')).toEqual({ numero: null, palavras: ['0'] });
  });

  it('as palavras, sem acento, em minúsculas e sem os espaços a mais', () => {
    expect(termoDaBusca('RECEPÇÃO  manchando')).toEqual({
      numero: null,
      palavras: ['recepcao', 'manchando'],
    });
    expect(termoDaBusca('Reuniões')).toEqual({ numero: null, palavras: ['reunioes'] });
    expect(termoDaBusca('M404')).toEqual({ numero: null, palavras: ['m404'] });
    // Só o acento não sobra palavra nenhuma: a palavra vazia acharia todos os títulos.
    expect(termoDaBusca('́')).toEqual({ numero: null, palavras: [] });
  });

  it('o "#" com mais coisa vira palavra', () => {
    expect(termoDaBusca('# 1042')).toEqual({ numero: null, palavras: ['#', '1042'] });
    expect(termoDaBusca('#1042 toner')).toEqual({ numero: null, palavras: ['#1042', 'toner'] });
  });
});
