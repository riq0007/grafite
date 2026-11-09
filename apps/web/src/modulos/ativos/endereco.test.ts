import { describe, expect, it } from 'vitest';
import { lerEnderecoDosAtivos } from './endereco.ts';

const JUNDIAI = '5f0c2a1e-8d3b-4c7a-9e6f-1a2b3c4d5e6f';

describe('o endereço da tabela dos ativos', () => {
  it('lê a visão, a busca e as mudanças como toda tabela com visões', () => {
    expect(lerEnderecoDosAtivos({ visao: 'fabrica', busca: 'hp', ordem: '-ip' })).toEqual({
      visao: 'fabrica',
      busca: 'hp',
      ordem: '-ip',
    });
  });

  it('o tipo, o local e a situação dos links antigos viram os filtros equivalentes', () => {
    expect(
      lerEnderecoDosAtivos({
        tipo: 'impressora',
        local: JUNDIAI,
        situacao: 'inativos',
        busca: 'hp',
      }),
    ).toEqual({
      busca: 'hp',
      legado: [
        { chave: 'ativo.tipo', operador: 'qualquer', valores: ['impressora'] },
        { chave: 'ativo.local', operador: 'em', local: JUNDIAI },
        { chave: 'ativo.situacao', operador: 'situacao', situacao: 'inativos' },
      ],
    });
  });

  it('deixa de fora o link antigo com valores que não valem', () => {
    expect(lerEnderecoDosAtivos({ tipo: 'a b', local: 'x', situacao: 'quebrado' })).toEqual({});
  });

  it('mantém o legado que ainda não foi reescrito, sem repetir a coluna', () => {
    expect(
      lerEnderecoDosAtivos({
        legado: [{ chave: 'ativo.tipo', operador: 'qualquer', valores: ['switch'] }],
        tipo: 'impressora',
      }),
    ).toEqual({
      legado: [{ chave: 'ativo.tipo', operador: 'qualquer', valores: ['impressora'] }],
    });
  });
});
