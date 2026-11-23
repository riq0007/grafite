import { describe, expect, it } from 'vitest';
import { linhasDoResumoDosTempos, resumoDosTempos } from './resumo-dos-tempos.ts';

const em = (dia: number, hora: string) =>
  new Date(`2026-11-${String(dia).padStart(2, '0')}T${hora}:00-03:00`);

const HORA = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});
const hora = (momento: Date) => HORA.format(momento);

describe('o resumo dos tempos', () => {
  it('Resumo do #1045: aberto às 10:32, respondido às 10:50 e resolvido às 11:20 por Bruno', () => {
    const resumo = resumoDosTempos({
      abertoEm: em(11, '10:32'),
      primeiraRespostaEm: em(11, '10:50'),
      resolvidoEm: em(11, '11:20'),
      atendeu: 'Bruno Lima',
    });
    expect(resumo).toEqual({
      abertoEm: em(11, '10:32'),
      primeiraResposta: { em: em(11, '10:50'), tempo: '18 min' },
      resolvido: { em: em(11, '11:20'), tempo: '48 min' },
      atendeu: 'Bruno Lima',
    });
    expect(linhasDoResumoDosTempos(resumo, hora)).toEqual([
      { rotulo: 'Aberto', valor: '10:32', tempo: null },
      { rotulo: 'Primeira resposta da TI', valor: '10:50', tempo: '18 min' },
      { rotulo: 'Resolvido', valor: '11:20', tempo: '48 min' },
      { rotulo: 'Atendeu', valor: 'Bruno Lima', tempo: null },
    ]);
  });

  it('sem nenhuma mensagem da TI, a primeira resposta diz "sem resposta"', () => {
    const resumo = resumoDosTempos({
      abertoEm: em(11, '10:32'),
      primeiraRespostaEm: null,
      resolvidoEm: em(11, '11:20'),
      atendeu: 'Bruno Lima',
    });
    expect(resumo.primeiraResposta).toBeNull();
    expect(linhasDoResumoDosTempos(resumo, hora)[1]).toEqual({
      rotulo: 'Primeira resposta da TI',
      valor: 'sem resposta',
      tempo: null,
    });
  });

  it('conta em horas corridas, com a noite e o fim de semana', () => {
    // Aberto na sexta, 13/11, às 17:00, respondido no sábado às 09:00 e resolvido na segunda às 09:00.
    const resumo = resumoDosTempos({
      abertoEm: em(13, '17:00'),
      primeiraRespostaEm: em(14, '09:00'),
      resolvidoEm: em(16, '09:00'),
      atendeu: 'Ana Souza',
    });
    expect(resumo.primeiraResposta?.tempo).toBe('16 h');
    expect(resumo.resolvido.tempo).toBe('2,7 dias');
  });

  it('o tempo sai dos minutos das horas mostradas, para a conta fechar com elas', () => {
    // Aberto às 10:32:50, respondido às 10:32:59 e resolvido às 11:20:10: as horas dizem 10:32,
    // 10:32 e 11:20, e os tempos, "menos de 1 min" e 48 min.
    const segundos = (momento: Date, s: number) => new Date(momento.getTime() + s * 1000);
    const resumo = resumoDosTempos({
      abertoEm: segundos(em(11, '10:32'), 50),
      primeiraRespostaEm: segundos(em(11, '10:32'), 59),
      resolvidoEm: segundos(em(11, '11:20'), 10),
      atendeu: 'Bruno Lima',
    });
    expect(resumo.primeiraResposta?.tempo).toBe('menos de 1 min');
    expect(resumo.resolvido.tempo).toBe('48 min');
  });
});
