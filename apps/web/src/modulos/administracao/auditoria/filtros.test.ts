import { criarDataHora } from '@grafite/ui';
import { describe, expect, it } from 'vitest';
import { intervaloDo, textoDoPeriodo, validarFiltrosDaAuditoria } from './filtros.ts';

const brasilia = criarDataHora('America/Sao_Paulo');
const AGORA = new Date('2026-10-07T15:00:00.000Z');

describe('validarFiltrosDaAuditoria', () => {
  it('aceita um alvo ou vários, como `pessoa:<id>`, e descarta o que não tem a forma', () => {
    expect(validarFiltrosDaAuditoria({ alvo: 'pessoa:joao' })).toEqual({ alvo: ['pessoa:joao'] });
    expect(
      validarFiltrosDaAuditoria({ alvo: ['pessoa:joao', 'conta:c-joao', 'qualquer', 7] }),
    ).toEqual({ alvo: ['pessoa:joao', 'conta:c-joao'] });
    expect(validarFiltrosDaAuditoria({ alvo: ['nada'] })).toEqual({});
    expect(validarFiltrosDaAuditoria({})).toEqual({});
  });

  it('guarda o nome do alvo só com o alvo, e quem fez com o nome', () => {
    expect(validarFiltrosDaAuditoria({ alvo: 'pessoa:joao', nomeDoAlvo: 'João da Silva' })).toEqual(
      { alvo: ['pessoa:joao'], nomeDoAlvo: 'João da Silva' },
    );
    expect(validarFiltrosDaAuditoria({ nomeDoAlvo: 'João da Silva' })).toEqual({});
    expect(validarFiltrosDaAuditoria({ ator: 'c-ana', quem: 'Ana Souza' })).toEqual({
      ator: 'c-ana',
      quem: 'Ana Souza',
    });
  });

  it('aceita os períodos, as datas do personalizado, a ação, o código e a ordem', () => {
    expect(
      validarFiltrosDaAuditoria({
        periodo: 'personalizado',
        de: '2026-10-01',
        ate: '2026-10-02',
        acao: 'entrada.recusada',
        rastreio: 'R7K2-9QXM',
        ordem: 'antigos',
      }),
    ).toEqual({
      periodo: 'personalizado',
      de: '2026-10-01',
      ate: '2026-10-02',
      acao: 'entrada.recusada',
      rastreio: 'R7K2-9QXM',
      ordem: 'antigos',
    });
    expect(
      validarFiltrosDaAuditoria({
        periodo: 'ontem',
        de: '01/10/2026',
        acao: 'Senha trocada',
        ordem: 'recentes',
        rastreio: '   ',
      }),
    ).toEqual({});
    // As datas valem só no período personalizado.
    expect(validarFiltrosDaAuditoria({ periodo: '7d', de: '2026-10-01' })).toEqual({
      periodo: '7d',
    });
  });
});

describe('intervaloDo', () => {
  it('os períodos relativos contam a partir de agora; "Tudo" não tem limite', () => {
    expect(intervaloDo({}, brasilia, AGORA)).toEqual({});
    expect(intervaloDo({ periodo: '24h' }, brasilia, AGORA)).toEqual({
      de: '2026-10-06T15:00:00.000Z',
    });
    expect(intervaloDo({ periodo: '7d' }, brasilia, AGORA)).toEqual({
      de: '2026-09-30T15:00:00.000Z',
    });
    expect(intervaloDo({ periodo: '30d' }, brasilia, AGORA)).toEqual({
      de: '2026-09-07T15:00:00.000Z',
    });
  });

  it('o personalizado inclui os dois dias inteiros, no fuso escolhido', () => {
    expect(
      intervaloDo(
        { periodo: 'personalizado', de: '2026-10-01', ate: '2026-10-02' },
        brasilia,
        AGORA,
      ),
    ).toEqual({ de: '2026-10-01T03:00:00.000Z', ate: '2026-10-03T02:59:59.999Z' });
    expect(intervaloDo({ periodo: 'personalizado', ate: '2026-10-02' }, brasilia, AGORA)).toEqual({
      ate: '2026-10-03T02:59:59.999Z',
    });
  });
});

describe('textoDoPeriodo', () => {
  it('diz o período como aparece nos filtros ativos', () => {
    expect(textoDoPeriodo({ periodo: '7d' })).toBe('Últimos 7 dias');
    expect(textoDoPeriodo({ periodo: 'personalizado', de: '2026-10-01', ate: '2026-10-02' })).toBe(
      '01/10/2026 a 02/10/2026',
    );
    expect(textoDoPeriodo({ periodo: 'personalizado', de: '2026-10-01' })).toBe(
      'A partir de 01/10/2026',
    );
    expect(textoDoPeriodo({ periodo: 'personalizado', ate: '2026-10-02' })).toBe('Até 02/10/2026');
    expect(textoDoPeriodo({})).toBeNull();
  });
});
