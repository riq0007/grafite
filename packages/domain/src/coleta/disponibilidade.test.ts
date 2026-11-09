import { describe, expect, it } from 'vitest';
import { desatualizada, situacaoDaDisponibilidade } from './disponibilidade.ts';

const AGORA = new Date('2026-10-12T12:00:00.000Z');
const minutosAtras = (minutos: number) => new Date(AGORA.getTime() - minutos * 60_000);

const estado = (valorTexto: string | null, minutos: number, desdeMinutos = minutos) => ({
  momento: minutosAtras(minutos),
  valorTexto,
  situacao: valorTexto === null ? ('sem-dado' as const) : ('valida' as const),
  desde: minutosAtras(desdeMinutos),
});

describe('situacaoDaDisponibilidade', () => {
  it('mostra a última leitura: online, offline ou sem dado, com o momento e o desde', () => {
    expect(
      situacaoDaDisponibilidade({
        ip: '10.0.0.5',
        estado: estado('offline', 1, 28),
        alcancado: true,
        agora: AGORA,
      }),
    ).toEqual({
      situacao: 'offline',
      momento: minutosAtras(1),
      desde: minutosAtras(28),
      desatualizado: false,
    });
    expect(
      situacaoDaDisponibilidade({
        ip: '10.0.0.5',
        estado: estado('online', 2),
        alcancado: true,
        agora: AGORA,
      }).situacao,
    ).toBe('online');
    expect(
      situacaoDaDisponibilidade({
        ip: '10.0.0.5',
        estado: estado(null, 2),
        alcancado: true,
        agora: AGORA,
      }).situacao,
    ).toBe('sem-dado');
  });

  it('marca como desatualizada a leitura mais antiga que 3 intervalos (6 min)', () => {
    const recente = situacaoDaDisponibilidade({
      ip: '10.0.0.5',
      estado: estado('online', 6),
      alcancado: true,
      agora: AGORA,
    });
    const antiga = situacaoDaDisponibilidade({
      ip: '10.0.0.5',
      estado: estado('online', 20),
      alcancado: false,
      agora: AGORA,
    });
    expect(recente).toMatchObject({ situacao: 'online', desatualizado: false });
    expect(antiga).toMatchObject({ situacao: 'online', desatualizado: true });
  });

  it('sem leitura, diz por que o ativo não foi verificado', () => {
    expect(
      situacaoDaDisponibilidade({ ip: null, estado: null, alcancado: false, agora: AGORA }),
    ).toEqual({ situacao: 'nao-verificado', motivo: 'Sem IP' });
    expect(
      situacaoDaDisponibilidade({ ip: '10.9.0.5', estado: null, alcancado: false, agora: AGORA }),
    ).toEqual({ situacao: 'nao-verificado', motivo: 'Nenhum coletor alcança o IP 10.9.0.5.' });
    expect(
      situacaoDaDisponibilidade({ ip: '10.0.5.20', estado: null, alcancado: true, agora: AGORA }),
    ).toEqual({ situacao: 'nao-verificado', motivo: 'Aguardando a primeira leitura.' });
  });

  it('sem o IP, o ativo não é verificado, mesmo com uma leitura de antes', () => {
    expect(
      situacaoDaDisponibilidade({
        ip: null,
        estado: estado('online', 1),
        alcancado: false,
        agora: AGORA,
      }),
    ).toEqual({ situacao: 'nao-verificado', motivo: 'Sem IP' });
  });
});

describe('desatualizada', () => {
  it('a leitura mais antiga que 6 minutos está desatualizada', () => {
    expect(desatualizada(minutosAtras(6), AGORA)).toBe(false);
    expect(desatualizada(minutosAtras(7), AGORA)).toBe(true);
  });

  it('a leitura do SNMP fica desatualizada depois de 3 intervalos dela, 30 minutos', () => {
    expect(desatualizada(minutosAtras(30), AGORA, 'snmp.resposta')).toBe(false);
    expect(desatualizada(minutosAtras(31), AGORA, 'impressora.suprimento')).toBe(true);
  });

  it('sem o relógio, a situação vem sem a idade, que fica para quem mostra', () => {
    expect(
      situacaoDaDisponibilidade({ ip: '10.0.0.5', estado: estado('online', 20), alcancado: true }),
    ).toMatchObject({ situacao: 'online', desatualizado: false });
  });
});
