import { describe, expect, it } from 'vitest';
import {
  escreverNumero,
  lerNumero,
  montarFiltro,
  operadoresDoEditor,
  rascunhoDe,
} from './filtro.ts';

describe('o número do filtro', () => {
  it('lê o número como o pt-BR escreve, com ou sem os milhares, e com o R$', () => {
    expect(lerNumero('1000')).toBe(1000);
    expect(lerNumero('1.000')).toBe(1000);
    expect(lerNumero('1.000,50')).toBe(1000.5);
    expect(lerNumero('0,5')).toBe(0.5);
    expect(lerNumero('-12,3')).toBe(-12.3);
    expect(lerNumero(' R$ 2.500,00 ')).toBe(2500);
  });

  it('recusa o texto que não é um número', () => {
    for (const texto of ['', 'abc', '1,2,3', '1.00', '12a', ',5', '1.000.00']) {
      expect(lerNumero(texto)).toBeNull();
    }
  });

  it('escreve o número do filtro salvo para o campo', () => {
    expect(escreverNumero(1000.5)).toBe('1000,5');
    expect(escreverNumero(-3)).toBe('-3');
  });
});

describe('os operadores do editor', () => {
  it('são o do tipo da coluna e, se ela pode ficar vazia, vazio e preenchido', () => {
    expect(operadoresDoEditor('texto', true)).toEqual(['contem', 'vazio', 'preenchido']);
    expect(operadoresDoEditor('data', false)).toEqual(['entre']);
    expect(operadoresDoEditor('momento', false)).toEqual(['entre']);
    expect(operadoresDoEditor('escolha', true)).toEqual(['qualquer', 'vazio', 'preenchido']);
    expect(operadoresDoEditor('local', true)).toEqual(['em', 'vazio', 'preenchido']);
    expect(operadoresDoEditor('situacao', false)).toEqual(['situacao']);
    expect(operadoresDoEditor(null, true)).toEqual(['vazio', 'preenchido']);
  });
});

describe('o filtro montado do rascunho', () => {
  it('começa no operador da coluna, sem valor, e volta ao filtro que já existe', () => {
    expect(rascunhoDe(null, 'texto', true).operador).toBe('contem');
    expect(rascunhoDe(null, null, true).operador).toBe('vazio');
    const intervalo = rascunhoDe({ operador: 'entre', de: 10.5 }, 'numero', true);
    expect(intervalo).toMatchObject({ operador: 'entre', de: '10,5', ate: '' });
    const datas = rascunhoDe({ operador: 'entre', ate: '2026-12-31' }, 'data', true);
    expect(datas).toMatchObject({ de: '', ate: '2026-12-31' });
  });

  it('o texto, sem os espaços das pontas, e as recusas dele', () => {
    const rascunho = rascunhoDe(null, 'texto', true);
    expect(montarFiltro({ ...rascunho, texto: '  almox ' }, 'texto')).toEqual({
      filtro: { operador: 'contem', texto: 'almox' },
    });
    expect(montarFiltro({ ...rascunho, texto: '  ' }, 'texto')).toEqual({
      erros: { texto: 'Digite o texto do filtro.' },
    });
    expect(montarFiltro({ ...rascunho, texto: 'a'.repeat(201) }, 'texto')).toEqual({
      erros: { texto: 'Use até 200 caracteres no filtro.' },
    });
  });

  it('o intervalo de números, com um dos limites ou os dois, e as recusas', () => {
    const rascunho = rascunhoDe(null, 'numero', true);
    expect(montarFiltro({ ...rascunho, de: '1.000', ate: '' }, 'numero')).toEqual({
      filtro: { operador: 'entre', de: 1000 },
    });
    expect(montarFiltro({ ...rascunho, de: '', ate: '5,5' }, 'numero')).toEqual({
      filtro: { operador: 'entre', ate: 5.5 },
    });
    expect(montarFiltro(rascunho, 'numero')).toEqual({
      erros: { de: 'Informe o início ou o fim do intervalo.' },
    });
    expect(montarFiltro({ ...rascunho, de: 'dez', ate: 'x' }, 'numero')).toEqual({
      erros: { de: 'Use um número.', ate: 'Use um número.' },
    });
    expect(montarFiltro({ ...rascunho, de: '10', ate: '5' }, 'numero')).toEqual({
      erros: { ate: 'O início vem depois do fim.' },
    });
    expect(montarFiltro({ ...rascunho, de: '5', ate: '5' }, 'numero')).toEqual({
      filtro: { operador: 'entre', de: 5, ate: 5 },
    });
  });

  it('o intervalo de datas, em aaaa-mm-dd', () => {
    const rascunho = rascunhoDe(null, 'data', true);
    expect(montarFiltro({ ...rascunho, de: '2026-01-01', ate: '2026-12-31' }, 'data')).toEqual({
      filtro: { operador: 'entre', de: '2026-01-01', ate: '2026-12-31' },
    });
    expect(montarFiltro({ ...rascunho, de: '2026-12-31', ate: '2026-01-01' }, 'momento')).toEqual({
      erros: { ate: 'O início vem depois do fim.' },
    });
  });

  it('as opções, o local e a situação, e as recusas sem a escolha', () => {
    const escolha = rascunhoDe(null, 'escolha', true);
    expect(montarFiltro({ ...escolha, valores: ['a', 'b'] }, 'escolha')).toEqual({
      filtro: { operador: 'qualquer', valores: ['a', 'b'] },
    });
    expect(montarFiltro(escolha, 'escolha')).toEqual({
      erros: { valores: 'Escolha pelo menos uma opção.' },
    });
    const muitas = Array.from({ length: 101 }, (_, indice) => String(indice));
    expect(montarFiltro({ ...escolha, valores: muitas }, 'escolha')).toEqual({
      erros: { valores: 'Escolha até 100 opções.' },
    });
    const local = rascunhoDe(null, 'local', true);
    expect(montarFiltro({ ...local, local: 'jundiai' }, 'local')).toEqual({
      filtro: { operador: 'em', local: 'jundiai' },
    });
    expect(montarFiltro(local, 'local')).toEqual({ erros: { local: 'Escolha um local.' } });
    const situacao = rascunhoDe(null, 'situacao', false);
    expect(montarFiltro({ ...situacao, situacao: 'inativos' }, 'situacao')).toEqual({
      filtro: { operador: 'situacao', situacao: 'inativos' },
    });
    expect(montarFiltro(situacao, 'situacao')).toEqual({
      erros: { situacao: 'Escolha uma situação da lista.' },
    });
  });

  it('vazio e preenchido, sem valor', () => {
    const rascunho = rascunhoDe(null, 'texto', true);
    expect(montarFiltro({ ...rascunho, operador: 'vazio', texto: '' }, 'texto')).toEqual({
      filtro: { operador: 'vazio' },
    });
    expect(montarFiltro({ ...rascunho, operador: 'preenchido' }, 'texto')).toEqual({
      filtro: { operador: 'preenchido' },
    });
  });
});
