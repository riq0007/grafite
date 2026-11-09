import { describe, expect, it } from 'vitest';
import { criarDataHora } from '../regiao/dataHora.ts';
import { agruparPorDia, textoDoSino } from './notificacoes.ts';

describe('textoDoSino', () => {
  it('sem não lidas, não mostra número, e o nome acessível diz que não há nenhuma', () => {
    expect(textoDoSino(0)).toEqual({
      numero: null,
      nomeAcessivel: 'Notificações, nenhuma não lida',
    });
  });

  it('mostra o número de não lidas, no singular e no plural', () => {
    expect(textoDoSino(1)).toEqual({ numero: '1', nomeAcessivel: 'Notificações, 1 não lida' });
    expect(textoDoSino(3)).toEqual({ numero: '3', nomeAcessivel: 'Notificações, 3 não lidas' });
    expect(textoDoSino(99).numero).toBe('99');
  });

  it('com o modo Foco ligado, o nome acessível diz isso', () => {
    expect(textoDoSino(2, true)).toEqual({
      numero: '2',
      nomeAcessivel: 'Notificações, 2 não lidas, Foco ligado',
    });
    expect(textoDoSino(0, true).nomeAcessivel).toBe('Notificações, nenhuma não lida, Foco ligado');
  });

  it('acima de 99, mostra "99+", e o nome acessível diz o número exato', () => {
    expect(textoDoSino(120)).toEqual({
      numero: '99+',
      nomeAcessivel: 'Notificações, 120 não lidas',
    });
  });
});

describe('agruparPorDia', () => {
  // No Acre, e não no fuso da máquina que roda o teste.
  const { grupoDoDia } = criarDataHora('America/Rio_Branco');
  // qui 24 set 2026, 14:32 no Acre.
  const agora = new Date('2026-09-24T19:32:00Z');
  /** O dia e a hora no Acre (UTC−5). */
  const em = (dia: number, hora: number, minuto = 0) => ({
    momento: new Date(Date.UTC(2026, 8, dia, hora + 5, minuto)),
  });

  it('agrupa da mais recente para a mais antiga, em Hoje, Ontem e a data', () => {
    const [dia22, dia24cedo, dia23, dia24tarde] = [em(22, 9), em(24, 8), em(23, 18), em(24, 13)];
    expect(agruparPorDia([dia22, dia24cedo, dia23, dia24tarde], agora, grupoDoDia)).toEqual([
      { rotulo: 'Hoje', itens: [dia24tarde, dia24cedo] },
      { rotulo: 'Ontem', itens: [dia23] },
      { rotulo: 'ter 22 set', itens: [dia22] },
    ]);
  });

  it('a virada da meia-noite no fuso separa hoje de ontem', () => {
    const grupos = agruparPorDia([em(24, 0, 5), em(23, 23, 55)], agora, grupoDoDia);
    expect(grupos.map((grupo) => grupo.rotulo)).toEqual(['Hoje', 'Ontem']);
  });

  it('sem notificações, não há grupos', () => {
    expect(agruparPorDia([], agora, grupoDoDia)).toEqual([]);
  });
});
