import { describe, expect, it } from 'vitest';
import {
  type ContextoDaEquipeOuCanal,
  conferirEquipeOuCanal,
  LIMITE_DE_EQUIPES_E_CANAIS,
  type PedidoDaEquipeOuCanal,
  recusaDoTeto,
} from './equipes-e-canais.ts';

const GRUPOS: ContextoDaEquipeOuCanal['grupos'] = new Map([
  ['financeiro', { ativo: true }],
  ['ti', { ativo: true }],
  ['antigo', { ativo: false }],
]);

const cadastro: ContextoDaEquipeOuCanal = { grupos: GRUPOS, antes: null };

const equipe = (extra: Partial<PedidoDaEquipeOuCanal> = {}): PedidoDaEquipeOuCanal => ({
  nome: 'Equipe Financeiro',
  tipo: 'equipe',
  grupoId: 'financeiro',
  quemEscreve: 'todos',
  escreveGrupoId: null,
  avisar: false,
  ...extra,
});

const canal = (extra: Partial<PedidoDaEquipeOuCanal> = {}): PedidoDaEquipeOuCanal => ({
  nome: 'Avisos da TI',
  tipo: 'canal',
  grupoId: null,
  quemEscreve: 'grupo',
  escreveGrupoId: 'ti',
  avisar: true,
  ...extra,
});

describe('o cadastro das equipes e dos canais', () => {
  it('Equipe pelo grupo do AD: a equipe com o nome e o grupo, em que todos escrevem', () => {
    expect(conferirEquipeOuCanal(equipe({ nome: '  Equipe   Financeiro ' }), cadastro)).toEqual({
      ok: true,
      conversa: {
        nome: 'Equipe Financeiro',
        nomeNormalizado: 'equipe financeiro',
        tipo: 'equipe',
        grupoId: 'financeiro',
        escreveGrupoId: null,
        avisar: false,
      },
    });
  });

  it('Canal de avisos: o canal sem grupo, em que só o grupo TI escreve, com o aviso', () => {
    expect(conferirEquipeOuCanal(canal({ grupoId: 'financeiro' }), cadastro)).toEqual({
      ok: true,
      conversa: {
        nome: 'Avisos da TI',
        nomeNormalizado: 'avisos da ti',
        tipo: 'canal',
        grupoId: null,
        escreveGrupoId: 'ti',
        avisar: true,
      },
    });
  });

  it('o nome único é sem acento e em minúsculas', () => {
    const conferido = conferirEquipeOuCanal(equipe({ nome: 'Manutenção Elétrica' }), cadastro);
    expect(conferido.ok && conferido.conversa.nomeNormalizado).toBe('manutencao eletrica');
  });

  it('"Todos que participam" esquece o grupo que vinha', () => {
    const conferido = conferirEquipeOuCanal(
      equipe({ quemEscreve: 'todos', escreveGrupoId: 'ti' }),
      cadastro,
    );
    expect(conferido.ok && conferido.conversa.escreveGrupoId).toBeNull();
  });

  it('recusa o nome vazio e o longo, contado em caracteres', () => {
    expect(conferirEquipeOuCanal(equipe({ nome: '  ' }), cadastro)).toEqual({
      ok: false,
      erros: { nome: 'Escreva o nome.' },
    });
    expect(conferirEquipeOuCanal(equipe({ nome: 'é'.repeat(60) }), cadastro).ok).toBe(true);
    expect(conferirEquipeOuCanal(equipe({ nome: 'é'.repeat(61) }), cadastro)).toEqual({
      ok: false,
      erros: { nome: 'Use até 60 caracteres.' },
    });
  });

  it('a equipe sem grupo, com um grupo que não é da organização ou inativo é recusada', () => {
    const recusa = { ok: false, erros: { grupoId: 'Escolha o grupo da equipe.' } };
    expect(conferirEquipeOuCanal(equipe({ grupoId: null }), cadastro)).toEqual(recusa);
    expect(conferirEquipeOuCanal(equipe({ grupoId: 'de-outra' }), cadastro)).toEqual(recusa);
    expect(conferirEquipeOuCanal(equipe({ grupoId: 'antigo' }), cadastro)).toEqual(recusa);
  });

  it('quem escreve: o grupo escolhido precisa existir e estar ativo', () => {
    const recusa = { ok: false, erros: { escreveGrupoId: 'Escolha o grupo que escreve.' } };
    expect(conferirEquipeOuCanal(canal({ escreveGrupoId: null }), cadastro)).toEqual(recusa);
    expect(conferirEquipeOuCanal(canal({ escreveGrupoId: 'de-outra' }), cadastro)).toEqual(recusa);
    expect(conferirEquipeOuCanal(canal({ escreveGrupoId: 'antigo' }), cadastro)).toEqual(recusa);
  });

  it('na alteração, o grupo gravado fica, mesmo inativo; um grupo inativo novo não entra', () => {
    const alteracao: ContextoDaEquipeOuCanal = {
      grupos: GRUPOS,
      antes: { grupoId: 'antigo', escreveGrupoId: 'antigo' },
    };
    expect(
      conferirEquipeOuCanal(
        equipe({
          nome: 'Equipe Antiga',
          grupoId: 'antigo',
          quemEscreve: 'grupo',
          escreveGrupoId: 'antigo',
        }),
        alteracao,
      ).ok,
    ).toBe(true);
    const outro: ContextoDaEquipeOuCanal = {
      grupos: GRUPOS,
      antes: { grupoId: 'financeiro', escreveGrupoId: null },
    };
    expect(conferirEquipeOuCanal(equipe({ grupoId: 'antigo' }), outro)).toEqual({
      ok: false,
      erros: { grupoId: 'Escolha o grupo da equipe.' },
    });
  });

  it('as recusas vêm todas de uma vez, cada uma no campo dela', () => {
    expect(
      conferirEquipeOuCanal(
        equipe({ nome: '', grupoId: null, quemEscreve: 'grupo', escreveGrupoId: null }),
        cadastro,
      ),
    ).toEqual({
      ok: false,
      erros: {
        nome: 'Escreva o nome.',
        grupoId: 'Escolha o grupo da equipe.',
        escreveGrupoId: 'Escolha o grupo que escreve.',
      },
    });
  });
});

describe('o teto de equipes e canais', () => {
  it('a organização com 100 ativos não ganha outro; com 99, ganha', () => {
    expect(LIMITE_DE_EQUIPES_E_CANAIS).toBe(100);
    expect(recusaDoTeto(99)).toBeNull();
    expect(recusaDoTeto(100)).toBe('A organização já tem 100 equipes e canais.');
  });
});
