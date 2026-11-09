// O banco confere o ícone do tipo, o tipo do campo, a situação de uso do ativo, a tabela de uma
// visão e a situação de uma importação com listas próprias, porque o @grafite/db não depende do
// domínio. Elas têm de ser as mesmas do domínio (design do P1a, decisão 1, do P1b, decisão 1, do
// P1c, decisão 5, e do P1e, decisão 3).
import {
  ICONES_DE_TIPO_NO_BANCO,
  SITUACOES_DA_IMPORTACAO_NO_BANCO,
  TABELAS_COM_VISOES_NO_BANCO,
  TIPOS_DE_CAMPO_NO_BANCO,
  USOS_NO_BANCO,
} from '@grafite/db';
import {
  ICONES_DE_TIPO,
  SITUACOES_DA_IMPORTACAO,
  TABELAS_COM_VISOES,
  TIPOS_DE_CAMPO,
  USOS_DO_ATIVO,
} from '@grafite/domain';
import { expect, it } from 'vitest';

it('o banco aceita os mesmos ícones e tipos de campo do domínio', () => {
  expect([...ICONES_DE_TIPO_NO_BANCO]).toEqual([...ICONES_DE_TIPO]);
  expect([...TIPOS_DE_CAMPO_NO_BANCO]).toEqual([...TIPOS_DE_CAMPO]);
});

it('o banco aceita as mesmas situações de uso do domínio', () => {
  expect([...USOS_NO_BANCO]).toEqual(USOS_DO_ATIVO.map((uso) => uso.id));
});

it('o banco aceita as mesmas tabelas com visões do domínio', () => {
  expect([...TABELAS_COM_VISOES_NO_BANCO]).toEqual(TABELAS_COM_VISOES.map((tabela) => tabela.id));
});

it('o banco aceita as mesmas situações da importação do domínio', () => {
  expect([...SITUACOES_DA_IMPORTACAO_NO_BANCO]).toEqual([...SITUACOES_DA_IMPORTACAO]);
});
