// A meta no formulário (spec indicadores, "Metas da organização"; change p3d-indicadores, design,
// decisão 2; spec indicadores-da-operacao, "Metas dos indicadores da operação"; change
// p4f-indicadores-da-operacao, design, decisão 10): o número e a unidade que a pessoa vê, convertidos
// para a unidade do indicador e conferidos pelo domínio antes de mandar.
import { describe, expect, it } from 'vitest';
import { conferirRascunhoDaMeta, rascunhoDaMeta, UNIDADES_DOS_TEMPOS } from './metas.ts';

describe('rascunhoDaMeta', () => {
  it('abre os tempos na maior unidade que escreve a meta sem fração', () => {
    expect(rascunhoDaMeta('toner', 2880)).toEqual({ numero: '2', unidade: 'dias' });
    expect(rascunhoDaMeta('toner', 1500)).toEqual({ numero: '25', unidade: 'horas' });
    expect(rascunhoDaMeta('toner', 90)).toEqual({ numero: '1,5', unidade: 'horas' });
    expect(rascunhoDaMeta('critico', 30)).toEqual({ numero: '30', unidade: 'minutos' });
    expect(rascunhoDaMeta('critico', 120)).toEqual({ numero: '2', unidade: 'horas' });
  });

  it('abre a disponibilidade em porcentagem e os alertas que voltam em vezes', () => {
    expect(rascunhoDaMeta('disponibilidade', 995)).toEqual({ numero: '99,5', unidade: null });
    expect(rascunhoDaMeta('disponibilidade', 990)).toEqual({ numero: '99', unidade: null });
    expect(rascunhoDaMeta('que-voltam', 3)).toEqual({ numero: '3', unidade: null });
  });

  it('abre os indicadores da operação: a resolução em dias ou horas, as páginas em porcentagem e as repetidas em OS', () => {
    expect(rascunhoDaMeta('resolucao-das-os', 4320)).toEqual({ numero: '3', unidade: 'dias' });
    expect(rascunhoDaMeta('resolucao-das-os', 180)).toEqual({ numero: '3', unidade: 'horas' });
    expect(rascunhoDaMeta('paginas-por-toner', 800)).toEqual({ numero: '80', unidade: null });
    expect(rascunhoDaMeta('paginas-por-toner', 825)).toEqual({ numero: '82,5', unidade: null });
    expect(rascunhoDaMeta('os-repetidas', 2)).toEqual({ numero: '2', unidade: null });
  });

  it('oferece as unidades de cada tempo', () => {
    expect(UNIDADES_DOS_TEMPOS.toner.map(({ id }) => id)).toEqual(['horas', 'dias']);
    expect(UNIDADES_DOS_TEMPOS.critico.map(({ id }) => id)).toEqual(['minutos', 'horas']);
    expect(UNIDADES_DOS_TEMPOS['resolucao-das-os'].map(({ id }) => id)).toEqual(['horas', 'dias']);
  });
});

describe('conferirRascunhoDaMeta', () => {
  it('converte para a unidade do indicador e confere pelo domínio', () => {
    expect(conferirRascunhoDaMeta('toner', { numero: '1', unidade: 'dias' })).toEqual({
      ok: true,
      meta: 1440,
    });
    expect(conferirRascunhoDaMeta('toner', { numero: '36', unidade: 'horas' })).toEqual({
      ok: true,
      meta: 2160,
    });
    expect(conferirRascunhoDaMeta('critico', { numero: '1,5', unidade: 'horas' })).toEqual({
      ok: true,
      meta: 90,
    });
    expect(conferirRascunhoDaMeta('disponibilidade', { numero: '99,5', unidade: null })).toEqual({
      ok: true,
      meta: 995,
    });
    expect(conferirRascunhoDaMeta('que-voltam', { numero: '4', unidade: null })).toEqual({
      ok: true,
      meta: 4,
    });
    expect(conferirRascunhoDaMeta('resolucao-das-os', { numero: '36', unidade: 'horas' })).toEqual({
      ok: true,
      meta: 2160,
    });
    expect(conferirRascunhoDaMeta('paginas-por-toner', { numero: '82,5', unidade: null })).toEqual({
      ok: true,
      meta: 825,
    });
    expect(conferirRascunhoDaMeta('os-repetidas', { numero: '3', unidade: null })).toEqual({
      ok: true,
      meta: 3,
    });
  });

  it('Meta fora dos limites: devolve a mensagem do domínio', () => {
    expect(conferirRascunhoDaMeta('disponibilidade', { numero: '100', unidade: null })).toEqual({
      ok: false,
      erro: 'A meta deve ficar entre 90% e 99,9%.',
    });
    expect(conferirRascunhoDaMeta('toner', { numero: '31', unidade: 'dias' })).toEqual({
      ok: false,
      erro: 'A meta deve ficar entre 1 h e 30 dias.',
    });
    expect(conferirRascunhoDaMeta('paginas-por-toner', { numero: '40', unidade: null })).toEqual({
      ok: false,
      erro: 'A meta deve ficar entre 50% e 100%.',
    });
    expect(conferirRascunhoDaMeta('os-repetidas', { numero: '11', unidade: null })).toEqual({
      ok: false,
      erro: 'A meta deve ficar entre 2 e 10 OS.',
    });
    expect(conferirRascunhoDaMeta('resolucao-das-os', { numero: '31', unidade: 'dias' })).toEqual({
      ok: false,
      erro: 'A meta deve ficar entre 1 h e 30 dias.',
    });
  });

  it('recusa o que não é número e a fração que a unidade não aceita', () => {
    expect(conferirRascunhoDaMeta('que-voltam', { numero: 'três', unidade: null })).toEqual({
      ok: false,
      erro: 'A meta deve ficar entre 2 e 20 vezes.',
    });
    expect(conferirRascunhoDaMeta('que-voltam', { numero: '2,5', unidade: null })).toEqual({
      ok: false,
      erro: 'A meta deve ficar entre 2 e 20 vezes.',
    });
    expect(conferirRascunhoDaMeta('disponibilidade', { numero: '99,55', unidade: null })).toEqual({
      ok: false,
      erro: 'A meta deve ficar entre 90% e 99,9%.',
    });
    expect(conferirRascunhoDaMeta('critico', { numero: '', unidade: 'minutos' })).toEqual({
      ok: false,
      erro: 'A meta deve ficar entre 1 min e 1 dia.',
    });
  });
});
