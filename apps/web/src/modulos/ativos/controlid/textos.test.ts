// O resultado de cada categoria da comparação e da restauração em texto (spec
// comparacao-e-restauracao-do-control-id): com exatamente um, o singular; com zero ou mais de um, o
// plural, como se fala.
import { describe, expect, it } from 'vitest';
import { textoDaCategoria } from './textos.ts';

describe('textoDaCategoria', () => {
  it('na comparação, o singular com um e o plural com zero ou mais', () => {
    expect(
      textoDaCategoria('comparacao', {
        rotulo: 'Biometria',
        iguais: 1,
        soNoBackup: 0,
        soNoControle: 1,
        divergentes: 1,
      }),
    ).toBe('Biometria: 1 igual, 0 só no backup, 1 só no controle, 1 divergente');
    expect(textoDaCategoria('comparacao', { rotulo: 'Usuários', iguais: 3, divergentes: 0 })).toBe(
      'Usuários: 3 iguais, 0 só no backup, 0 só no controle, 0 divergentes',
    );
  });

  it('na restauração, o criado e o que já existia no singular com um', () => {
    expect(
      textoDaCategoria('restauracao', { rotulo: 'Usuários', criados: 1, ignorados: 1, erros: 1 }),
    ).toBe('Usuários: 1 criado, 1 já existia, 1 com erro');
    expect(textoDaCategoria('restauracao', { rotulo: 'Cartões', criados: 2, ignorados: 0 })).toBe(
      'Cartões: 2 criados, 0 já existiam',
    );
  });

  it('a categoria não escolhida e o erro da categoria', () => {
    expect(textoDaCategoria('restauracao', { rotulo: 'Horários', situacao: 'pulado' })).toBe(
      'Horários: não escolhida',
    );
    expect(
      textoDaCategoria('comparacao', {
        rotulo: 'Grupos',
        iguais: 2,
        erro: 'O controle não respondeu.',
      }),
    ).toBe(
      'Grupos: 2 iguais, 0 só no backup, 0 só no controle, 0 divergentes (O controle não respondeu.)',
    );
  });
});
