// O banco confere o tipo, a classificação e a situação do segredo com listas próprias, porque o
// @grafite/db não depende do domínio. Elas têm de ser as mesmas do domínio (design do P6).
import { CLASSIFICACOES_DE_SEGREDO_NO_BANCO, TIPOS_DE_SEGREDO_NO_BANCO } from '@grafite/db';
import { CLASSIFICACOES_DE_SEGREDO, TIPOS_DE_SEGREDO } from '@grafite/domain';
import { expect, it } from 'vitest';

it('o banco aceita os mesmos tipos e classificações de segredo do domínio', () => {
  expect([...TIPOS_DE_SEGREDO_NO_BANCO]).toEqual(TIPOS_DE_SEGREDO.map((tipo) => tipo.id));
  expect([...CLASSIFICACOES_DE_SEGREDO_NO_BANCO]).toEqual(
    CLASSIFICACOES_DE_SEGREDO.map((classificacao) => classificacao.id),
  );
});
