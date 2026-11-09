import { describe, expect, it } from 'vitest';
import { validarFiltrosDoEstoque } from './filtros.ts';

// Os filtros do estoque no endereço (spec modulo-operacao, "Tela do estoque" e "Lançamento das
// movimentações"; change p4c-estoque, design, decisão 7).

describe('os filtros do estoque no endereço', () => {
  it('guarda a busca, o local, o consumível, o tipo e a situação conhecidos', () => {
    expect(
      validarFiltrosDoEstoque({
        busca: 'cf258',
        local: 'jundiai',
        consumivel: 'cf258a',
        tipo: 'toner',
        situacao: 'abaixo-do-minimo',
      }),
    ).toEqual({
      busca: 'cf258',
      local: 'jundiai',
      consumivel: 'cf258a',
      tipo: 'toner',
      situacao: 'abaixo-do-minimo',
    });
  });

  it('guarda o lançamento aberto, com o ativo da saída', () => {
    expect(
      validarFiltrosDoEstoque({ lancar: 'saida', consumivel: 'cf258a', ativo: 'pat412' }),
    ).toEqual({ lancar: 'saida', consumivel: 'cf258a', ativo: 'pat412' });
  });

  it('deixa de fora o que não conhece, a busca vazia e os ids estranhos', () => {
    expect(
      validarFiltrosDoEstoque({
        busca: '  ',
        tipo: 'cartucho',
        situacao: 'acabando',
        lancar: 'emprestimo',
        local: '../../etc',
        consumivel: 42,
      }),
    ).toEqual({});
  });
});
