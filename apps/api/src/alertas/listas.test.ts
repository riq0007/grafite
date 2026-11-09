// O banco confere a condição, a severidade e o escopo da regra e do alerta com listas próprias,
// porque o @grafite/db não depende do domínio. Elas têm de ser as mesmas do domínio (design do P3a,
// decisão 3), como a lista dos indicadores (design do P3d, decisão 3).
import {
  CONDICOES_DE_ALERTA_NO_BANCO,
  ESCOPOS_DA_REGRA_NO_BANCO,
  INDICADORES_NO_BANCO,
  SEVERIDADES_NO_BANCO,
} from '@grafite/db';
import {
  CONDICOES_DE_ALERTA,
  INDICADORES,
  SEVERIDADES_DO_ALERTA,
  TIPOS_DE_ESCOPO,
} from '@grafite/domain';
import { expect, it } from 'vitest';

it('o banco aceita as mesmas condições, severidades e escopos do domínio', () => {
  expect([...CONDICOES_DE_ALERTA_NO_BANCO]).toEqual(
    CONDICOES_DE_ALERTA.map((condicao) => condicao.chave),
  );
  expect([...SEVERIDADES_NO_BANCO]).toEqual([...SEVERIDADES_DO_ALERTA]);
  expect([...ESCOPOS_DA_REGRA_NO_BANCO]).toEqual([...TIPOS_DE_ESCOPO]);
});

// Os dos alertas e os da operação, que a migration 0040 acrescentou (change
// p4f-indicadores-da-operacao).
it('o banco aceita os mesmos indicadores do domínio', () => {
  expect([...INDICADORES_NO_BANCO]).toEqual([...INDICADORES]);
});
