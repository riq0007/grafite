// O banco confere a severidade da notificação com a lista dele, porque o @grafite/db não depende do
// domínio. Ela tem de ser a mesma do domínio (design do P3b, decisão 2).
import { SEVERIDADES_NO_BANCO } from '@grafite/db';
import { SEVERIDADES_DA_NOTIFICACAO } from '@grafite/domain';
import { expect, it } from 'vitest';

it('o banco aceita as mesmas severidades de notificação do domínio', () => {
  expect([...SEVERIDADES_NO_BANCO]).toEqual([...SEVERIDADES_DA_NOTIFICACAO]);
});
