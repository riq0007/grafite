import { describe, expect, it } from 'vitest';
import {
  HORARIO_DA_TI_PADRAO,
  type ModoDoPrazo,
  type PrazoDoChamado,
  prazoEmMinutos,
  type ValorDoPrazo,
} from './prazo.ts';
import { compararPrazos, type RelogioDoChamado, situacaoDoPrazo } from './situacao-do-prazo.ts';

/**
 * O instante no relógio de São Paulo, que não tem horário de verão desde 2019 (UTC−3). Nos
 * mockups, hoje é terça, 17/11/2026, e são 09:40.
 */
const sp = (dataHora: string) => new Date(`${dataHora}:00-03:00`);

const HORA = 3600;
const MINUTO = 60;
const AGORA = sp('2026-11-17T09:40');
const FUSO = 'America/Sao_Paulo';
const HORARIO = HORARIO_DA_TI_PADRAO;

const min = (valor: number): ValorDoPrazo => ({ valor, unidade: 'min' });
const h = (valor: number): ValorDoPrazo => ({ valor, unidade: 'h' });
const doTipo = (resposta: ValorDoPrazo, resolucao: ValorDoPrazo, modo: ModoDoPrazo) =>
  prazoEmMinutos({ modo, resposta, resolucao }, HORARIO);

// Os prazos dos tipos de fábrica (spec tipos-de-chamado, "Tipos de fábrica").
const TONER = doTipo(min(30), h(8), 'corridas');
const COMPUTADOR = doTipo(min(30), h(5), 'corridas');
const IMPRESSORA = doTipo(min(30), h(8), 'horario');
const ACESSO = doTipo(min(30), h(4), 'horario');
const SOFTWARE = doTipo(h(1), h(24), 'corridas');
const REDE = doTipo(min(30), h(8), 'corridas');
const TELEFONE = doTipo(h(1), h(10), 'corridas');
const OUTRO = doTipo(h(1), h(24), 'corridas');

/** O relógio que conta desde `desde`, com o contado até a última parada. */
const contando = (
  prazo: PrazoDoChamado,
  desde: string,
  primeiraResposta: string | null,
  contadoS = 0,
): RelogioDoChamado => ({
  prazo,
  contadoS,
  relogioDesde: sp(desde),
  primeiraRespostaEm: primeiraResposta === null ? null : sp(primeiraResposta),
});

/** O relógio parado, aguardando a pessoa: a primeira resposta já foi dada. */
const parado = (prazo: PrazoDoChamado, contadoS: number, primeiraResposta: string) => ({
  prazo,
  contadoS,
  relogioDesde: null,
  primeiraRespostaEm: sp(primeiraResposta),
});

// Os 12 chamados abertos às 09:40 dos mockups (m01 e m05), na ordem do m05.
const DOZE: [number, RelogioDoChamado][] = [
  [1033, contando(REDE, '2026-11-17T01:20', '2026-11-17T01:45')],
  [1039, contando(COMPUTADOR, '2026-11-17T05:40', '2026-11-17T06:40')],
  [1038, contando(REDE, '2026-11-17T03:40', null)],
  [1031, contando(ACESSO, '2026-11-16T17:40', '2026-11-16T17:50')],
  [1037, contando(TELEFONE, '2026-11-17T03:40', '2026-11-17T04:05')],
  [1040, contando(TONER, '2026-11-17T06:52', null)],
  [1042, contando(IMPRESSORA, '2026-11-17T07:40', null)],
  [1034, contando(OUTRO, '2026-11-16T16:40', '2026-11-16T17:00')],
  [1036, contando(OUTRO, '2026-11-16T17:40', '2026-11-17T08:05')],
  [1041, parado(ACESSO, 2 * HORA + 16 * MINUTO, '2026-11-16T17:22')],
  [1032, parado(SOFTWARE, 12 * HORA, '2026-11-15T11:40')],
  [1029, parado(OUTRO, 7 * HORA + 12 * MINUTO, '2026-11-14T10:00')],
];

const doDoze = (numero: number) => {
  const achado = DOZE.find(([n]) => n === numero);
  if (!achado) throw new Error(`O #${numero} não está nos 12.`);
  return achado[1];
};

/** O relógio de 8 h corridas que vence `segundos` depois de agora, ou antes, se negativo. */
const venceEm = (segundos: number): RelogioDoChamado => ({
  prazo: REDE,
  contadoS: 0,
  relogioDesde: new Date(AGORA.getTime() - (8 * HORA - segundos) * 1000),
  primeiraRespostaEm: AGORA,
});

describe('situacaoDoPrazo', () => {
  it('os 12 chamados das 09:40: 1 estourado, 3 até 2 h, 5 hoje e 3 parados', () => {
    const situacoes = DOZE.map(([numero, relogio]) => {
      const { grupo, texto } = situacaoDoPrazo(relogio, HORARIO, AGORA, FUSO);
      return [numero, grupo, texto];
    });
    expect(situacoes).toEqual([
      [1033, 'estourado', 'estourado há 20 min'],
      [1039, 'ate-2-horas', 'vence em 1 h'],
      [1038, 'ate-2-horas', 'vence em 2 h'],
      [1031, 'ate-2-horas', 'vence em 2 h'],
      [1037, 'hoje', 'vence em 4 h'],
      [1040, 'hoje', 'vence em 5 h'],
      [1042, 'hoje', 'vence em 6 h'],
      [1034, 'hoje', 'vence em 7 h'],
      [1036, 'hoje', 'vence em 8 h'],
      [1041, 'parado', 'relógio parado'],
      [1032, 'parado', 'relógio parado'],
      [1029, 'parado', 'relógio parado'],
    ]);
  });

  it('o #1033, de 8 h corridas, aberto às 01:20, venceu às 09:20', () => {
    expect(situacaoDoPrazo(doDoze(1033), HORARIO, AGORA, FUSO)).toEqual({
      contadoS: 8 * HORA + 20 * MINUTO,
      prazoS: 8 * HORA,
      restaS: -20 * MINUTO,
      vencimento: sp('2026-11-17T09:20'),
      grupo: 'estourado',
      texto: 'estourado há 20 min',
      primeiraResposta: null,
    });
  });

  it('o #1042, de 8 h no horário, conta das 08:00, vence às 16:00 e está sem resposta desde as 08:30', () => {
    expect(situacaoDoPrazo(doDoze(1042), HORARIO, AGORA, FUSO)).toEqual({
      contadoS: HORA + 40 * MINUTO,
      prazoS: 8 * HORA,
      restaS: 6 * HORA + 20 * MINUTO,
      vencimento: sp('2026-11-17T16:00'),
      grupo: 'hoje',
      texto: 'vence em 6 h',
      primeiraResposta: { ate: sp('2026-11-17T08:30'), atrasada: true },
    });
  });

  it('o #1041, parado às 09:21 com 2 h 16 min contadas, não tem vencimento e restam 1 h 44 min', () => {
    expect(situacaoDoPrazo(doDoze(1041), HORARIO, AGORA, FUSO)).toEqual({
      contadoS: 2 * HORA + 16 * MINUTO,
      prazoS: 4 * HORA,
      restaS: HORA + 44 * MINUTO,
      vencimento: null,
      grupo: 'parado',
      texto: 'relógio parado',
      primeiraResposta: null,
    });
  });

  it('arredonda para baixo: os dias a partir de 48 h, as horas, os minutos e "menos de 1 min"', () => {
    const casos: [number, string][] = [
      [72 * HORA - 1, 'vence em 2 dias'],
      [48 * HORA, 'vence em 2 dias'],
      [48 * HORA - 1, 'vence em 47 h'],
      [30 * HORA, 'vence em 30 h'],
      [2 * HORA - 1, 'vence em 1 h'],
      [HORA, 'vence em 1 h'],
      [HORA - 1, 'vence em 59 min'],
      [MINUTO, 'vence em 1 min'],
      [MINUTO - 1, 'vence em menos de 1 min'],
      [0, 'estourado há menos de 1 min'],
      [-(MINUTO - 1), 'estourado há menos de 1 min'],
      [-MINUTO, 'estourado há 1 min'],
      [-(2 * HORA - 1), 'estourado há 1 h'],
      [-(48 * HORA - 1), 'estourado há 47 h'],
      [-(14 * 24 * HORA), 'estourado há 14 dias'],
    ];
    for (const [segundos, texto] of casos) {
      expect(situacaoDoPrazo(venceEm(segundos), HORARIO, AGORA, FUSO).texto).toBe(texto);
    }
  });

  it('no horário da TI, o que vence no dia seguinte diz a distância até lá, no relógio comum', () => {
    // Às 17:30, com 1 h restante: 30 min até as 18:00 e 30 min no dia seguinte, das 08:00.
    const relogio = contando(IMPRESSORA, '2026-11-17T10:30', '2026-11-17T10:40');
    const agora = sp('2026-11-17T17:30');
    expect(situacaoDoPrazo(relogio, HORARIO, agora, FUSO)).toMatchObject({
      restaS: HORA,
      vencimento: sp('2026-11-18T08:30'),
      grupo: 'depois-de-hoje',
      texto: 'vence em 15 h',
    });
  });

  it('o estourado no horário da TI conta do vencimento, no relógio comum', () => {
    // Desde segunda às 09:50, as 8 h acabaram às 17:50; hoje contam mais 1 h 40 min.
    const relogio = contando(IMPRESSORA, '2026-11-16T09:50', '2026-11-16T10:00');
    expect(situacaoDoPrazo(relogio, HORARIO, AGORA, FUSO)).toMatchObject({
      contadoS: 9 * HORA + 50 * MINUTO,
      restaS: -(HORA + 50 * MINUTO),
      vencimento: sp('2026-11-16T17:50'),
      grupo: 'estourado',
      texto: 'estourado há 15 h',
    });
  });

  it('o retomado conta de onde parou', () => {
    const relogio = contando(REDE, '2026-11-17T09:00', '2026-11-17T08:00', 3 * HORA);
    expect(situacaoDoPrazo(relogio, HORARIO, AGORA, FUSO)).toMatchObject({
      contadoS: 3 * HORA + 40 * MINUTO,
      restaS: 4 * HORA + 20 * MINUTO,
      vencimento: sp('2026-11-17T14:00'),
      grupo: 'hoje',
      texto: 'vence em 4 h',
    });
  });

  it('o que volta a contar depois do prazo, reaberto ou retomado, vence na volta', () => {
    // Às 09:00, com 9 h contadas de 8 h: o tempo parado não conta como estouro.
    const relogio = contando(REDE, '2026-11-17T09:00', '2026-11-16T15:00', 9 * HORA);
    expect(situacaoDoPrazo(relogio, HORARIO, AGORA, FUSO)).toMatchObject({
      contadoS: 9 * HORA + 40 * MINUTO,
      restaS: -(HORA + 40 * MINUTO),
      vencimento: sp('2026-11-17T09:00'),
      grupo: 'estourado',
      texto: 'estourado há 40 min',
    });
  });

  it('o parado depois do prazo fica com os parados, à frente deles, com o que passou', () => {
    // O #1033 estourou às 09:20 e passou a aguardar Sandra às 09:40: 20 min além do prazo.
    const relogio = parado(REDE, 8 * HORA + 20 * MINUTO, '2026-11-17T01:45');
    const situacao = situacaoDoPrazo(relogio, HORARIO, AGORA, FUSO);
    expect(situacao).toMatchObject({
      restaS: -20 * MINUTO,
      vencimento: null,
      grupo: 'parado',
      texto: 'relógio parado',
    });
    const parados = DOZE.filter(([, r]) => r.relogioDesde === null).map(([, r]) =>
      situacaoDoPrazo(r, HORARIO, AGORA, FUSO),
    );
    expect([...parados, situacao].sort(compararPrazos)[0]).toBe(situacao);
  });

  it('o até 2 h vai até o limite, e o hoje é o dia de quem olha', () => {
    const grupo = (relogio: RelogioDoChamado, fuso = FUSO) =>
      situacaoDoPrazo(relogio, HORARIO, AGORA, fuso).grupo;
    expect(grupo(venceEm(2 * HORA))).toBe('ate-2-horas');
    expect(grupo(venceEm(2 * HORA + 1))).toBe('hoje');
    // Vence à 00:30 de quarta em São Paulo, que são 22:30 de terça em Nova York.
    const meiaNoiteEMeia = contando(OUTRO, '2026-11-17T00:30', '2026-11-17T01:00');
    expect(grupo(meiaNoiteEMeia)).toBe('depois-de-hoje');
    expect(grupo(meiaNoiteEMeia, 'America/New_York')).toBe('hoje');
    // Vence às 22:00 de terça em São Paulo, que é 01:00 de quarta em Lisboa.
    const dezDaNoite = contando(OUTRO, '2026-11-16T22:00', '2026-11-16T22:30');
    expect(grupo(dezDaNoite)).toBe('hoje');
    expect(grupo(dezDaNoite, 'Europe/Lisbon')).toBe('depois-de-hoje');
  });

  it('a primeira resposta: no prazo, atrasada a partir dele, dada ou com o relógio parado', () => {
    const aos = (agora: string) =>
      situacaoDoPrazo(doDoze(1042), HORARIO, sp(agora), FUSO).primeiraResposta;
    expect(aos('2026-11-17T08:10')).toEqual({ ate: sp('2026-11-17T08:30'), atrasada: false });
    expect(aos('2026-11-17T08:30')).toEqual({ ate: sp('2026-11-17T08:30'), atrasada: true });
    // Em horas corridas, o #1038, aberto às 03:40, devia a resposta às 04:10.
    expect(situacaoDoPrazo(doDoze(1038), HORARIO, AGORA, FUSO).primeiraResposta).toEqual({
      ate: sp('2026-11-17T04:10'),
      atrasada: true,
    });
    const respondido = { ...doDoze(1042), primeiraRespostaEm: sp('2026-11-17T09:00') };
    expect(situacaoDoPrazo(respondido, HORARIO, AGORA, FUSO).primeiraResposta).toBeNull();
    // Esperar a resposta e resolver mandam mensagem à pessoa: parado, a resposta já foi dada.
    const paradoSemResposta = { ...doDoze(1041), primeiraRespostaEm: null };
    expect(situacaoDoPrazo(paradoSemResposta, HORARIO, AGORA, FUSO).primeiraResposta).toBeNull();
  });
});

describe('compararPrazos', () => {
  it('ordena os 12: o estourado, os que vencem antes e os parados por último, pelo que resta', () => {
    // Na ordem do número, como a lista os entrega; o empate das 11:40 fica nela.
    const porNumero = [...DOZE].sort(([a], [b]) => a - b);
    const ordem = porNumero
      .map(([numero, relogio]) => ({
        numero,
        situacao: situacaoDoPrazo(relogio, HORARIO, AGORA, FUSO),
      }))
      .sort((a, b) => compararPrazos(a.situacao, b.situacao))
      .map(({ numero }) => numero);
    expect(ordem).toEqual([1033, 1039, 1031, 1038, 1037, 1040, 1042, 1034, 1036, 1041, 1032, 1029]);
  });
});
