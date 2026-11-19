import { describe, expect, it } from 'vitest';
import { conferirAvaliacao, NIVEIS_DA_AVALIACAO } from './avaliacao.ts';

describe('a avaliação do atendimento', () => {
  it('aceita os quatro níveis, sem o comentário', () => {
    for (const nivel of NIVEIS_DA_AVALIACAO) {
      expect(conferirAvaliacao({ nivel, comentario: null })).toEqual({
        ok: true,
        nivel,
        comentario: null,
      });
    }
  });

  it('pede um dos quatro níveis, com o texto do banco', () => {
    for (const nivel of [null, '', 'excelente', 'Ótimo', 'otimo ']) {
      expect(conferirAvaliacao({ nivel, comentario: null })).toEqual({
        ok: false,
        motivo: 'sem-nivel',
      });
    }
  });

  it('o comentário perde os espaços das pontas, e o vazio fica sem comentário', () => {
    expect(conferirAvaliacao({ nivel: 'bom', comentario: '  Rápido e certeiro.\n' })).toEqual({
      ok: true,
      nivel: 'bom',
      comentario: 'Rápido e certeiro.',
    });
    expect(conferirAvaliacao({ nivel: 'bom', comentario: ' \n ' })).toEqual({
      ok: true,
      nivel: 'bom',
      comentario: null,
    });
  });

  it('o comentário vai até 500 caracteres, contados em caracteres', () => {
    expect(conferirAvaliacao({ nivel: 'ruim', comentario: '👍'.repeat(500) })).toMatchObject({
      ok: true,
    });
    expect(conferirAvaliacao({ nivel: 'ruim', comentario: 'a'.repeat(501) })).toEqual({
      ok: false,
      motivo: 'comentario-longo',
    });
  });

  it('sem o nível, a recusa do nível vem antes da do comentário', () => {
    expect(conferirAvaliacao({ nivel: null, comentario: 'a'.repeat(501) })).toEqual({
      ok: false,
      motivo: 'sem-nivel',
    });
  });
});
