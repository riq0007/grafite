// O endereço das solicitações (spec modulo-operacao, "Tela das solicitações" e "Formulários das
// solicitações"; change p4d-solicitacoes, design, decisão 8): os filtros e a busca, e a nova
// solicitação aberta pela busca e pela ficha do ativo, com o tipo e o ativo dela, e nada que o
// endereço não conheça.
import { describe, expect, it } from 'vitest';
import { validarFiltrosDasSolicitacoes } from './filtros.ts';

describe('o endereço das solicitações', () => {
  it('Conserto pela busca: a nova solicitação do tipo, com o ativo da ficha', () => {
    expect(validarFiltrosDasSolicitacoes({ nova: 'conserto' })).toEqual({ nova: 'conserto' });
    expect(
      validarFiltrosDasSolicitacoes({
        nova: 'toner',
        ativo: '0199a6e0-0000-7000-8000-000000000412',
      }),
    ).toEqual({ nova: 'toner', ativo: '0199a6e0-0000-7000-8000-000000000412' });
  });

  it('Busca pelo patrimônio: a busca, a situação, o tipo e o local', () => {
    expect(
      validarFiltrosDasSolicitacoes({
        busca: '00412',
        situacao: 'todas',
        tipo: 'toner',
        local: 'expedicao',
      }),
    ).toEqual({ busca: '00412', situacao: 'todas', tipo: 'toner', local: 'expedicao' });
    expect(validarFiltrosDasSolicitacoes({ situacao: 'aguardando-entrega' })).toEqual({
      situacao: 'aguardando-entrega',
    });
  });

  it('Pendentes por padrão: sem a situação no endereço, e "pendentes" não vai para ele', () => {
    expect(validarFiltrosDasSolicitacoes({})).toEqual({});
    expect(validarFiltrosDasSolicitacoes({ situacao: 'pendentes' })).toEqual({});
  });

  it('descarta o tipo e a situação desconhecidos, a busca vazia e o id que não é id', () => {
    expect(
      validarFiltrosDasSolicitacoes({
        nova: 'impressora',
        ativo: '<b>',
        situacao: 'perdida',
        tipo: ['toner'],
        local: 'a b',
        busca: '   ',
      }),
    ).toEqual({});
  });
});
