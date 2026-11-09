import type { DefinicaoDaVisao, FiltroDaVisao } from '@grafite/domain';
import { describe, expect, it } from 'vitest';
import {
  colunasDoEndereco,
  colunasNoEndereco,
  comAsIndisponiveis,
  definicaoComMudancas,
  lerEnderecoDaTabela,
  mudancasSobre,
  ordemDoEndereco,
  ordemNoEndereco,
} from './endereco.ts';

const UUID = '0b7c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d';

const SO_ATIVOS: FiltroDaVisao = {
  chave: 'ativo.situacao',
  operador: 'situacao',
  situacao: 'ativos',
};

const BASE: DefinicaoDaVisao = {
  colunas: [{ chave: 'ativo.rotulo' }, { chave: 'ativo.patrimonio', largura: 140 }],
  ordenacao: { chave: 'ativo.criado-em', direcao: 'decrescente' },
  filtros: [SO_ATIVOS],
};

describe('as colunas e a ordem no endereço', () => {
  it('as colunas compactas, com a largura quando há', () => {
    expect(colunasNoEndereco([{ chave: 'ativo.rotulo', largura: 280 }, { chave: 'ip' }])).toBe(
      'ativo.rotulo:280,ip',
    );
    expect(colunasDoEndereco('ativo.rotulo:280,ip')).toEqual([
      { chave: 'ativo.rotulo', largura: 280 },
      { chave: 'ip' },
    ]);
  });

  it('a largura fora dos limites vai ao limite, e a coluna repetida fica de fora', () => {
    expect(colunasDoEndereco('a:10,b:9000,a:300')).toEqual([
      { chave: 'a', largura: 64 },
      { chave: 'b', largura: 800 },
    ]);
  });

  it('recusa as colunas mal escritas', () => {
    for (const texto of ['', ',', 'a:', 'a:x', 'a:1:2', ' a', 'a,,b']) {
      expect(colunasDoEndereco(texto)).toBeNull();
    }
  });

  it('a ordem como a chave, crescente, ou com o menos, decrescente; vazia, sem ordem', () => {
    expect(ordemNoEndereco({ chave: 'ip', direcao: 'crescente' })).toBe('ip');
    expect(ordemNoEndereco({ chave: 'ip', direcao: 'decrescente' })).toBe('-ip');
    expect(ordemNoEndereco(null)).toBe('');
    expect(ordemDoEndereco('-ip')).toEqual({ chave: 'ip', direcao: 'decrescente' });
    expect(ordemDoEndereco('ip')).toEqual({ chave: 'ip', direcao: 'crescente' });
    expect(ordemDoEndereco('')).toBeNull();
    expect(ordemDoEndereco('-')).toBeUndefined();
  });
});

describe('a leitura do endereço', () => {
  it('guarda só o que é válido: a visão, a busca e as mudanças', () => {
    expect(
      lerEnderecoDaTabela({
        visao: UUID,
        busca: ' laserjet ',
        colunas: 'ativo.rotulo,ip:120',
        ordem: '-ip',
        filtros: [{ chave: 'ativo.hostname', operador: 'contem', texto: 'almox' }],
      }),
    ).toEqual({
      visao: UUID,
      busca: ' laserjet ',
      colunas: 'ativo.rotulo,ip:120',
      ordem: '-ip',
      filtros: [{ chave: 'ativo.hostname', operador: 'contem', texto: 'almox' }],
    });
    expect(lerEnderecoDaTabela({ visao: 'fabrica' })).toEqual({ visao: 'fabrica' });
  });

  it('deixa de fora o que não vale, e lê a busca que o endereço trouxe como número', () => {
    expect(
      lerEnderecoDaTabela({
        visao: 'qualquer',
        busca: '   ',
        colunas: 'a:x',
        ordem: 3,
        filtros: [{ chave: 'a', operador: 'contem', texto: '' }],
      }),
    ).toEqual({});
    expect(lerEnderecoDaTabela({ busca: 412 })).toEqual({ busca: '412' });
    expect(lerEnderecoDaTabela({ visao: UUID.toUpperCase() })).toEqual({ visao: UUID });
  });
});

describe('a definição com as mudanças do endereço', () => {
  it('cada mudança vale no lugar da parte da visão, e o resto continua o da visão', () => {
    expect(definicaoComMudancas(BASE, { colunas: 'ativo.rotulo,ip' })).toEqual({
      ...BASE,
      colunas: [{ chave: 'ativo.rotulo' }, { chave: 'ip' }],
    });
    expect(definicaoComMudancas(BASE, { ordem: '' })).toEqual({ ...BASE, ordenacao: null });
    expect(definicaoComMudancas(BASE, { filtros: [] })).toEqual({ ...BASE, filtros: [] });
    expect(definicaoComMudancas(BASE, {})).toEqual(BASE);
  });

  it('as mudanças ficam só onde a tabela difere da visão', () => {
    expect(mudancasSobre(BASE, BASE)).toEqual({});
    expect(mudancasSobre(BASE, { ...BASE, colunas: [...BASE.colunas, { chave: 'ip' }] })).toEqual({
      colunas: 'ativo.rotulo,ativo.patrimonio:140,ip',
    });
    expect(
      mudancasSobre(BASE, { ...BASE, ordenacao: { chave: 'ip', direcao: 'crescente' } }),
    ).toEqual({ ordem: 'ip' });
    const tipo: FiltroDaVisao = { chave: 'ativo.tipo', operador: 'qualquer', valores: ['switch'] };
    expect(mudancasSobre(BASE, { ...BASE, filtros: [tipo, SO_ATIVOS] })).toEqual({
      filtros: [tipo, SO_ATIVOS],
    });
    // Os mesmos filtros noutra ordem não são uma mudança.
    const dois = { ...BASE, filtros: [SO_ATIVOS, tipo] };
    expect(mudancasSobre(dois, { ...dois, filtros: [tipo, SO_ATIVOS] })).toEqual({});
  });
});

describe('as colunas que deixaram de valer', () => {
  const comInativo: DefinicaoDaVisao = {
    colunas: [
      { chave: 'ativo.rotulo' },
      { chave: 'campo.garantia' },
      { chave: 'ativo.patrimonio' },
    ],
    ordenacao: { chave: 'campo.garantia', direcao: 'crescente' },
    filtros: [SO_ATIVOS, { chave: 'campo.garantia', operador: 'vazio' }],
  };
  const disponiveis = new Set(['ativo.rotulo', 'ativo.patrimonio', 'ativo.situacao', 'ip']);

  it('voltam à mudança no lugar delas, para a visão salva não as perder', () => {
    const tabela: DefinicaoDaVisao = {
      colunas: [{ chave: 'ativo.rotulo' }, { chave: 'ativo.patrimonio' }, { chave: 'ip' }],
      ordenacao: null,
      filtros: [SO_ATIVOS],
    };
    expect(comAsIndisponiveis(tabela, comInativo, disponiveis)).toEqual({
      colunas: [
        { chave: 'ativo.rotulo' },
        { chave: 'campo.garantia' },
        { chave: 'ativo.patrimonio' },
        { chave: 'ip' },
      ],
      ordenacao: { chave: 'campo.garantia', direcao: 'crescente' },
      filtros: [SO_ATIVOS, { chave: 'campo.garantia', operador: 'vazio' }],
    });
  });

  it('a tabela igual à visão sem elas não vira mudança', () => {
    const efetiva: DefinicaoDaVisao = {
      colunas: [{ chave: 'ativo.rotulo' }, { chave: 'ativo.patrimonio' }],
      ordenacao: null,
      filtros: [SO_ATIVOS],
    };
    expect(mudancasSobre(comInativo, comAsIndisponiveis(efetiva, comInativo, disponiveis))).toEqual(
      {},
    );
  });

  it('a ordem escolhida pelo usuário vale no lugar da que deixou de valer', () => {
    const tabela: DefinicaoDaVisao = {
      colunas: [{ chave: 'ativo.rotulo' }, { chave: 'ativo.patrimonio' }],
      ordenacao: { chave: 'ativo.patrimonio', direcao: 'crescente' },
      filtros: [SO_ATIVOS],
    };
    expect(comAsIndisponiveis(tabela, comInativo, disponiveis).ordenacao).toEqual({
      chave: 'ativo.patrimonio',
      direcao: 'crescente',
    });
  });
});
