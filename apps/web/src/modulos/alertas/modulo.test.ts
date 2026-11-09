// O módulo Alertas no registro (spec modulo-alertas, "Alertas no dock"; change
// p3a-regras-e-alertas, design, decisão 11): depois do Ativos e antes do Cofre, na barra de abas do
// celular, para quem vê os alertas, com o menu, a ação da busca e as consultas que o evento relê.
import type { Permissao } from '@grafite/domain';
import { describe, expect, it } from 'vitest';
import { entradasDoRegistro } from '../../busca/fontes.ts';
import { REGISTRO } from '../registro.ts';
import { itensPermitidos, registroDaConta } from '../registroDaConta.ts';
import {
  CHAVE_DA_REGRA,
  CHAVE_DAS_REGRAS,
  CHAVE_DO_SILENCIO,
  CHAVE_DOS_ALERTAS,
  CHAVE_DOS_INDICADORES,
} from './consultas.ts';
import { alertas } from './modulo.ts';

const com =
  (...permissoes: Permissao[]) =>
  (chave: Permissao) =>
    permissoes.includes(chave);

describe('o módulo Alertas no registro', () => {
  it('fica depois do Ativos e antes do Cofre, e no celular depois do Ativos', () => {
    const ids = REGISTRO.map((modulo) => modulo.id);
    // Entre o Ativos e o Alertas fica a Gestão de ativos (spec modulo-gestao-de-ativos).
    expect(ids.indexOf('gestao')).toBe(ids.indexOf('ativos') + 1);
    expect(ids.indexOf('alertas')).toBe(ids.indexOf('gestao') + 1);
    // Entre o Alertas e o Cofre fica a Operação (spec modulo-operacao).
    expect(ids.indexOf('operacao')).toBe(ids.indexOf('alertas') + 1);
    expect(ids.indexOf('cofre')).toBeGreaterThan(ids.indexOf('alertas'));
    expect(alertas).toMatchObject({
      nome: 'Alertas',
      endereco: '/alertas',
      prioridadeNoCelular: 3,
    });
    const ativos = REGISTRO.find((modulo) => modulo.id === 'ativos');
    expect(ativos?.prioridadeNoCelular).toBe(2);
  });

  it('aparece para quem vê, trata ou administra os alertas, e some com o módulo desligado', () => {
    const comAlertas = (pode: (chave: Permissao) => boolean, desligados: string[] = []) =>
      registroDaConta(REGISTRO, pode, desligados).some((modulo) => modulo.id === 'alertas');
    expect(comAlertas(com('alertas.ver'))).toBe(true);
    expect(comAlertas(com('alertas.tratar'))).toBe(true);
    expect(comAlertas(com('alertas.administrar'))).toBe(true);
    expect(comAlertas(com('ativos.ver'))).toBe(false);
    expect(comAlertas(com('alertas.ver'), ['alertas'])).toBe(false);
  });

  it('o menu tem Abertos, Resolvidos e Indicadores, e Regras só para quem administra', () => {
    const rotulos = (pode: (chave: Permissao) => boolean) =>
      itensPermitidos(alertas.menu ?? [], pode).map((item) => item.rotulo);
    // Quem só vê: o menu mostra "Abertos", "Resolvidos" e "Indicadores", sem "Regras".
    expect(rotulos(com('alertas.ver'))).toEqual(['Abertos', 'Resolvidos', 'Indicadores']);
    expect(rotulos(com('alertas.administrar'))).toEqual([
      'Abertos',
      'Resolvidos',
      'Indicadores',
      'Regras',
    ]);
  });

  it('Indicadores pela busca: a busca oferece "Indicadores", no caminho "Alertas"', () => {
    expect(entradasDoRegistro([alertas])).toContainEqual(
      expect.objectContaining({
        rotulo: 'Indicadores',
        grupo: 'ir-para',
        caminho: 'Alertas',
        destino: '/alertas/indicadores',
      }),
    );
  });

  it('a busca oferece "Nova regra de alerta" a quem administra', () => {
    expect(alertas.busca?.entradas).toEqual([
      expect.objectContaining({
        rotulo: 'Nova regra de alerta',
        grupo: 'acoes',
        destino: '/alertas/regras/nova',
        permissoes: ['alertas.administrar'],
      }),
    ]);
  });

  it('o evento dos alertas relê as listas, as regras e o silêncio dos ativos', () => {
    const relidas = alertas.eventos?.['alertas.mudaram']?.({
      id: 'e1',
      tipo: 'alertas.mudaram',
      momento: '2026-10-14T10:00:00.000Z',
      alvo: null,
    });
    expect(relidas).toEqual([
      CHAVE_DOS_ALERTAS,
      CHAVE_DAS_REGRAS,
      CHAVE_DA_REGRA,
      CHAVE_DO_SILENCIO,
    ]);
  });

  it('Meta de um indicador mudada: o evento das metas relê os indicadores', () => {
    const relidas = alertas.eventos?.['metas.mudaram']?.({
      id: 'e2',
      tipo: 'metas.mudaram',
      momento: '2026-10-22T10:00:00.000Z',
      alvo: { tipo: 'indicador', id: 'i1' },
    });
    expect(relidas).toEqual([CHAVE_DOS_INDICADORES]);
  });
});
