import type { Permissao } from '@grafite/domain';
import { describe, expect, it } from 'vitest';
import { ativos } from '../ativos/modulo.ts';
import { REGISTRO } from '../registro.ts';
import { registroDaConta } from '../registroDaConta.ts';
import { gestao } from './modulo.ts';

const daConta = (...chaves: Permissao[]) =>
  registroDaConta([gestao], (chave) => chaves.includes(chave));

const CATALOGO = {
  rotulo: 'Catálogo',
  permissoes: ['catalogo.administrar', 'modelos.editar'],
  filhos: [
    { rotulo: 'Tipos', destino: '/gestao/catalogo/tipos' },
    { rotulo: 'Campos', destino: '/gestao/catalogo/campos' },
    { rotulo: 'Modelos', destino: '/gestao/catalogo/modelos' },
  ],
};
const IMPORTACOES = {
  rotulo: 'Importações',
  destino: '/gestao/importacoes',
  permissoes: ['ativos.editar'],
};
const SOFTWARE = {
  rotulo: 'Software',
  destino: '/gestao/software',
  permissoes: ['software.distribuir'],
};
const CONTROL_ID = {
  rotulo: 'Control iD',
  permissoes: ['controlid.ver'],
  filhos: [
    { rotulo: 'Backups', destino: '/gestao/control-id/backups' },
    { rotulo: 'Comparar backups', destino: '/gestao/control-id/comparar' },
  ],
};

// A Gestão de ativos no dock (spec modulo-gestao-de-ativos, "Gestão de ativos no dock").
describe('a Gestão de ativos no registro', () => {
  it('fica logo depois do Ativos, faz parte dele e, no celular, fica em "Mais"', () => {
    const ids = REGISTRO.map((modulo) => modulo.id);
    expect(ids.indexOf('gestao')).toBe(ids.indexOf('ativos') + 1);
    expect(gestao).toMatchObject({
      nome: 'Gestão de ativos',
      endereco: '/gestao',
      parteDe: 'ativos',
      prioridadeNoCelular: 'mais',
    });
  });

  it('Conta só com a lista dos ativos: a Gestão de ativos não aparece', () => {
    expect(daConta('ativos.ver')).toEqual([]);
  });

  it('Só os modelos: o menu mostra só o Catálogo, com Tipos, Campos e Modelos', () => {
    expect(daConta('modelos.editar')[0]?.menu).toEqual([CATALOGO]);
  });

  it('Quem edita ativos: o menu mostra só Importações', () => {
    expect(daConta('ativos.ver', 'ativos.editar')[0]?.menu).toEqual([IMPORTACOES]);
  });

  it('Técnico do Control iD: o menu mostra só o Control iD, com Backups e Comparar backups', () => {
    expect(daConta('controlid.ver')[0]?.menu).toEqual([CONTROL_ID]);
  });

  it('o tipo e o modelo cadastrados numa aba vêm da Gestão, cada um com a permissão dele', () => {
    expect(
      gestao.cadastros?.map(({ alvo, link, permissoes }) => ({ alvo, link, permissoes })),
    ).toEqual([
      { alvo: 'tipo', link: 'Cadastrar novo tipo', permissoes: ['catalogo.administrar'] },
      { alvo: 'modelo', link: 'Cadastrar novo modelo', permissoes: ['modelos.editar'] },
    ]);
    expect(ativos.cadastros).toBeUndefined();
  });

  it('importacoes.mudaram atualiza a lista e as telas das importações', () => {
    const evento = {
      id: '0199a6e0-0000-7000-8000-000000000005',
      tipo: 'importacoes.mudaram' as const,
      momento: '2026-10-12T12:00:00.000Z',
      alvo: { tipo: 'importacao', id: 'i1' },
    };
    expect(gestao.eventos?.['importacoes.mudaram']?.(evento)).toEqual([['importacoes']]);
    expect(ativos.eventos?.['importacoes.mudaram']).toBeUndefined();
  });

  it('com todas as permissões, o menu segue a ordem: Catálogo, Importações, Software e Control iD', () => {
    const todas = daConta(
      'catalogo.administrar',
      'ativos.editar',
      'software.distribuir',
      'controlid.ver',
    );
    expect(todas[0]?.menu).toEqual([CATALOGO, IMPORTACOES, SOFTWARE, CONTROL_ID]);
  });
});
