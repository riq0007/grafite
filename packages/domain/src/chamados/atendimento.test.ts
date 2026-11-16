import { describe, expect, it } from 'vitest';
import {
  atendeOChamado,
  type ContaQueAtendePorPadrao,
  decidirAtendimento,
  ehDaTi,
  type LocaisDoChamado,
  type PedidoDeAtendimento,
  veOChamado,
} from './atendimento.ts';
import { HORARIO_DA_TI_PADRAO } from './prazo.ts';

/**
 * O instante no relógio de São Paulo, que não tem horário de verão desde 2019 (UTC−3). Nos
 * mockups, hoje é terça, 17/11/2026.
 */
const sp = (dataHora: string) => new Date(`${dataHora}:00-03:00`);

const JUNDIAI = 'local-jundiai';
const CAMPINAS = 'local-campinas';

/** Diego atende por padrão a Impressora, nos chamados de Jundiaí. */
const DIEGO: ContaQueAtendePorPadrao = {
  id: 'conta-diego',
  ativa: true,
  alcance: new Set([JUNDIAI]),
};

const EM_JUNDIAI: LocaisDoChamado = { locais: [JUNDIAI], semLocal: false };

/** O chamado de Impressora de Marina, em Jundiaí, aberto às 10:00 de terça, sem o "Fica comigo". */
const PEDIDO: PedidoDeAtendimento = {
  ficaComigo: null,
  padrao: DIEGO,
  semNinguem: 'triagem',
  locais: EM_JUNDIAI,
  horario: HORARIO_DA_TI_PADRAO,
  agora: sp('2026-11-17T10:00'),
};

const TRIAGEM = { situacao: 'triagem', atende: null };
const COM_DIEGO = { situacao: 'em-atendimento', atende: 'conta-diego' };

describe('decidirAtendimento', () => {
  it('com o "Fica comigo", fica com quem abre, mesmo fora do horário e com quem atende por padrão', () => {
    expect(decidirAtendimento({ ...PEDIDO, ficaComigo: 'conta-ana' })).toEqual({
      situacao: 'em-atendimento',
      atende: 'conta-ana',
    });
    expect(
      decidirAtendimento({ ...PEDIDO, ficaComigo: 'conta-ana', agora: sp('2026-11-17T07:40') }),
    ).toEqual({ situacao: 'em-atendimento', atende: 'conta-ana' });
  });

  it('no horário, fica com quem atende por padrão', () => {
    expect(decidirAtendimento(PEDIDO)).toEqual(COM_DIEGO);
  });

  it('sem quem atende por padrão, cai na triagem', () => {
    expect(decidirAtendimento({ ...PEDIDO, padrao: null })).toEqual(TRIAGEM);
  });

  it('aberto às 07:40, antes do horário, cai na triagem com o "Cai na triagem"', () => {
    expect(decidirAtendimento({ ...PEDIDO, agora: sp('2026-11-17T07:40') })).toEqual(TRIAGEM);
    // No sábado e às 18:00 também é fora do horário.
    expect(decidirAtendimento({ ...PEDIDO, agora: sp('2026-11-21T10:00') })).toEqual(TRIAGEM);
    expect(decidirAtendimento({ ...PEDIDO, agora: sp('2026-11-17T18:00') })).toEqual(TRIAGEM);
  });

  it('fora do horário, fica com quem atende por padrão com o "Fica com Diego mesmo assim"', () => {
    expect(
      decidirAtendimento({ ...PEDIDO, semNinguem: 'fica', agora: sp('2026-11-17T07:40') }),
    ).toEqual(COM_DIEGO);
  });

  it('com quem atende por padrão inativo, cai na triagem, no horário e fora dele', () => {
    const inativo = { ...DIEGO, ativa: false };
    expect(decidirAtendimento({ ...PEDIDO, padrao: inativo })).toEqual(TRIAGEM);
    expect(
      decidirAtendimento({
        ...PEDIDO,
        padrao: inativo,
        semNinguem: 'fica',
        agora: sp('2026-11-17T07:40'),
      }),
    ).toEqual(TRIAGEM);
  });

  it('com quem atende por padrão fora dos locais do chamado, cai na triagem', () => {
    // O ativo de Campinas leva o chamado a Jundiaí e a Campinas, e Diego só atende Jundiaí.
    const doisLocais: LocaisDoChamado = { locais: [JUNDIAI, CAMPINAS], semLocal: false };
    expect(decidirAtendimento({ ...PEDIDO, locais: doisLocais })).toEqual(TRIAGEM);
    expect(
      decidirAtendimento({
        ...PEDIDO,
        locais: doisLocais,
        semNinguem: 'fica',
        agora: sp('2026-11-17T07:40'),
      }),
    ).toEqual(TRIAGEM);
    // Sem `chamados.atender`, a conta não tem alcance.
    expect(decidirAtendimento({ ...PEDIDO, padrao: { ...DIEGO, alcance: null } })).toEqual(TRIAGEM);
  });

  it('o chamado sem local só fica com quem atende a organização inteira', () => {
    const semLocal: LocaisDoChamado = { locais: [JUNDIAI], semLocal: true };
    expect(decidirAtendimento({ ...PEDIDO, locais: semLocal })).toEqual(TRIAGEM);
    expect(
      decidirAtendimento({
        ...PEDIDO,
        locais: semLocal,
        padrao: { ...DIEGO, alcance: 'organizacao' },
      }),
    ).toEqual(COM_DIEGO);
  });
});

describe('atendeOChamado', () => {
  it('atende quem tem `chamados.atender` em todos os locais, e o sem local, na organização inteira', () => {
    const doisLocais: LocaisDoChamado = { locais: [JUNDIAI, CAMPINAS], semLocal: false };
    expect(atendeOChamado('organizacao', doisLocais)).toBe(true);
    expect(atendeOChamado(new Set([JUNDIAI, CAMPINAS]), doisLocais)).toBe(true);
    expect(atendeOChamado(new Set([JUNDIAI]), doisLocais)).toBe(false);
    expect(atendeOChamado(null, doisLocais)).toBe(false);
    expect(atendeOChamado(new Set([JUNDIAI]), { locais: [JUNDIAI], semLocal: true })).toBe(false);
    expect(atendeOChamado('organizacao', { locais: [], semLocal: true })).toBe(true);
  });
});

describe('ehDaTi', () => {
  it('é da TI a conta ativa com `chamados.atender` em algum local', () => {
    expect(ehDaTi(DIEGO)).toBe(true);
    expect(ehDaTi({ ...DIEGO, alcance: 'organizacao' })).toBe(true);
    expect(ehDaTi({ ...DIEGO, ativa: false })).toBe(false);
    expect(ehDaTi({ ...DIEGO, alcance: null })).toBe(false);
    expect(ehDaTi({ ...DIEGO, alcance: new Set() })).toBe(false);
  });
});

describe('veOChamado', () => {
  it('vê quem tem `chamados.ver` num dos locais, e o sem local, na organização inteira', () => {
    const doisLocais: LocaisDoChamado = { locais: [JUNDIAI, CAMPINAS], semLocal: false };
    expect(veOChamado('organizacao', doisLocais)).toBe(true);
    expect(veOChamado(new Set([CAMPINAS]), doisLocais)).toBe(true);
    expect(veOChamado(new Set([CAMPINAS]), EM_JUNDIAI)).toBe(false);
    expect(veOChamado(null, doisLocais)).toBe(false);
    expect(veOChamado(new Set([JUNDIAI]), { locais: [JUNDIAI], semLocal: true })).toBe(true);
    expect(veOChamado(new Set([JUNDIAI]), { locais: [], semLocal: true })).toBe(false);
    expect(veOChamado('organizacao', { locais: [], semLocal: true })).toBe(true);
  });
});
