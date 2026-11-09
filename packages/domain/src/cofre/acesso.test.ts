import { describe, expect, it } from 'vitest';
import { alcancaOSegredo, DURACAO_DA_LIBERACAO_DO_COFRE } from './acesso.ts';

const BRUNO = { contaId: 'bruno', grupos: ['suporte'], perfis: ['tecnico'] };

describe('alcancaOSegredo', () => {
  it('pela conta, por um grupo dela ou por um perfil dela', () => {
    expect(alcancaOSegredo([{ tipo: 'conta', id: 'bruno' }], BRUNO)).toBe(true);
    expect(alcancaOSegredo([{ tipo: 'grupo', id: 'suporte' }], BRUNO)).toBe(true);
    expect(alcancaOSegredo([{ tipo: 'perfil', id: 'tecnico' }], BRUNO)).toBe(true);
  });

  it('não pelo acesso de outra conta, de outro grupo ou de outro perfil', () => {
    expect(
      alcancaOSegredo(
        [
          { tipo: 'conta', id: 'carla' },
          { tipo: 'grupo', id: 'redes' },
          { tipo: 'perfil', id: 'administrador' },
        ],
        BRUNO,
      ),
    ).toBe(false);
    expect(alcancaOSegredo([], BRUNO)).toBe(false);
  });

  it('o id de um grupo não vale como o de um perfil', () => {
    expect(alcancaOSegredo([{ tipo: 'perfil', id: 'suporte' }], BRUNO)).toBe(false);
  });
});

describe('a liberação do cofre', () => {
  it('dura 5 minutos', () => {
    expect(DURACAO_DA_LIBERACAO_DO_COFRE).toBe(5 * 60_000);
  });
});
