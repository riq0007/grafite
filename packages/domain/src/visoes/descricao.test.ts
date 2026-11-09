import { describe, expect, it } from 'vitest';
import {
  type ColunaDescrita,
  descreverDefinicao,
  descreverFiltro,
  partesDoFiltro,
} from './descricao.ts';

const JUNDIAI = '0199a6e0-0000-7000-8000-00000000010a';
const IMPRESSORA = '0199a6e0-0000-7000-8000-0000000000a1';
const SWITCH = '0199a6e0-0000-7000-8000-0000000000a2';

const COLUNAS: ColunaDescrita[] = [
  { chave: 'ativo.rotulo', rotulo: 'Ativo', filtro: 'texto' },
  { chave: 'ativo.tipo', rotulo: 'Tipo', filtro: 'escolha' },
  { chave: 'ativo.hostname', rotulo: 'Hostname', filtro: 'texto', campo: { tipo: 'texto' } },
  { chave: 'ativo.local', rotulo: 'Local', filtro: 'local', campo: { tipo: 'local' } },
  {
    chave: 'ativo.responsavel',
    rotulo: 'Responsável',
    filtro: 'escolha',
    campo: { tipo: 'pessoa' },
  },
  { chave: 'ativo.garantia', rotulo: 'Garantia até', filtro: 'data', campo: { tipo: 'data' } },
  {
    chave: 'ativo.valor-de-compra',
    rotulo: 'Valor de compra',
    filtro: 'numero',
    campo: { tipo: 'moeda' },
  },
  {
    chave: 'ativo.vida-util',
    rotulo: 'Vida útil (meses)',
    filtro: 'numero',
    campo: { tipo: 'inteiro' },
  },
  { chave: 'ativo.criado-em', rotulo: 'Cadastrado em', filtro: 'momento' },
  { chave: 'ativo.situacao', rotulo: 'Situação', filtro: 'situacao' },
  {
    chave: 'criticidade',
    rotulo: 'Criticidade',
    filtro: 'escolha',
    campo: {
      tipo: 'lista',
      configuracao: {
        opcoes: [
          { id: 'alta', rotulo: 'Alta', situacao: 'ativa' },
          { id: 'baixa', rotulo: 'Baixa', situacao: 'inativa' },
        ],
      },
    },
  },
];

const coluna = (chave: string) => COLUNAS.find((candidata) => candidata.chave === chave);

const NOMES: Record<string, string> = {
  [JUNDIAI]: 'Jundiaí',
  [IMPRESSORA]: 'Impressora',
  [SWITCH]: 'Switch',
};
const nomeDoRegistro = (id: string) => NOMES[id];

describe('o filtro em texto', () => {
  it('o texto que contém, o vazio e o preenchido', () => {
    expect(
      descreverFiltro(
        { chave: 'ativo.hostname', operador: 'contem', texto: 'almox' },
        coluna('ativo.hostname'),
      ),
    ).toBe('Hostname: contém almox');
    expect(
      descreverFiltro(
        { chave: 'ativo.responsavel', operador: 'vazio' },
        coluna('ativo.responsavel'),
      ),
    ).toBe('Responsável: está vazio');
    expect(
      descreverFiltro(
        { chave: 'ativo.responsavel', operador: 'preenchido' },
        coluna('ativo.responsavel'),
      ),
    ).toBe('Responsável: está preenchido');
  });

  it('o intervalo de datas, com o início, o fim ou os dois', () => {
    const garantia = coluna('ativo.garantia');
    expect(
      descreverFiltro(
        { chave: 'ativo.garantia', operador: 'entre', de: '2026-01-01', ate: '2026-12-31' },
        garantia,
      ),
    ).toBe('Garantia até: de 01/01/2026 até 31/12/2026');
    expect(
      descreverFiltro({ chave: 'ativo.garantia', operador: 'entre', ate: '2026-12-31' }, garantia),
    ).toBe('Garantia até: até 31/12/2026');
    expect(
      descreverFiltro({ chave: 'ativo.garantia', operador: 'entre', de: '2026-01-01' }, garantia),
    ).toBe('Garantia até: a partir de 01/01/2026');
    expect(
      descreverFiltro(
        { chave: 'ativo.criado-em', operador: 'entre', de: '2026-10-01', ate: '2026-10-10' },
        coluna('ativo.criado-em'),
      ),
    ).toBe('Cadastrado em: de 01/10/2026 até 10/10/2026');
  });

  it('o intervalo de números pelo motor de campos: a moeda em reais e o inteiro com os milhares', () => {
    expect(
      descreverFiltro(
        { chave: 'ativo.valor-de-compra', operador: 'entre', de: 1000 },
        coluna('ativo.valor-de-compra'),
      ),
    ).toBe('Valor de compra: a partir de R$ 1.000,00');
    expect(
      descreverFiltro(
        { chave: 'ativo.vida-util', operador: 'entre', de: 12, ate: 1200 },
        coluna('ativo.vida-util'),
      ),
    ).toBe('Vida útil (meses): de 12 até 1.200');
  });

  it('o intervalo de uma coluna coletada com a unidade dela, como o percentual', () => {
    const suprimentos: ColunaDescrita = {
      chave: 'coleta.suprimentos',
      rotulo: 'Suprimentos',
      filtro: 'numero',
      campo: { tipo: 'inteiro' },
      unidade: '%',
    };
    expect(
      descreverFiltro(
        { chave: 'coleta.suprimentos', operador: 'entre', de: 0, ate: 20 },
        suprimentos,
      ),
    ).toBe('Suprimentos: de 0% até 20%');
    expect(
      descreverFiltro({ chave: 'coleta.suprimentos', operador: 'entre', ate: 20 }, suprimentos),
    ).toBe('Suprimentos: até 20%');
  });

  it('as escolhas pelos nomes dos registros e pelos rótulos das opções', () => {
    expect(
      descreverFiltro(
        { chave: 'ativo.tipo', operador: 'qualquer', valores: [IMPRESSORA, SWITCH] },
        coluna('ativo.tipo'),
        nomeDoRegistro,
      ),
    ).toBe('Tipo: Impressora, Switch');
    expect(
      descreverFiltro(
        { chave: 'criticidade', operador: 'qualquer', valores: ['alta', 'baixa'] },
        coluna('criticidade'),
      ),
    ).toBe('Criticidade: Alta, Baixa');
  });

  it('o local pelo caminho, e a situação pelo rótulo', () => {
    expect(
      descreverFiltro(
        { chave: 'ativo.local', operador: 'em', local: JUNDIAI },
        coluna('ativo.local'),
        nomeDoRegistro,
      ),
    ).toBe('Local: em Jundiaí');
    expect(
      descreverFiltro(
        { chave: 'ativo.local', operador: 'igual', local: JUNDIAI },
        coluna('ativo.local'),
        nomeDoRegistro,
      ),
    ).toBe('Local: só em Jundiaí');
    expect(
      descreverFiltro(
        { chave: 'ativo.situacao', operador: 'situacao', situacao: 'inativos' },
        coluna('ativo.situacao'),
      ),
    ).toBe('Situação: Inativos');
  });

  it('o registro ainda sem nome aparece como "…", e a coluna desconhecida pela chave', () => {
    expect(
      descreverFiltro(
        {
          chave: 'ativo.tipo',
          operador: 'qualquer',
          valores: ['0199a6e0-0000-7000-8000-0000000000ff'],
        },
        coluna('ativo.tipo'),
        nomeDoRegistro,
      ),
    ).toBe('Tipo: …');
    expect(descreverFiltro({ chave: 'tensao', operador: 'contem', texto: '220' }, undefined)).toBe(
      'tensao: contém 220',
    );
  });
});

// As partes do filtro ativo (change filtros-e-barra-da-tabela, design, decisão 3): o operador à
// parte do valor, para a linha dos filtros dizer "Hostname · contém · almox".
describe('as partes do filtro', () => {
  it('o operador à parte do valor, quando ele não é o próprio valor', () => {
    expect(
      partesDoFiltro(
        { chave: 'ativo.hostname', operador: 'contem', texto: 'almox' },
        coluna('ativo.hostname'),
      ),
    ).toEqual({ operador: 'contém', valor: 'almox' });
    expect(
      partesDoFiltro(
        { chave: 'ativo.local', operador: 'em', local: JUNDIAI },
        coluna('ativo.local'),
        nomeDoRegistro,
      ),
    ).toEqual({ operador: 'em', valor: 'Jundiaí' });
    expect(
      partesDoFiltro(
        { chave: 'ativo.local', operador: 'igual', local: JUNDIAI },
        coluna('ativo.local'),
        nomeDoRegistro,
      ),
    ).toEqual({ operador: 'só em', valor: 'Jundiaí' });
    expect(
      partesDoFiltro(
        { chave: 'ativo.tipo', operador: 'qualquer', valores: [IMPRESSORA, SWITCH] },
        coluna('ativo.tipo'),
        nomeDoRegistro,
      ),
    ).toEqual({ operador: 'é qualquer de', valor: 'Impressora, Switch' });
  });

  it('o vazio, o intervalo e a situação são o próprio valor', () => {
    expect(
      partesDoFiltro(
        { chave: 'ativo.responsavel', operador: 'vazio' },
        coluna('ativo.responsavel'),
      ),
    ).toEqual({ operador: null, valor: 'está vazio' });
    expect(
      partesDoFiltro(
        { chave: 'ativo.garantia', operador: 'entre', de: '2026-01-01', ate: '2026-12-31' },
        coluna('ativo.garantia'),
      ),
    ).toEqual({ operador: null, valor: 'de 01/01/2026 até 31/12/2026' });
    expect(
      partesDoFiltro(
        { chave: 'ativo.situacao', operador: 'situacao', situacao: 'inativos' },
        coluna('ativo.situacao'),
      ),
    ).toEqual({ operador: null, valor: 'Inativos' });
  });
});

describe('a definição em texto, para a auditoria', () => {
  it('as colunas pelos rótulos, a ordenação e os filtros', () => {
    expect(
      descreverDefinicao(
        {
          colunas: [
            { chave: 'ativo.rotulo' },
            { chave: 'ativo.hostname', largura: 200 },
            { chave: 'tensao' },
          ],
          ordenacao: { chave: 'ativo.hostname', direcao: 'decrescente' },
          filtros: [
            { chave: 'ativo.local', operador: 'em', local: JUNDIAI },
            { chave: 'ativo.situacao', operador: 'situacao', situacao: 'ativos' },
          ],
        },
        COLUNAS,
        nomeDoRegistro,
      ),
    ).toEqual({
      colunas: ['Ativo', 'Hostname', 'tensao'],
      ordenacao: 'Hostname, decrescente',
      filtros: ['Local: em Jundiaí', 'Situação: Ativos'],
    });
  });

  it('a visão sem ordenação', () => {
    expect(descreverDefinicao({ colunas: [], ordenacao: null, filtros: [] }, COLUNAS)).toEqual({
      colunas: [],
      ordenacao: null,
      filtros: [],
    });
  });
});
