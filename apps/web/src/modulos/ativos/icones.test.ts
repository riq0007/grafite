// O banco e o domínio aceitam as chaves de ICONES_DE_TIPO, e a UI desenha cada uma: uma chave nova
// no domínio sem o desenho dela reprova aqui (design do P1a, riscos).
import { ICONES_DE_TIPO } from '@grafite/domain';
import { iconesDeAtivo } from '@grafite/ui';
import { expect, it } from 'vitest';

it('cada ícone de tipo do domínio tem o desenho próprio na UI', () => {
  expect(Object.keys(iconesDeAtivo).sort()).toEqual([...ICONES_DE_TIPO].sort());
});
