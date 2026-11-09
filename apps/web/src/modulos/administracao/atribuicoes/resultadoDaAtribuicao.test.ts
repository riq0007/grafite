// O "Resultado" da atribuição de um perfil, antes de confirmar (spec modulo-administracao,
// "Atribuição de perfil pela tela"; design do escolhas-a-vista, decisão 6).
import { describe, expect, it } from 'vitest';
import { resultadoDaAtribuicao } from './resultadoDaAtribuicao.ts';

const TECNICO = {
  id: 'tecnico',
  nome: 'Técnico',
  permissoes: ['pessoas.ver', 'auditoria.ver', 'locais.editar'],
  todasAsPermissoes: false,
} as const;
const LEITOR = {
  id: 'leitor',
  nome: 'Leitor',
  permissoes: ['pessoas.ver'],
  todasAsPermissoes: false,
} as const;
const JUNDIAI = { id: 'jundiai', caminho: 'Jundiaí' };

const comum = { quem: 'Bruno', emVigor: [] };

describe('resultado da atribuição', () => {
  it('sem perfil, pede o perfil', () => {
    expect(
      resultadoDaAtribuicao({ ...comum, perfil: undefined, escopo: 'organizacao', local: null }),
    ).toEqual({ frases: ['Escolha o perfil.'], impedimento: null });
  });

  it('na organização inteira, diz o perfil que a conta passa a ter', () => {
    expect(
      resultadoDaAtribuicao({ ...comum, perfil: LEITOR, escopo: 'organizacao', local: null }),
    ).toEqual({ frases: ['Bruno passa a ter Leitor na organização inteira.'], impedimento: null });
  });

  it('num local, diz o local e as permissões que só valem na organização inteira', () => {
    expect(
      resultadoDaAtribuicao({ ...comum, perfil: TECNICO, escopo: 'local', local: JUNDIAI }),
    ).toEqual({
      frases: [
        'Bruno passa a ter Técnico em Jundiaí e no que está dentro.',
        'Estas permissões do Técnico não valem num local: Consultar a auditoria.',
      ],
      impedimento: null,
    });
  });

  it('num local ainda sem o local, pede o local', () => {
    expect(
      resultadoDaAtribuicao({ ...comum, perfil: LEITOR, escopo: 'local', local: null }),
    ).toEqual({ frases: ['Escolha o local.'], impedimento: null });
  });

  it('a mesma atribuição já em vigor impede atribuir, com o motivo', () => {
    const emVigor = [
      { perfil: { id: 'tecnico' }, local: { id: 'jundiai' } },
      { perfil: { id: 'leitor' }, local: null },
    ];
    expect(
      resultadoDaAtribuicao({
        quem: 'Bruno',
        emVigor,
        perfil: TECNICO,
        escopo: 'local',
        local: JUNDIAI,
      }),
    ).toEqual({
      frases: ['Bruno já tem Técnico em Jundiaí.'],
      impedimento: 'Bruno já tem Técnico em Jundiaí.',
    });
    expect(
      resultadoDaAtribuicao({
        quem: 'Bruno',
        emVigor,
        perfil: LEITOR,
        escopo: 'organizacao',
        local: null,
      }),
    ).toEqual({
      frases: ['Bruno já tem Leitor na organização inteira.'],
      impedimento: 'Bruno já tem Leitor na organização inteira.',
    });
    // O mesmo perfil noutro escopo é outra atribuição.
    expect(
      resultadoDaAtribuicao({
        quem: 'Bruno',
        emVigor,
        perfil: TECNICO,
        escopo: 'organizacao',
        local: null,
      }).impedimento,
    ).toBeNull();
  });
});
