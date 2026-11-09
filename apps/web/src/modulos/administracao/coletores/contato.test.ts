import { describe, expect, it } from 'vitest';
import { contatoDoColetor } from './contato.ts';

const AGORA = new Date('2026-10-12T12:00:00.000Z');
const antes = (ms: number) => new Date(AGORA.getTime() - ms).toISOString();
const MINUTO = 60_000;

describe('o último contato do coletor', () => {
  it('sem contato, diz que ainda não houve', () => {
    expect(contatoDoColetor({ situacao: 'ativo', ultimoContatoEm: null }, AGORA)).toEqual({
      texto: 'Sem contato ainda',
      situacao: null,
    });
  });

  it('com contato recente, diz a idade', () => {
    expect(contatoDoColetor({ situacao: 'ativo', ultimoContatoEm: antes(30_000) }, AGORA)).toEqual({
      texto: 'Agora',
      situacao: null,
    });
    expect(
      contatoDoColetor({ situacao: 'ativo', ultimoContatoEm: antes(3 * MINUTO) }, AGORA),
    ).toEqual({ texto: 'Há 3 min', situacao: null });
    expect(
      contatoDoColetor({ situacao: 'ativo', ultimoContatoEm: antes(10 * MINUTO) }, AGORA),
    ).toEqual({ texto: 'Há 10 min', situacao: null });
  });

  it('o ativo sem contato há mais de 10 min fica na situação de atenção', () => {
    expect(
      contatoDoColetor({ situacao: 'ativo', ultimoContatoEm: antes(25 * MINUTO) }, AGORA),
    ).toEqual({ texto: 'Sem contato há 25 min', situacao: 'atencao' });
    expect(
      contatoDoColetor({ situacao: 'ativo', ultimoContatoEm: antes(10 * MINUTO + 1) }, AGORA),
    ).toEqual({ texto: 'Sem contato há 10 min', situacao: 'atencao' });
  });

  it('o inativo diz a idade, sem a atenção', () => {
    expect(
      contatoDoColetor(
        { situacao: 'inativo', ultimoContatoEm: antes(3 * 24 * 60 * MINUTO) },
        AGORA,
      ),
    ).toEqual({ texto: 'Há 3 d', situacao: null });
  });
});
