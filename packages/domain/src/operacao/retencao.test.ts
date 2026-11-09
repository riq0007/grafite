import { describe, expect, it } from 'vitest';
import { backupsQueFicam, type Retencao } from './retencao.ts';

const FUSO = 'America/Sao_Paulo';

/** O momento de uma hora local de São Paulo (UTC−3 o ano todo desde 2019). */
const em = (local: string): Date => new Date(`${local}-03:00`);

/** Os dias de setembro de 2026, às 02:00 de São Paulo. O dia 1º é uma terça. */
const setembro = (de: number, ate: number): Date[] =>
  Array.from({ length: ate - de + 1 }, (_, i) =>
    em(`2026-09-${String(de + i).padStart(2, '0')}T02:00:00`),
  );

const retencao = (diarios: number, semanais: number, mensais: number): Retencao => ({
  diarios,
  semanais,
  mensais,
});

describe('backupsQueFicam', () => {
  it.each([
    {
      caso: '20 dias seguidos com 7, 4 e 12: os 7 dias, os domingos das semanas de antes e nenhum mês a mais',
      momentos: setembro(1, 20),
      retencao: retencao(7, 4, 12),
      ficam: [...setembro(6, 6), ...setembro(13, 20)],
    },
    {
      caso: 'o oitavo dia apaga o primeiro, que não é o último da semana nem do mês',
      momentos: setembro(1, 8),
      retencao: retencao(7, 4, 12),
      ficam: setembro(2, 8),
    },
    {
      caso: 'dois backups no mesmo dia: fica o último do dia',
      momentos: [em('2026-09-19T02:00:00'), em('2026-09-20T02:00:00'), em('2026-09-20T15:00:00')],
      retencao: retencao(2, 0, 0),
      ficam: [em('2026-09-19T02:00:00'), em('2026-09-20T15:00:00')],
    },
    {
      caso: '23:30 de domingo no fuso ainda é a semana que acaba nele, mesmo já sendo segunda em UTC',
      momentos: [
        em('2026-09-06T23:30:00'),
        em('2026-09-12T10:00:00'),
        em('2026-09-13T23:30:00'),
        em('2026-09-14T10:00:00'),
      ],
      retencao: retencao(0, 2, 0),
      ficam: [em('2026-09-13T23:30:00'), em('2026-09-14T10:00:00')],
    },
    {
      caso: '23:30 do último dia do mês no fuso ainda é o mês que acaba nele',
      momentos: [em('2026-09-29T10:00:00'), em('2026-09-30T23:30:00'), em('2026-10-01T10:00:00')],
      retencao: retencao(0, 0, 2),
      ficam: [em('2026-09-30T23:30:00'), em('2026-10-01T10:00:00')],
    },
    {
      caso: 'o último de cada um dos 12 meses mais recentes',
      momentos: Array.from({ length: 15 }, (_, i) => {
        const mes = new Date(Date.UTC(2025, 6 + i, 1));
        const prefixo = `${mes.getUTCFullYear()}-${String(mes.getUTCMonth() + 1).padStart(2, '0')}`;
        return [em(`${prefixo}-01T02:00:00`), em(`${prefixo}-28T02:00:00`)];
      }).flat(),
      retencao: retencao(0, 0, 12),
      ficam: Array.from({ length: 12 }, (_, i) => {
        const mes = new Date(Date.UTC(2025, 9 + i, 1));
        const prefixo = `${mes.getUTCFullYear()}-${String(mes.getUTCMonth() + 1).padStart(2, '0')}`;
        return em(`${prefixo}-28T02:00:00`);
      }),
    },
    {
      caso: 'o mais novo fica, mesmo com a retenção zerada',
      momentos: setembro(1, 3),
      retencao: retencao(0, 0, 0),
      ficam: setembro(3, 3),
    },
    {
      caso: 'a lista vazia',
      momentos: [],
      retencao: retencao(7, 4, 12),
      ficam: [],
    },
  ])('$caso', ({ momentos, retencao, ficam }) => {
    expect(backupsQueFicam(momentos, retencao, FUSO)).toEqual(ficam);
  });

  it('devolve os mesmos momentos recebidos, na ordem em que vieram', () => {
    const momentos = [...setembro(1, 10)].reverse();
    const ficam = backupsQueFicam(momentos, retencao(3, 0, 0), FUSO);
    expect(ficam).toEqual(setembro(8, 10).reverse());
    for (const momento of ficam) expect(momentos).toContain(momento);
  });
});
