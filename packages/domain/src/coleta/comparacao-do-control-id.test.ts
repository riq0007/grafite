// A comparação e a restauração do Control iD (spec comparacao-e-restauracao-do-control-id; change
// p5b-comparacao-e-restauracao, design, decisão 3): a ordem da restauração, a chave dos itens, a
// comparação de uma categoria com o controle, a comparação das tabelas de dois lados, a leitura do
// CSV do controle e o resultado das operações.
import { describe, expect, it } from 'vitest';
import {
  chaveDoItem,
  compararCategoria,
  compararTabelas,
  lerCsvDoControlId,
  ORDEM_DA_RESTAURACAO,
  resultadoDaOperacao,
} from './comparacao-do-control-id.ts';

describe('a ordem e a chave', () => {
  it('restaura pelas dependências, com as fotos por último', () => {
    expect(ORDEM_DA_RESTAURACAO).toEqual([
      'users',
      'groups',
      'user_groups',
      'time_zones',
      'time_spans',
      'access_rules',
      'group_access_rules',
      'access_rule_time_zones',
      'cards',
      'templates',
    ]);
  });

  it('a chave é o id, ou os ids que a categoria de ligação liga', () => {
    expect(chaveDoItem('users', { id: 7, name: 'Marina' })).toBe('7');
    expect(chaveDoItem('user_groups', { user_id: 7, group_id: 10 })).toBe('7:10');
    expect(chaveDoItem('users', { name: 'sem id' })).toBeNull();
  });
});

describe('a comparação com o controle', () => {
  it('Controle com uma pessoa a menos: 1 só no backup e as outras iguais', () => {
    const backup = [
      { id: 1, name: 'Marina', password: 'a', salt: 'b' },
      { id: 2, name: 'Rafael' },
      { id: 3, name: 'Júlia' },
    ];
    const controle = [
      { id: 2, name: 'Rafael' },
      { id: 3, name: 'Júlia Santos' },
      { id: 4, name: 'Novo' },
    ];
    expect(compararCategoria('users', backup, controle)).toEqual({
      iguais: 1,
      soNoBackup: 1,
      soNoControle: 1,
      divergentes: 1,
    });
  });
});

describe('a comparação de dois lados', () => {
  it('Diferença só na senha: idênticos; o nulo é igual ao vazio', () => {
    const a = [
      { id: '1', name: 'Marina', password: 'x', salt: 'y', registration: '' },
      { id: '2', name: 'Rafael', registration: '4822' },
      { id: '3', name: '' },
    ];
    const b = [
      { id: '1', name: 'Marina', password: 'z', salt: 'w', registration: null },
      { id: '2', name: 'Rafael Costa', registration: '4822' },
      { id: '9', name: 'Só em B' },
    ];
    expect(compararTabelas('users', a, b)).toEqual({
      tabela: 'users',
      identicos: 1,
      divergentes: [
        { id: '2', nome: 'Rafael', campos: [{ campo: 'name', a: 'Rafael', b: 'Rafael Costa' }] },
      ],
      soEmA: [{ id: '3', nome: '3' }],
      soEmB: [{ id: '9', nome: 'Só em B' }],
    });
  });
});

describe('o CSV exportado pelo controle', () => {
  it('lê as tabelas do bloco cid_data, cada uma com o cabeçalho', () => {
    const csv = [
      'cid_header',
      'versao,2',
      'cid_data',
      'users',
      'id,name,registration',
      '1,Marina,4821',
      '2,Rafael,4822',
      '',
      'cards',
      'id,value,user_id',
      '100,1234567,1',
      '',
    ].join('\r\n');
    expect(lerCsvDoControlId(csv)).toEqual({
      users: [
        { id: '1', name: 'Marina', registration: '4821' },
        { id: '2', name: 'Rafael', registration: '4822' },
      ],
      cards: [{ id: '100', value: '1234567', user_id: '1' }],
    });
  });
});

describe('o resultado das operações', () => {
  it('Sucesso sem erro, Falha com todas as processadas com erro, Parcial no meio', () => {
    expect(
      resultadoDaOperacao([
        { categoria: 'users', situacao: 'ok' },
        { categoria: 'cards', situacao: 'pulado' },
      ]),
    ).toEqual({ situacao: 'sucesso', erro: null });
    expect(
      resultadoDaOperacao([
        { categoria: 'users', situacao: 'ok' },
        { categoria: 'templates', situacao: 'erro' },
      ]),
    ).toEqual({ situacao: 'parcial', erro: 'Falhou: Biometria.' });
    expect(
      resultadoDaOperacao([
        { categoria: 'users', situacao: 'erro' },
        { categoria: 'cards', situacao: 'pulado' },
      ]),
    ).toEqual({ situacao: 'falha', erro: 'Falhou: Usuários.' });
  });
});
