// Os indicadores criados pela organização (spec indicadores, "Indicadores da organização" e
// "Backups do Control iD em dia"; change regras-indicadores-e-tarefas, design, decisão 3): a
// conferência do nome, da medida, do recorte e da meta, e a medida dos backups em dia.
import { describe, expect, it } from 'vitest';
import {
  conferirIndicadorCriado,
  definicaoDaMedida,
  indicadorDosBackups,
  MEDIDAS_DOS_INDICADORES_CRIADOS,
} from './criados.ts';

const TIPO = '0193a0b2-0000-7000-8000-00000000000a';
const MODELO = '0193a0b2-0000-7000-8000-00000000000b';
const LOCAL = '0193a0b2-0000-7000-8000-00000000000c';

describe('as medidas', () => {
  it('as quatro dos alertas e a dos backups do Control iD', () => {
    expect(MEDIDAS_DOS_INDICADORES_CRIADOS).toEqual([
      'toner',
      'critico',
      'disponibilidade',
      'que-voltam',
      'backups-do-control-id',
    ]);
    expect(definicaoDaMedida('backups-do-control-id')).toMatchObject({
      nome: 'Backups do Control iD em dia',
      unidade: 'por-mil',
      metaDeFabrica: 1000,
      limites: [500, 1000],
      decisao: 'Confira o coletor e o login desses controles, ou peça o backup pela ficha deles.',
    });
    expect(definicaoDaMedida('disponibilidade').nome).toBe('Disponibilidade dos ativos');
  });
});

describe('conferirIndicadorCriado', () => {
  it('Disponibilidade das impressoras de Jundiaí: aceita o tipo e o local, com a meta', () => {
    expect(
      conferirIndicadorCriado({
        nome: '  Impressoras de Jundiaí ',
        medida: 'disponibilidade',
        recorte: { tipoId: TIPO, localId: LOCAL },
        meta: 980,
      }),
    ).toEqual({
      ok: true,
      dados: {
        nome: 'Impressoras de Jundiaí',
        medida: 'disponibilidade',
        recorte: { tipoId: TIPO, modeloId: null, localId: LOCAL },
        meta: 980,
      },
    });
  });

  it('sem recorte, todos os ativos', () => {
    const conferido = conferirIndicadorCriado({ nome: 'Críticos', medida: 'critico', meta: 15 });
    expect(conferido.ok && conferido.dados.recorte).toEqual({
      tipoId: null,
      modeloId: null,
      localId: null,
    });
  });

  it('recusa cada campo com a mensagem dele', () => {
    expect(
      conferirIndicadorCriado({
        nome: '',
        medida: 'outra',
        recorte: { tipoId: 'x', localId: 'y' },
        meta: 10,
      }),
    ).toEqual({
      ok: false,
      erros: {
        nome: 'Informe o nome do indicador.',
        medida: 'Escolha a medida.',
        tipo: 'Escolha um tipo ativo.',
        local: 'Escolha um local ativo.',
      },
    });
    expect(
      conferirIndicadorCriado({
        nome: 'x'.repeat(81),
        medida: 'disponibilidade',
        recorte: { tipoId: TIPO, modeloId: MODELO },
        meta: 1000,
      }),
    ).toEqual({
      ok: false,
      erros: {
        nome: 'Use até 80 caracteres no nome.',
        modelo: 'Escolha o tipo ou o modelo, não os dois.',
        meta: 'A meta deve ficar entre 90% e 99,9%.',
      },
    });
  });

  it('a meta dos backups vai de 50% a 100%', () => {
    expect(
      conferirIndicadorCriado({ nome: 'Backups', medida: 'backups-do-control-id', meta: 400 }),
    ).toEqual({ ok: false, erros: { meta: 'A meta deve ficar entre 50% e 100%.' } });
  });
});

describe('indicadorDosBackups', () => {
  const agora = new Date('2026-10-28T10:00:00.000Z');
  const horasAntes = (horas: number) => new Date(agora.getTime() - horas * 60 * 60 * 1000);

  it('Um controle sem backup: 3 de 4 em dia é 75%, fora da meta de 100%', () => {
    const resultado = indicadorDosBackups(
      [
        { alvo: 'portaria', ultimoBom: horasAntes(8) },
        { alvo: 'garagem', ultimoBom: horasAntes(25) },
        { alvo: 'rh', ultimoBom: horasAntes(72) },
        { alvo: 'refeitorio', ultimoBom: horasAntes(1) },
      ],
      agora,
      1000,
    );
    expect(resultado).toEqual({
      valor: 750,
      anterior: null,
      base: 4,
      situacao: 'fora',
      itens: [{ alvo: 'rh', ultimoBom: horasAntes(72) }],
      mais: 0,
    });
  });

  it('o controle sem nenhum backup vem primeiro na lista', () => {
    const resultado = indicadorDosBackups(
      [
        { alvo: 'rh', ultimoBom: horasAntes(30) },
        { alvo: 'novo', ultimoBom: null },
      ],
      agora,
      900,
    );
    expect(resultado.itens.map(({ alvo }) => alvo)).toEqual(['novo', 'rh']);
    expect(resultado).toMatchObject({ valor: 0, situacao: 'fora' });
  });

  it('todos em dia ficam dentro da meta, e nenhum controle fica sem dado', () => {
    expect(
      indicadorDosBackups([{ alvo: 'portaria', ultimoBom: horasAntes(2) }], agora, 1000),
    ).toMatchObject({ valor: 1000, situacao: 'dentro', itens: [] });
    expect(indicadorDosBackups([], agora, 1000)).toEqual({
      valor: null,
      anterior: null,
      base: 0,
      situacao: 'sem-dado',
      itens: [],
      mais: 0,
    });
  });
});
