import { describe, expect, it } from 'vitest';
import { conferirConfiguracao } from '../campos/configuracao.ts';
import { lerValor, mostrarValor } from '../campos/valores.ts';
import {
  CAMPOS_DO_ATIVO,
  campoComumDa,
  PROPRIEDADES_DO_ATIVO,
  rotuloDoAtivo,
  rotuloReservado,
  USO_PADRAO,
  USOS_DO_ATIVO,
} from './campos-do-ativo.ts';

describe('campos comuns a todo ativo', () => {
  it('são os 17 da spec, com a chave fixa, em grupos, na ordem da ficha', () => {
    expect(
      CAMPOS_DO_ATIVO.map((campo) => [campo.chave, campo.rotulo, campo.tipo, campo.grupo]),
    ).toEqual([
      ['ativo.nome', 'Nome', 'texto', 'Identificação'],
      ['ativo.patrimonio', 'Patrimônio', 'texto', 'Identificação'],
      ['ativo.serie', 'Número de série', 'texto', 'Identificação'],
      ['ativo.hostname', 'Hostname', 'texto', 'Identificação'],
      ['ativo.uso', 'Situação de uso', 'lista', 'Uso'],
      ['ativo.local', 'Local', 'local', 'Uso'],
      ['ativo.responsavel', 'Responsável', 'pessoa', 'Uso'],
      ['ativo.fornecedor', 'Fornecedor', 'fornecedor', 'Administrativo'],
      ['ativo.nota-fiscal', 'Nota fiscal', 'texto', 'Administrativo'],
      ['ativo.data-de-compra', 'Data de compra', 'data', 'Administrativo'],
      ['ativo.valor-de-compra', 'Valor de compra', 'moeda', 'Administrativo'],
      ['ativo.garantia', 'Garantia até', 'data', 'Administrativo'],
      ['ativo.propriedade', 'Propriedade', 'lista', 'Administrativo'],
      ['ativo.contrato', 'Contrato', 'texto', 'Administrativo'],
      ['ativo.custo-mensal', 'Custo mensal', 'moeda', 'Administrativo'],
      ['ativo.centro-de-custo', 'Centro de custo', 'texto', 'Administrativo'],
      ['ativo.vida-util', 'Vida útil (meses)', 'inteiro', 'Administrativo'],
    ]);
  });

  it('o que o banco garante ou filtra fica em colunas, e o resto no JSONB', () => {
    expect(
      CAMPOS_DO_ATIVO.filter((campo) => campo.coluna).map((campo) => [campo.chave, campo.coluna]),
    ).toEqual([
      ['ativo.nome', 'nome'],
      ['ativo.patrimonio', 'patrimonio'],
      ['ativo.serie', 'serie'],
      ['ativo.hostname', 'hostname'],
      ['ativo.uso', 'uso'],
      ['ativo.local', 'localId'],
      ['ativo.responsavel', 'responsavelId'],
    ]);
  });

  it('cada configuração é aceita pela regra do tipo de campo, e todos aceitam a importação e a coleta', () => {
    for (const campo of CAMPOS_DO_ATIVO) {
      const conferida = conferirConfiguracao(campo.tipo, campo.configuracao, () => 'nova');
      expect(conferida, campo.chave).toEqual({ ok: true, configuracao: campo.configuracao });
      expect(campo.escrita, campo.chave).toBe('automatica');
    }
  });

  it('a situação de uso é uma lista fixa, lida pelo rótulo ou pelo id, e começa em "Em uso"', () => {
    const uso = campoComumDa('ativo.uso');
    expect(USOS_DO_ATIVO.map((opcao) => opcao.id)).toEqual([
      'em-uso',
      'em-estoque',
      'em-manutencao',
    ]);
    expect(USO_PADRAO).toBe('em-uso');
    expect(uso?.padrao).toBe('em-uso');
    expect(lerValor(uso as NonNullable<typeof uso>, 'em manutencao')).toEqual({
      ok: true,
      valor: 'em-manutencao',
    });
    expect(lerValor(uso as NonNullable<typeof uso>, 'em-estoque')).toEqual({
      ok: true,
      valor: 'em-estoque',
    });
    expect(lerValor(uso as NonNullable<typeof uso>, 'Quebrado').ok).toBe(false);
    expect(mostrarValor(uso as NonNullable<typeof uso>, 'em-manutencao')).toBe('Em manutenção');
  });

  it('a propriedade é uma lista fixa: próprio, alugado ou comodato', () => {
    const propriedade = campoComumDa('ativo.propriedade');
    expect(PROPRIEDADES_DO_ATIVO.map((opcao) => [opcao.id, opcao.rotulo])).toEqual([
      ['proprio', 'Próprio'],
      ['alugado', 'Alugado'],
      ['comodato', 'Comodato'],
    ]);
    expect(lerValor(propriedade as NonNullable<typeof propriedade>, 'PROPRIO')).toEqual({
      ok: true,
      valor: 'proprio',
    });
  });

  it('a vida útil vai de 0 a 600 meses', () => {
    const vida = campoComumDa('ativo.vida-util') as NonNullable<ReturnType<typeof campoComumDa>>;
    expect(lerValor(vida, '60')).toEqual({ ok: true, valor: 60 });
    expect(lerValor(vida, '601').ok).toBe(false);
  });

  it('a consulta pela chave devolve o campo, ou nada', () => {
    expect(campoComumDa('ativo.hostname')?.rotulo).toBe('Hostname');
    expect(campoComumDa('ativo.inexistente')).toBeUndefined();
    expect(campoComumDa('hardware.processador')).toBeUndefined();
  });
});

describe('rotuloDoAtivo', () => {
  const tipo = { nome: 'Impressora' };
  const modelo = { fabricante: 'HP', nome: 'LaserJet M404' };

  it('mostra o nome, quando há', () => {
    expect(rotuloDoAtivo({ nome: 'Impressora do RH', modelo, tipo })).toBe('Impressora do RH');
  });

  it('sem nome, mostra o fabricante e o modelo', () => {
    expect(rotuloDoAtivo({ nome: null, modelo, tipo })).toBe('HP LaserJet M404');
    expect(rotuloDoAtivo({ nome: '  ', modelo, tipo })).toBe('HP LaserJet M404');
  });

  it('sem nome e sem modelo, mostra o tipo', () => {
    expect(rotuloDoAtivo({ nome: null, modelo: null, tipo })).toBe('Impressora');
  });
});

describe('rotuloReservado', () => {
  it('recusa o rótulo de um campo comum, sem diferenciar acento e maiúsculas', () => {
    const motivo = 'Este rótulo é de um campo que todo ativo já tem.';
    expect(rotuloReservado('patrimonio')).toBe(motivo);
    expect(rotuloReservado(' PATRIMÔNIO ')).toBe(motivo);
    expect(rotuloReservado('Situação de uso')).toBe(motivo);
  });

  it('recusa o rótulo de um campo de capacidade, com o nome da capacidade', () => {
    expect(rotuloReservado('processador')).toBe(
      'Este rótulo é de um campo da capacidade Inventário de hardware.',
    );
  });

  it('aceita os outros rótulos', () => {
    expect(rotuloReservado('IP')).toBeNull();
    expect(rotuloReservado('Criticidade')).toBeNull();
  });
});
