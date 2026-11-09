// O efeito de incluir a conta num grupo ou de retirá-la dele, em texto, antes de confirmar (spec
// administracao-de-pessoas, "Acesso de uma conta"; design do escolhas-a-vista, decisão 5).
import { describe, expect, it } from 'vitest';
import { efeitoDeIncluir, efeitoDeRetirar } from './efeitoDoGrupo.ts';

const JUNDIAI = { id: 'jundiai', caminho: 'Jundiaí' };
const ALMOXARIFADO = { id: 'almox', caminho: 'Jundiaí › Almoxarifado' };
const OPERADOR = { id: 'operador', nome: 'Operador' };
const TECNICO = { id: 'tecnico', nome: 'Técnico' };
const LEITOR = { id: 'leitor', nome: 'Leitor' };

const ALMOX = {
  id: 'g-almox',
  nome: 'Almoxarifado',
  perfisEmVigor: [
    { perfil: OPERADOR, local: ALMOXARIFADO },
    { perfil: TECNICO, local: JUNDIAI },
  ],
};
const SUPORTE = {
  id: 'g-suporte',
  nome: 'Suporte',
  perfisEmVigor: [{ perfil: LEITOR, local: null }],
};

/** O Técnico em Jundiaí direto e o Leitor na organização pelo Suporte. */
const ATRIBUICOES = [
  { perfil: TECNICO, local: JUNDIAI, grupo: null },
  { perfil: LEITOR, local: null, grupo: { id: 'g-suporte', nome: 'Suporte' } },
];

describe('efeito de incluir num grupo', () => {
  it('diz o que a conta passa a ter e o que ela já tem por outro caminho', () => {
    expect(efeitoDeIncluir('Bruno', ALMOX, ATRIBUICOES)).toEqual([
      'Bruno passa a ter Operador em Jundiaí › Almoxarifado.',
      'Bruno já tem Técnico em Jundiaí, atribuído direto à conta.',
    ]);
  });

  it('o perfil na organização inteira, e o que vem por outro grupo', () => {
    const outro = {
      id: 'g-outro',
      nome: 'Outro',
      perfisEmVigor: [{ perfil: LEITOR, local: null }],
    };
    expect(efeitoDeIncluir('Bruno', outro, ATRIBUICOES)).toEqual([
      'Bruno já tem Leitor na organização inteira, pelo grupo Suporte.',
    ]);
    expect(efeitoDeIncluir('Bruno', outro, [])).toEqual([
      'Bruno passa a ter Leitor na organização inteira.',
    ]);
  });

  it('o grupo sem perfis não muda nada', () => {
    expect(efeitoDeIncluir('Bruno', { id: 'g', nome: 'Vazio', perfisEmVigor: [] }, [])).toEqual([
      'O grupo Vazio não dá nenhum perfil: o acesso de Bruno não muda.',
    ]);
  });
});

describe('efeito de retirar do grupo', () => {
  it('diz o que a conta deixa de ter, e não conta o que vem do próprio grupo como outro caminho', () => {
    expect(efeitoDeRetirar('Bruno', SUPORTE, ATRIBUICOES)).toEqual([
      'Bruno deixa de ter Leitor na organização inteira.',
    ]);
  });

  it('diz o que a conta continua tendo por outro caminho', () => {
    const atribuicoes = [
      ...ATRIBUICOES,
      { perfil: OPERADOR, local: ALMOXARIFADO, grupo: { id: 'g-almox', nome: 'Almoxarifado' } },
      { perfil: TECNICO, local: JUNDIAI, grupo: { id: 'g-almox', nome: 'Almoxarifado' } },
    ];
    expect(efeitoDeRetirar('Bruno', ALMOX, atribuicoes)).toEqual([
      'Bruno deixa de ter Operador em Jundiaí › Almoxarifado.',
      'Bruno continua com Técnico em Jundiaí, atribuído direto à conta.',
    ]);
  });

  it('o grupo sem perfis não muda nada', () => {
    expect(efeitoDeRetirar('Bruno', { id: 'g', nome: 'Vazio', perfisEmVigor: [] }, [])).toEqual([
      'O grupo Vazio não dá nenhum perfil: o acesso de Bruno não muda.',
    ]);
  });
});
