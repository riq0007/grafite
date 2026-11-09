// O endereço das ordens de serviço (spec modulo-operacao, "Tela das ordens de serviço" e
// "Formulários das ordens de serviço"; change p4e-ordens-de-servico, design, decisão 8): os filtros
// e a busca, e a nova OS aberta pela busca e pela ficha do ativo, com o ativo dela, e nada que o
// endereço não conheça.
import { describe, expect, it } from 'vitest';
import { validarFiltrosDasOrdens } from './filtros.ts';

describe('o endereço das ordens de serviço', () => {
  it('Nova OS pela busca e pela ficha do ativo: a nova OS, com o ativo da ficha', () => {
    expect(validarFiltrosDasOrdens({ nova: 1 })).toEqual({ nova: true });
    expect(validarFiltrosDasOrdens({ nova: '1', ativo: 'nb0031' })).toEqual({
      nova: true,
      ativo: 'nb0031',
    });
  });

  it('Busca pelo patrimônio: a busca, a situação e o local', () => {
    expect(
      validarFiltrosDasOrdens({ busca: 'nb-0031', situacao: 'todas', local: 'expedicao' }),
    ).toEqual({ busca: 'nb-0031', situacao: 'todas', local: 'expedicao' });
    expect(validarFiltrosDasOrdens({ situacao: 'aguardando-peca' })).toEqual({
      situacao: 'aguardando-peca',
    });
  });

  it('Em aberto por padrão: sem a situação no endereço, e "em-aberto" não vai para ele', () => {
    expect(validarFiltrosDasOrdens({})).toEqual({});
    expect(validarFiltrosDasOrdens({ situacao: 'em-aberto' })).toEqual({});
  });

  it('descarta a situação desconhecida, a busca vazia, a nova que não é 1 e o id que não é id', () => {
    expect(
      validarFiltrosDasOrdens({
        nova: 'sim',
        ativo: '<b>',
        situacao: 'perdida',
        local: 'a b',
        busca: '   ',
      }),
    ).toEqual({});
  });
});
