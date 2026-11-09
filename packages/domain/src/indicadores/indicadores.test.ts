// As definições dos indicadores (spec indicadores, "Metas da organização" e "Situação e decisão";
// change p3d-indicadores, design, decisão 2; spec indicadores-da-operacao, "Metas dos indicadores da
// operação" e "Situação e decisão dos indicadores da operação"; change p4f-indicadores-da-operacao,
// design, decisões 4 e 5).
import { describe, expect, it } from 'vitest';
import {
  conferirMeta,
  DEFINICOES_DOS_INDICADORES,
  INDICADORES,
  INDICADORES_DA_OPERACAO,
  INDICADORES_DOS_ALERTAS,
  indicadorDaOperacao,
  indicadorDosAlertas,
  indicadorValido,
} from './indicadores.ts';

describe('as definições dos indicadores', () => {
  it('os dos alertas são quatro, na ordem da tela', () => {
    expect(INDICADORES_DOS_ALERTAS).toEqual(['toner', 'critico', 'disponibilidade', 'que-voltam']);
    expect(
      INDICADORES_DOS_ALERTAS.map((indicador) => DEFINICOES_DOS_INDICADORES[indicador].nome),
    ).toEqual([
      'Tempo de atendimento do toner',
      'Tempo até reconhecer o Crítico',
      'Disponibilidade dos ativos',
      'Alertas que voltam',
    ]);
  });

  it('os da operação são três, na ordem da tela, e os dois grupos são os sete', () => {
    expect(INDICADORES_DA_OPERACAO).toEqual([
      'resolucao-das-os',
      'os-repetidas',
      'paginas-por-toner',
    ]);
    expect(
      INDICADORES_DA_OPERACAO.map((indicador) => DEFINICOES_DOS_INDICADORES[indicador].nome),
    ).toEqual(['Tempo de resolução das OS', 'OS repetidas', 'Páginas por toner']);
    expect(INDICADORES).toEqual([...INDICADORES_DOS_ALERTAS, ...INDICADORES_DA_OPERACAO]);
  });

  it('têm as metas de fábrica da spec, na unidade de cada um', () => {
    expect(
      Object.fromEntries(
        INDICADORES.map((indicador) => {
          const { unidade, metaDeFabrica } = DEFINICOES_DOS_INDICADORES[indicador];
          return [indicador, [unidade, metaDeFabrica]];
        }),
      ),
    ).toEqual({
      toner: ['minutos', 2 * 24 * 60],
      critico: ['minutos', 30],
      disponibilidade: ['por-mil', 990],
      'que-voltam': ['vezes', 3],
      'resolucao-das-os': ['minutos', 3 * 24 * 60],
      'os-repetidas': ['ordens', 2],
      'paginas-por-toner': ['por-mil', 800],
    });
  });

  it('dizem a decisão que cada um pede fora da meta', () => {
    expect(DEFINICOES_DOS_INDICADORES.toner.decisao).toBe(
      'Deixe toner de reserva nos locais que mais esperam, ou suba o limite da regra do toner para o alerta abrir antes.',
    );
    expect(DEFINICOES_DOS_INDICADORES.critico.decisao).toBe(
      'Confira quem pode tratar os alertas e quem recebe o Crítico por e-mail e no celular.',
    );
    expect(DEFINICOES_DOS_INDICADORES.disponibilidade.decisao).toBe(
      'Confira a rede e a energia desses ativos, ou se eles ainda estão em uso.',
    );
    expect(DEFINICOES_DOS_INDICADORES['que-voltam'].decisao).toBe(
      'Verifique o equipamento, ou a duração e a folga da regra, se o alerta não pede ação.',
    );
  });

  it('Resolução fora da meta: os da operação dizem a decisão da spec', () => {
    expect(DEFINICOES_DOS_INDICADORES['resolucao-das-os'].decisao).toBe(
      'Veja onde as OS esperam: deixe no estoque as peças que mais faltam, ou cobre os fornecedores que mais demoram.',
    );
    expect(DEFINICOES_DOS_INDICADORES['os-repetidas'].decisao).toBe(
      'Confira se o conserto resolveu a causa do problema, ou se o ativo deve ser substituído.',
    );
    expect(DEFINICOES_DOS_INDICADORES['paginas-por-toner'].decisao).toBe(
      'Confira a qualidade do consumível e do fornecedor, e a configuração da impressora.',
    );
  });

  it('reconhecem as chaves dos sete, e cada grupo só as dele', () => {
    expect(indicadorValido('toner')).toBe(true);
    expect(indicadorValido('paginas-por-toner')).toBe(true);
    expect(indicadorValido('toner-colorido')).toBe(false);
    expect(indicadorValido(undefined)).toBe(false);
    expect(indicadorDosAlertas('que-voltam')).toBe(true);
    expect(indicadorDosAlertas('os-repetidas')).toBe(false);
    expect(indicadorDaOperacao('os-repetidas')).toBe(true);
    expect(indicadorDaOperacao('toner')).toBe(false);
  });
});

describe('conferirMeta', () => {
  it('aceita a meta inteira dentro dos limites, nos dois extremos', () => {
    expect(conferirMeta('toner', 60)).toEqual({ ok: true, meta: 60 });
    expect(conferirMeta('toner', 30 * 24 * 60)).toEqual({ ok: true, meta: 43_200 });
    expect(conferirMeta('critico', 1)).toEqual({ ok: true, meta: 1 });
    expect(conferirMeta('critico', 24 * 60)).toEqual({ ok: true, meta: 1440 });
    expect(conferirMeta('disponibilidade', 999)).toEqual({ ok: true, meta: 999 });
    expect(conferirMeta('que-voltam', 20)).toEqual({ ok: true, meta: 20 });
    expect(conferirMeta('resolucao-das-os', 60)).toEqual({ ok: true, meta: 60 });
    expect(conferirMeta('resolucao-das-os', 43_200)).toEqual({ ok: true, meta: 43_200 });
    expect(conferirMeta('os-repetidas', 2)).toEqual({ ok: true, meta: 2 });
    expect(conferirMeta('os-repetidas', 10)).toEqual({ ok: true, meta: 10 });
    expect(conferirMeta('paginas-por-toner', 500)).toEqual({ ok: true, meta: 500 });
    expect(conferirMeta('paginas-por-toner', 1000)).toEqual({ ok: true, meta: 1000 });
  });

  it.each([
    ['toner', 59, 'A meta deve ficar entre 1 h e 30 dias.'],
    ['toner', 43_201, 'A meta deve ficar entre 1 h e 30 dias.'],
    ['critico', 0, 'A meta deve ficar entre 1 min e 1 dia.'],
    ['critico', 1441, 'A meta deve ficar entre 1 min e 1 dia.'],
    // Meta fora dos limites: 100% não deixa nenhuma queda.
    ['disponibilidade', 1000, 'A meta deve ficar entre 90% e 99,9%.'],
    ['disponibilidade', 899, 'A meta deve ficar entre 90% e 99,9%.'],
    ['que-voltam', 1, 'A meta deve ficar entre 2 e 20 vezes.'],
    ['que-voltam', 21, 'A meta deve ficar entre 2 e 20 vezes.'],
    ['resolucao-das-os', 59, 'A meta deve ficar entre 1 h e 30 dias.'],
    ['resolucao-das-os', 43_201, 'A meta deve ficar entre 1 h e 30 dias.'],
    ['os-repetidas', 1, 'A meta deve ficar entre 2 e 10 OS.'],
    ['os-repetidas', 11, 'A meta deve ficar entre 2 e 10 OS.'],
    // Meta fora dos limites, da spec: as páginas por toner em 40%.
    ['paginas-por-toner', 400, 'A meta deve ficar entre 50% e 100%.'],
    ['paginas-por-toner', 1001, 'A meta deve ficar entre 50% e 100%.'],
  ] as const)('recusa a meta do %s em %s', (indicador, meta, erro) => {
    expect(conferirMeta(indicador, meta)).toEqual({ ok: false, erro });
  });

  it('recusa o que não é um número inteiro, com a mesma mensagem', () => {
    expect(conferirMeta('disponibilidade', 99.5)).toEqual({
      ok: false,
      erro: 'A meta deve ficar entre 90% e 99,9%.',
    });
    expect(conferirMeta('toner', '2880')).toEqual({
      ok: false,
      erro: 'A meta deve ficar entre 1 h e 30 dias.',
    });
    expect(conferirMeta('que-voltam', null)).toEqual({
      ok: false,
      erro: 'A meta deve ficar entre 2 e 20 vezes.',
    });
    expect(conferirMeta('os-repetidas', 2.5)).toEqual({
      ok: false,
      erro: 'A meta deve ficar entre 2 e 10 OS.',
    });
  });
});
