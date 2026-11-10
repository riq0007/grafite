// O prazo da confiança nos aparelhos (spec verificacao-em-dois-passos, "Prazo da confiança"; change
// aparelho-confiavel, design, decisão 4): de onde vem o prazo de uma conta e até quando um aparelho
// marcado dispensa o código.
import { describe, expect, it } from 'vitest';
import { type AtribuicaoParaAcesso, type PerfilParaAcesso, resolverAcesso } from './acesso.ts';
import {
  aparelhoNoPrazo,
  prazoDaConfianca,
  prazoValido,
  textoDoPrazo,
  textoDosDias,
} from './confianca.ts';

const DIA = 24 * 60 * 60 * 1000;
const MARCADO = new Date('2026-11-01T12:00:00.000Z');
const depois = (dias: number) => new Date(MARCADO.getTime() + dias * DIA);

const perfil = (dados: Partial<PerfilParaAcesso> = {}): PerfilParaAcesso => ({
  id: 'tec',
  nome: 'Técnico',
  situacao: 'ativo',
  permissoes: ['pessoas.ver'],
  todasAsPermissoes: false,
  exigeDoisPassos: false,
  diasDeConfianca: null,
  ...dados,
});

const atribuicao = (dados: Partial<AtribuicaoParaAcesso> = {}): AtribuicaoParaAcesso => ({
  id: 'a1',
  perfil: perfil(),
  localId: null,
  encerrada: false,
  origem: { tipo: 'conta' },
  ...dados,
});

describe('prazoDaConfianca', () => {
  it('Prazo de fábrica: sem prazo em nenhum nível, 30 dias, pela organização', () => {
    const prazo = prazoDaConfianca({ conta: null, perfis: [], organizacao: null });
    expect(prazo).toEqual({ dias: 30, origem: { tipo: 'organizacao' } });
    expect(aparelhoNoPrazo({ criadoEm: MARCADO, dias: prazo.dias, agora: depois(29) })).toBe(true);
    expect(aparelhoNoPrazo({ criadoEm: MARCADO, dias: prazo.dias, agora: depois(30.5) })).toBe(
      false,
    );
  });

  it('a organização com o prazo dela', () => {
    expect(prazoDaConfianca({ conta: null, perfis: [], organizacao: 7 })).toEqual({
      dias: 7,
      origem: { tipo: 'organizacao' },
    });
  });

  it('Prazo da conta: o da conta vence o dos perfis e o da organização', () => {
    expect(
      prazoDaConfianca({ conta: 30, perfis: [{ nome: 'Técnico', dias: 0 }], organizacao: 0 }),
    ).toEqual({ dias: 30, origem: { tipo: 'conta' } });
    expect(prazoDaConfianca({ conta: 0, perfis: [], organizacao: 30 })).toEqual({
      dias: 0,
      origem: { tipo: 'conta' },
    });
  });

  it('Perfil que pede sempre: o menor prazo dos perfis vence o da organização', () => {
    expect(
      prazoDaConfianca({
        conta: null,
        perfis: [{ nome: 'Administrador', dias: 0 }],
        organizacao: 30,
      }),
    ).toEqual({ dias: 0, origem: { tipo: 'perfil', nome: 'Administrador' } });
    expect(
      prazoDaConfianca({
        conta: null,
        perfis: [
          { nome: 'Técnico', dias: 14 },
          { nome: 'Plantão', dias: 1 },
          { nome: 'Almoxarifado', dias: 1 },
        ],
        organizacao: 30,
      }),
    ).toEqual({ dias: 1, origem: { tipo: 'perfil', nome: 'Almoxarifado' } });
  });

  it('o perfil vence a organização também quando o prazo dele é maior', () => {
    expect(
      prazoDaConfianca({ conta: null, perfis: [{ nome: 'Técnico', dias: 60 }], organizacao: 30 }),
    ).toEqual({ dias: 60, origem: { tipo: 'perfil', nome: 'Técnico' } });
  });
});

describe('os prazos dos perfis no acesso', () => {
  it('o acesso traz o prazo de cada perfil em vigor que tem um', () => {
    const acesso = resolverAcesso([
      atribuicao({ perfil: perfil({ nome: 'Administrador', diasDeConfianca: 0 }) }),
      atribuicao({ id: 'a2', perfil: perfil({ id: 'sem', nome: 'Leitura' }) }),
    ]);
    expect(acesso.prazosDosPerfis).toEqual([{ nome: 'Administrador', dias: 0 }]);
  });

  it('Perfil inativo: não conta no prazo de quem o tem', () => {
    const acesso = resolverAcesso([
      atribuicao({ perfil: perfil({ nome: 'Plantão', diasDeConfianca: 1, situacao: 'inativo' }) }),
      atribuicao({ id: 'a2', perfil: perfil({ id: 'tec', nome: 'Técnico' }) }),
    ]);
    expect(acesso.prazosDosPerfis).toEqual([]);
    expect(
      prazoDaConfianca({ conta: null, perfis: acesso.prazosDosPerfis, organizacao: 30 }),
    ).toEqual({ dias: 30, origem: { tipo: 'organizacao' } });
  });

  it('o perfil de um grupo conta, e o de um grupo inativo não', () => {
    const peloGrupo = (grupoAtivo: boolean) =>
      atribuicao({
        perfil: perfil({ nome: 'Plantão', diasDeConfianca: 1, permissoes: [] }),
        origem: {
          tipo: 'grupo',
          grupoId: 'g1',
          grupoNome: 'Suporte',
          grupoAtivo,
          participacaoEncerrada: false,
        },
      });
    expect(resolverAcesso([peloGrupo(true)]).prazosDosPerfis).toEqual([
      { nome: 'Plantão', dias: 1 },
    ]);
    expect(resolverAcesso([peloGrupo(false)]).prazosDosPerfis).toEqual([]);
  });
});

describe('aparelhoNoPrazo', () => {
  it('Uso não renova: só a marcação conta, e o aparelho usado ontem vence no 31º dia', () => {
    expect(aparelhoNoPrazo({ criadoEm: MARCADO, dias: 30, agora: depois(31) })).toBe(false);
  });

  it('Prazo reduzido: o prazo do momento vale para o aparelho já marcado', () => {
    expect(aparelhoNoPrazo({ criadoEm: MARCADO, dias: 30, agora: depois(10) })).toBe(true);
    expect(aparelhoNoPrazo({ criadoEm: MARCADO, dias: 7, agora: depois(10) })).toBe(false);
  });

  it('o prazo zero não deixa nenhum aparelho valer', () => {
    expect(aparelhoNoPrazo({ criadoEm: MARCADO, dias: 0, agora: MARCADO })).toBe(false);
  });
});

describe('prazoValido', () => {
  it('aceita os dias inteiros de 0 a 90', () => {
    for (const valor of [0, 1, 30, 90]) expect(prazoValido(valor), String(valor)).toBe(true);
  });

  it('Prazo fora do intervalo: recusa o resto', () => {
    for (const valor of [-1, 91, 120, 1.5, '30', null, undefined, Number.NaN]) {
      expect(prazoValido(valor), String(valor)).toBe(false);
    }
  });
});

describe('o prazo em texto', () => {
  it('os dias, no singular e no plural', () => {
    expect(textoDosDias(1)).toBe('1 dia');
    expect(textoDosDias(30)).toBe('30 dias');
  });

  it('De onde vem o prazo: os dias e quem os define', () => {
    expect(textoDoPrazo({ dias: 30, origem: { tipo: 'organizacao' } })).toBe(
      '30 dias, pela organização',
    );
    expect(textoDoPrazo({ dias: 0, origem: { tipo: 'perfil', nome: 'Administrador' } })).toBe(
      'Em toda entrada, pelo perfil Administrador',
    );
    expect(textoDoPrazo({ dias: 0, origem: { tipo: 'conta' } })).toBe(
      'Em toda entrada, pela conta',
    );
    expect(textoDoPrazo({ dias: 1, origem: { tipo: 'conta' } })).toBe('1 dia, pela conta');
  });
});
