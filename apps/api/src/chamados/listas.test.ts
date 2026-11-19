// O banco confere os ícones, as situações e as solicitações do tipo de chamado, as unidades e os
// modos do prazo, o "Se não houver ninguém", os dias do horário da TI, as situações e as origens do
// chamado e as espécies da conversa com listas próprias, porque o @grafite/db não depende do
// domínio. Elas têm de ser as mesmas do domínio (change chamados-da-ti, design, decisão 1), como
// as dos alertas.
import {
  DIAS_DA_SEMANA_NO_BANCO,
  ESPECIES_DA_CONVERSA_NO_BANCO,
  ICONES_DO_TIPO_DE_CHAMADO_NO_BANCO,
  MODOS_DO_PRAZO_NO_BANCO,
  ORIGENS_DO_CHAMADO_NO_BANCO,
  SEM_NINGUEM_NO_BANCO,
  SITUACOES_DO_CHAMADO_NO_BANCO,
  SITUACOES_DO_TIPO_DE_CHAMADO_NO_BANCO,
  SOLICITACOES_DO_TIPO_DE_CHAMADO_NO_BANCO,
  UNIDADES_DO_PRAZO_NO_BANCO,
} from '@grafite/db';
import {
  DIAS_DA_SEMANA_DO_HORARIO,
  ESPECIES_DA_CONVERSA,
  ICONES_DO_TIPO_DE_CHAMADO,
  MODOS_DO_PRAZO,
  ORIGENS_DO_CHAMADO,
  SEM_NINGUEM,
  SITUACOES_DO_CHAMADO,
  SITUACOES_DO_TIPO_DE_CHAMADO,
  SOLICITACOES_DO_TIPO_DE_CHAMADO,
  UNIDADES_DO_PRAZO,
} from '@grafite/domain';
import { expect, it } from 'vitest';

it('o banco aceita os mesmos ícones, situações e solicitações do tipo de chamado do domínio', () => {
  expect([...ICONES_DO_TIPO_DE_CHAMADO_NO_BANCO]).toEqual([...ICONES_DO_TIPO_DE_CHAMADO]);
  expect([...SITUACOES_DO_TIPO_DE_CHAMADO_NO_BANCO]).toEqual([...SITUACOES_DO_TIPO_DE_CHAMADO]);
  expect([...SOLICITACOES_DO_TIPO_DE_CHAMADO_NO_BANCO]).toEqual([
    ...SOLICITACOES_DO_TIPO_DE_CHAMADO,
  ]);
});

it('o banco aceita as mesmas unidades e modos do prazo e o mesmo "Se não houver ninguém"', () => {
  expect([...UNIDADES_DO_PRAZO_NO_BANCO]).toEqual([...UNIDADES_DO_PRAZO]);
  expect([...MODOS_DO_PRAZO_NO_BANCO]).toEqual([...MODOS_DO_PRAZO]);
  expect([...SEM_NINGUEM_NO_BANCO]).toEqual([...SEM_NINGUEM]);
});

it('o banco aceita os mesmos dias do horário da TI', () => {
  expect([...DIAS_DA_SEMANA_NO_BANCO]).toEqual([...DIAS_DA_SEMANA_DO_HORARIO]);
});

it('o banco aceita as mesmas situações e origens do chamado e espécies da conversa', () => {
  expect([...SITUACOES_DO_CHAMADO_NO_BANCO]).toEqual([...SITUACOES_DO_CHAMADO]);
  expect([...ORIGENS_DO_CHAMADO_NO_BANCO]).toEqual([...ORIGENS_DO_CHAMADO]);
  expect([...ESPECIES_DA_CONVERSA_NO_BANCO]).toEqual([...ESPECIES_DA_CONVERSA]);
});
