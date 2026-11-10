// As opções dos blocos do Início (spec tela-inicial, "Opções dos blocos"; change
// opcoes-dos-blocos-do-inicio, design, decisão 1): o Início resolve o valor de cada opção que o
// bloco declara, e o bloco recebe sempre todas as chaves.
import { describe, expect, it } from 'vitest';
import type { OpcaoDoBloco } from '../tipos.ts';
import { escolhasDa, numeroDa, opcoesDeFabrica, resolverOpcoes } from './opcoes.ts';

const TIPOS: OpcaoDoBloco = {
  chave: 'tipos',
  rotulo: 'Tipos de suprimento',
  forma: 'escolhas',
  opcoes: [
    { id: 'toner', rotulo: 'Toner' },
    { id: 'cilindro', rotulo: 'Cilindro' },
    { id: 'fusor', rotulo: 'Fusor' },
    { id: 'outro', rotulo: 'Outros' },
  ],
  padrao: ['toner', 'cilindro', 'fusor', 'outro'],
  minimo: 1,
};
const NIVEL: OpcaoDoBloco = {
  chave: 'nivel',
  rotulo: 'Nível',
  forma: 'numero',
  minimo: 5,
  maximo: 100,
  unidade: '%',
  padrao: 100,
};
const LOCAIS: OpcaoDoBloco = { chave: 'locais', rotulo: 'Locais', forma: 'locais' };
const DECLARADAS = [TIPOS, NIVEL, LOCAIS];
const ATIVOS = new Set(['jundiai', 'campinas']);

describe('resolverOpcoes', () => {
  it('sem nada guardado, cada opção vale a de fábrica', () => {
    expect(resolverOpcoes(DECLARADAS, undefined, ATIVOS)).toEqual({
      tipos: ['toner', 'cilindro', 'fusor', 'outro'],
      nivel: 100,
      locais: [],
    });
    expect(opcoesDeFabrica(DECLARADAS)).toEqual(resolverOpcoes(DECLARADAS, undefined));
  });

  it('Opção gravada: o valor guardado vale, e as outras ficam com a de fábrica', () => {
    const resolvidas = resolverOpcoes(DECLARADAS, { tipos: ['toner'], nivel: 30 }, ATIVOS);
    expect(resolvidas).toEqual({ tipos: ['toner'], nivel: 30, locais: [] });
    expect(escolhasDa(resolvidas, 'tipos')).toEqual(['toner']);
    expect(numeroDa(resolvidas, 'nivel')).toBe(30);
  });

  it('Bloco sem opções: nada a resolver', () => {
    expect(resolverOpcoes([], { tipos: ['toner'] }, ATIVOS)).toEqual({});
  });

  it('a chave que o bloco não declara é ignorada', () => {
    expect(resolverOpcoes([NIVEL], { nivel: 40, extra: true })).toEqual({ nivel: 40 });
  });

  it('o número fora do intervalo dá lugar ao de fábrica, e as outras opções continuam', () => {
    expect(resolverOpcoes(DECLARADAS, { tipos: ['fusor'], nivel: 3 }, ATIVOS)).toEqual({
      tipos: ['fusor'],
      nivel: 100,
      locais: [],
    });
    expect(resolverOpcoes([NIVEL], { nivel: 250 }).nivel).toBe(100);
    expect(resolverOpcoes([NIVEL], { nivel: '30' }).nivel).toBe(100);
  });

  it('a escolha que saiu da lista sai, e as outras continuam', () => {
    expect(resolverOpcoes([TIPOS], { tipos: ['toner', 'tinta'] }).tipos).toEqual(['toner']);
  });

  it('a escolha que fica abaixo do mínimo dá lugar à de fábrica', () => {
    expect(resolverOpcoes([TIPOS], { tipos: [] }).tipos).toEqual(TIPOS.padrao);
    expect(resolverOpcoes([TIPOS], { tipos: ['tinta'] }).tipos).toEqual(TIPOS.padrao);
    expect(resolverOpcoes([TIPOS], { tipos: 'toner' }).tipos).toEqual(TIPOS.padrao);
  });

  it('sem mínimo, a escolha vazia vale', () => {
    const semMinimo: OpcaoDoBloco = { ...TIPOS, minimo: undefined };
    expect(resolverOpcoes([semMinimo], { tipos: [] }).tipos).toEqual([]);
  });

  it('Local inativado nas opções: sem nenhum local ativo, valem todos, e o tipo continua', () => {
    expect(resolverOpcoes(DECLARADAS, { tipos: ['toner'], locais: ['matriz'] }, ATIVOS)).toEqual({
      tipos: ['toner'],
      nivel: 100,
      locais: [],
    });
  });

  it('Um dos locais inativado: o bloco continua com os outros', () => {
    expect(resolverOpcoes([LOCAIS], { locais: ['jundiai', 'matriz'] }, ATIVOS).locais).toEqual([
      'jundiai',
    ]);
  });

  it('enquanto os locais não chegam, vale o que está guardado', () => {
    expect(resolverOpcoes([LOCAIS], { locais: ['jundiai', 'matriz'] }).locais).toEqual([
      'jundiai',
      'matriz',
    ]);
  });

  it('o valor repetido entra uma vez', () => {
    expect(resolverOpcoes([TIPOS], { tipos: ['toner', 'toner', 'fusor'] }).tipos).toEqual([
      'toner',
      'fusor',
    ]);
  });
});
