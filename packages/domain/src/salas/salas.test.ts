// As salas de reunião no domínio (spec salas-de-reuniao; change salas-de-reuniao, design, decisão
// 3): a conferência da sala, do item e da reserva, o conflito de horário e a situação da sala no mapa.
import { describe, expect, it } from 'vitest';
import {
  conferirItemDaSala,
  conferirReserva,
  conferirSala,
  reservasConflitam,
  situacaoDaSalaNoMapa,
} from './salas.ts';

const SALA = '0193a0b2-0000-7000-8000-00000000000a';
const RUI = '0193a0b2-0000-7000-8000-00000000000b';
const ANA = '0193a0b2-0000-7000-8000-00000000000c';
const PROJETOR = '0193a0b2-0000-7000-8000-00000000000d';
const LOCAL = '0193a0b2-0000-7000-8000-00000000000e';

/** 28/10/2026, 10:00 em São Paulo. */
const AGORA = new Date('2026-10-28T13:00:00.000Z');
const amanha = (hora: string) => new Date(`2026-10-29T${hora}:00.000-03:00`);

describe('conferirSala', () => {
  it('Sala nova: o nome, o local, a capacidade e os recursos', () => {
    expect(
      conferirSala({
        nome: ' Sala Paraty ',
        localId: LOCAL,
        capacidade: 8,
        recursos: 'TV de 65 polegadas',
      }),
    ).toEqual({
      ok: true,
      dados: {
        nome: 'Sala Paraty',
        localId: LOCAL,
        capacidade: 8,
        recursos: 'TV de 65 polegadas',
      },
    });
  });

  it('recusa o nome vazio, o longo e a capacidade fora dos limites', () => {
    expect(conferirSala({ nome: '', capacidade: 0 })).toEqual({
      ok: false,
      erros: { nome: 'Informe o nome.', capacidade: 'Informe uma capacidade de 1 a 500 pessoas.' },
    });
    expect(conferirSala({ nome: 'x'.repeat(81) })).toEqual({
      ok: false,
      erros: { nome: 'Use até 80 caracteres no nome.' },
    });
  });
});

describe('conferirItemDaSala', () => {
  it('o nome e a descrição', () => {
    expect(conferirItemDaSala({ nome: 'Projetor', descricao: 'Epson, com HDMI' })).toEqual({
      ok: true,
      dados: { nome: 'Projetor', descricao: 'Epson, com HDMI' },
    });
    expect(conferirItemDaSala({ nome: ' ' })).toEqual({
      ok: false,
      erros: { nome: 'Informe o nome.' },
    });
  });
});

describe('conferirReserva', () => {
  const pedido = (mudancas: Record<string, unknown> = {}) => ({
    salaId: SALA,
    inicio: amanha('14:00').toISOString(),
    fim: amanha('15:00').toISOString(),
    assunto: ' Revisão do orçamento ',
    comentario: 'Trazer os números de setembro.',
    participantes: [RUI, ANA, RUI],
    itens: [PROJETOR],
    ...mudancas,
  });

  it('Pedido de Paula: a sala, o horário, o assunto, os participantes sem repetir e os itens', () => {
    expect(conferirReserva(pedido(), { agora: AGORA, quemPede: 'outra-conta' })).toEqual({
      ok: true,
      dados: {
        salaId: SALA,
        inicio: amanha('14:00'),
        fim: amanha('15:00'),
        assunto: 'Revisão do orçamento',
        comentario: 'Trazer os números de setembro.',
        participantes: [RUI, ANA],
        itens: [PROJETOR],
      },
    });
  });

  it('quem pede não entra como participante', () => {
    const conferida = conferirReserva(pedido(), { agora: AGORA, quemPede: RUI });
    expect(conferida.ok && conferida.dados.participantes).toEqual([ANA]);
  });

  it('recusa o horário invertido, o de dois dias, o longo e o que já passou', () => {
    const erros = (mudancas: Record<string, unknown>) => {
      const conferida = conferirReserva(pedido(mudancas), { agora: AGORA, quemPede: 'x' });
      return conferida.ok ? {} : conferida.erros;
    };
    expect(erros({ fim: amanha('13:00').toISOString() })).toEqual({
      fim: 'O fim precisa ficar depois do início.',
    });
    expect(erros({ fim: new Date('2026-10-30T10:00:00.000-03:00').toISOString() })).toEqual({
      fim: 'A reserva fica num dia só, com até 12 horas.',
    });
    expect(
      erros({ inicio: amanha('07:00').toISOString(), fim: amanha('20:00').toISOString() }),
    ).toEqual({ fim: 'A reserva fica num dia só, com até 12 horas.' });
    expect(
      erros({
        inicio: new Date('2026-10-28T09:00:00.000-03:00').toISOString(),
        fim: new Date('2026-10-28T11:00:00.000-03:00').toISOString(),
      }),
    ).toEqual({ inicio: 'Escolha um horário a partir de agora.' });
  });

  it('recusa o assunto, o comentário, os participantes e os itens que não conferem', () => {
    const conferida = conferirReserva(
      pedido({
        salaId: 'x',
        assunto: '',
        comentario: 'x'.repeat(1001),
        participantes: ['outra'],
        itens: ['y'],
      }),
      { agora: AGORA, quemPede: 'x' },
    );
    expect(conferida).toEqual({
      ok: false,
      erros: {
        sala: 'Escolha uma sala ativa.',
        assunto: 'Informe o assunto.',
        comentario: 'Use até 1.000 caracteres no comentário.',
        participantes: 'Escolha participantes da organização.',
        itens: 'Escolha itens que estejam ativos.',
      },
    });
    const muitos = Array.from(
      { length: 51 },
      (_, i) => `0193a0b2-0000-7000-8000-${String(i).padStart(12, '0')}`,
    );
    const demais = conferirReserva(pedido({ participantes: muitos }), {
      agora: AGORA,
      quemPede: 'x',
    });
    expect(demais.ok ? {} : demais.erros).toEqual({
      participantes: 'Convide até 50 participantes.',
    });
  });
});

describe('reservasConflitam', () => {
  const de = (inicio: string, fim: string) => ({ inicio: amanha(inicio), fim: amanha(fim) });

  it('Horário ocupado: o que cruza conflita', () => {
    expect(reservasConflitam(de('14:00', '15:00'), de('14:30', '15:30'))).toBe(true);
    expect(reservasConflitam(de('14:00', '15:00'), de('13:00', '16:00'))).toBe(true);
  });

  it('Reservas que se encostam: não conflitam', () => {
    expect(reservasConflitam(de('14:00', '15:00'), de('15:00', '16:00'))).toBe(false);
    expect(reservasConflitam(de('14:00', '15:00'), de('12:00', '14:00'))).toBe(false);
  });
});

describe('situacaoDaSalaNoMapa', () => {
  const hoje = (hora: string) => new Date(`2026-10-28T${hora}:00.000-03:00`);
  const reserva = (inicio: string, fim: string, assunto = 'Reunião') => ({
    inicio: hoje(inicio),
    fim: hoje(fim),
    assunto,
  });

  it('Sala em uso no mapa: até o fim, com o assunto', () => {
    expect(situacaoDaSalaNoMapa([reserva('14:00', '15:00', 'Orçamento')], hoje('14:20'))).toEqual({
      texto: 'Em uso até 15:00',
      tom: 'atencao',
      assunto: 'Orçamento',
    });
  });

  it('a próxima reserva do dia, ou livre', () => {
    expect(situacaoDaSalaNoMapa([reserva('16:00', '17:00')], hoje('14:20'))).toEqual({
      texto: 'Reservada às 16:00',
      tom: 'info',
      assunto: null,
    });
    expect(situacaoDaSalaNoMapa([reserva('09:00', '10:00')], hoje('14:20'))).toEqual({
      texto: 'Livre',
      tom: 'sucesso',
      assunto: null,
    });
  });
});
