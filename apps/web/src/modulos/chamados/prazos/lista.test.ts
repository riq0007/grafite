// A lista dos prazos (spec modulo-chamados, "Prazos"; change chamados-da-ti, design, "A lista dos
// prazos (tarefa 5.15)"; mockup m05): os grupos pela situação do prazo no momento da tela, com o
// prazo ilegível por último, a ordem de cada grupo, os selos do alto, a escala e a barra de cada
// chamado, em segundos do relógio.
import { criarDataHora } from '@grafite/ui';
import { describe, expect, it } from 'vitest';
import {
  AGORA_DOS_MOCKUPS,
  BRUNO,
  CHAMADOS_DOS_MOCKUPS,
  chamadoNosPrazos,
  correndo,
  FUSO_DOS_MOCKUPS,
  PRAZOS_DOS_MOCKUPS,
  parado,
  sp,
} from '../../../teste/chamados.ts';
import type { ChamadoNosPrazos } from '../consultas.ts';
import { contadorDoPrazo } from '../prazo.ts';
import {
  barraDoPrazo,
  type GrupoDosPrazos,
  gruposDosPrazos,
  MARCAS_DA_ESCALA,
  marcasDaEscala,
  quemNaLinha,
  selosDosPrazos,
} from './lista.ts';

const dataHora = criarDataHora(FUSO_DOS_MOCKUPS);
const { horario } = PRAZOS_DOS_MOCKUPS;

const grupos = (chamados: readonly ChamadoNosPrazos[], agora = AGORA_DOS_MOCKUPS) =>
  gruposDosPrazos(chamados, {
    horario,
    contar: contadorDoPrazo(agora, FUSO_DOS_MOCKUPS),
    agora,
    dataHora,
  });

/** Cada grupo pelo título, pelo apoio e pelos números, na ordem da tela. */
const resumo = (lista: GrupoDosPrazos[]) =>
  lista.map(({ titulo, apoio, linhas }) => [
    titulo,
    apoio,
    linhas.map(({ chamado }) => chamado.numero),
  ]);

const ilegivel = (numero: number) =>
  chamadoNosPrazos(numero, 'outro', 'Cadeira quebrada na Recepção', {
    pessoa: 'Paulo Nunes',
    responsavel: BRUNO,
    abertoEm: sp('2026-11-11T08:00:00'),
    relogio: null,
  });

const situacao = (relogio: ReturnType<typeof correndo>) =>
  contadorDoPrazo(AGORA_DOS_MOCKUPS, FUSO_DOS_MOCKUPS)(relogio, horario);

const doMockup = (numero: number) => {
  const chamado = CHAMADOS_DOS_MOCKUPS.find((um) => um.numero === numero);
  if (!chamado) throw new Error(`Sem o #${numero} nos mockups.`);
  return chamado;
};

describe('os grupos da lista', () => {
  it('os do m05, às 09:40: cada um pelo vencimento, o empate pelo número, e os parados pelo que resta', () => {
    expect(resumo(grupos(CHAMADOS_DOS_MOCKUPS))).toEqual([
      ['Estourado', 'passou do prazo e ainda está aberto', [1033]],
      ['Vence em até 2 horas', 'até as 11:40', [1039, 1031, 1038]],
      ['Vence hoje', 'depois das 11:40', [1037, 1040, 1042, 1034, 1036]],
      [
        'Relógio parado',
        'aguardando o colaborador: o prazo volta a contar ao retomar',
        [1041, 1032, 1029],
      ],
    ]);
  });

  it('o prazo ilegível vai por último, pelo número, e o que vence amanhã, antes dos parados', () => {
    const amanha = chamadoNosPrazos(1050, 'software', 'Instalar o leitor de PDF', {
      pessoa: 'Camila Rezende',
      responsavel: null,
      abertoEm: sp('2026-11-11T09:00:00'),
      relogio: correndo(24, 20 * 60),
    });
    const lista = grupos([ilegivel(1049), ...CHAMADOS_DOS_MOCKUPS, amanha, ilegivel(1045)]);
    expect(resumo(lista).slice(-3)).toEqual([
      ['Vence depois de hoje', null, [1050]],
      [
        'Relógio parado',
        'aguardando o colaborador: o prazo volta a contar ao retomar',
        [1041, 1032, 1029],
      ],
      ['Prazo ilegível', 'o prazo guardado no chamado não se lê', [1045, 1049]],
    ]);
    expect(lista.at(-1)?.linhas.map((linha) => linha.situacao)).toEqual([null, null]);
  });

  it('só o grupo com chamados tem faixa', () => {
    const parados = CHAMADOS_DOS_MOCKUPS.filter((chamado) => chamado.grupo === 'parado');
    expect(resumo(grupos(parados)).map(([titulo]) => titulo)).toEqual(['Relógio parado']);
    expect(grupos([])).toEqual([]);
  });

  it('uma hora depois, o grupo, a ordem e o apoio andam com o agora', () => {
    const lista = grupos(CHAMADOS_DOS_MOCKUPS, sp('2026-11-11T10:40:00'));
    expect(resumo(lista).slice(0, 2)).toEqual([
      ['Estourado', 'passou do prazo e ainda está aberto', [1033, 1039]],
      ['Vence em até 2 horas', 'até as 12:40', [1031, 1038]],
    ]);
  });

  it('perto da meia-noite, o limite das 2 h é o de amanhã', () => {
    // Prazo de 24 h que vence à 00:30 de amanhã: às 23:00, falta 1 h 30 min.
    const madrugada = chamadoNosPrazos(1051, 'rede', 'Link da filial caindo', {
      pessoa: 'Tiago Moura',
      responsavel: null,
      abertoEm: sp('2026-11-11T00:30:00'),
      relogio: correndo(24, 14 * 60 + 50),
    });
    expect(resumo(grupos([madrugada], sp('2026-11-11T23:00:00')))).toEqual([
      ['Vence em até 2 horas', 'até amanhã, 01:00', [1051]],
    ]);
  });

  it('com o painel aberto, a lista compacta leva o apoio curto do m06', () => {
    const compacta = gruposDosPrazos([...CHAMADOS_DOS_MOCKUPS, ilegivel(1045)], {
      horario,
      contar: contadorDoPrazo(AGORA_DOS_MOCKUPS, FUSO_DOS_MOCKUPS),
      agora: AGORA_DOS_MOCKUPS,
      dataHora,
      compacto: true,
    });
    expect(compacta.map(({ titulo, apoio }) => [titulo, apoio])).toEqual([
      ['Estourado', 'passou do prazo'],
      ['Vence em até 2 horas', 'até as 11:40'],
      ['Vence hoje', 'depois das 11:40'],
      ['Relógio parado', 'aguardando o colaborador'],
      ['Prazo ilegível', 'o prazo guardado no chamado não se lê'],
    ]);
  });
});

describe('os selos do alto', () => {
  it('os três do m05, na marca de cada grupo', () => {
    expect(selosDosPrazos(grupos(CHAMADOS_DOS_MOCKUPS))).toEqual([
      { selo: 'estourado', texto: '1 estourado' },
      { selo: 'ate-2-horas', texto: '3 vencem em até 2 h' },
      { selo: 'parado', texto: '3 com o relógio parado' },
    ]);
  });

  it('no plural e no singular, sem o selo zerado e sem contar o prazo ilegível', () => {
    const lista = grupos(
      [...CHAMADOS_DOS_MOCKUPS, ilegivel(1045)],
      sp('2026-11-11T10:40:00'),
    ).filter(({ grupo }) => grupo !== 'parado');
    expect(selosDosPrazos(lista)).toEqual([
      { selo: 'estourado', texto: '2 estourados' },
      { selo: 'ate-2-horas', texto: '2 vencem em até 2 h' },
    ]);
    const umDeCada = grupos([doMockup(1031), doMockup(1029)]);
    expect(selosDosPrazos(umDeCada)).toEqual([
      { selo: 'ate-2-horas', texto: '1 vence em até 2 h' },
      { selo: 'parado', texto: '1 com o relógio parado' },
    ]);
  });
});

describe('a escala e a barra', () => {
  it('a escala vai de −10 h a +8 h, de 2 em 2 h, com o agora', () => {
    expect(MARCAS_DA_ESCALA.map(({ texto }) => texto)).toEqual([
      '−10 h',
      '−8 h',
      '−6 h',
      '−4 h',
      '−2 h',
      'agora',
      '+2 h',
      '+4 h',
      '+6 h',
      '+8 h',
    ]);
    expect(MARCAS_DA_ESCALA[0]?.posicao).toBe(0);
    expect(MARCAS_DA_ESCALA[5]?.posicao).toBeCloseTo(55.556, 2);
    expect(MARCAS_DA_ESCALA[9]?.posicao).toBe(100);
    // Na lista compacta, a do painel aberto, de 4 em 4 h, como no m06.
    expect(marcasDaEscala(4).map(({ texto }) => texto)).toEqual([
      '−8 h',
      '−4 h',
      'agora',
      '+4 h',
      '+8 h',
    ]);
    // No Início, de 8 em 8 h, como no m12.
    expect(marcasDaEscala(8).map(({ texto }) => texto)).toEqual(['−8 h', 'agora', '+8 h']);
    expect(marcasDaEscala(2)).toEqual(MARCAS_DA_ESCALA);
  });

  it('o estourado do #1033: o gasto até a marca do prazo e o hachurado dela até o agora', () => {
    const barra = barraDoPrazo(situacao(correndo(8, -20)));
    expect(barra?.tom).toBe('critico');
    expect(barra?.gasto.de).toBeCloseTo(9.259, 2);
    expect(barra?.gasto.ate).toBeCloseTo(53.704, 2);
    expect(barra?.estouro?.de).toBeCloseTo(53.704, 2);
    expect(barra?.estouro?.ate).toBeCloseTo(55.556, 2);
    expect(barra?.resta).toBeNull();
    expect(barra?.marca).toBeCloseTo(53.704, 2);
    expect(barra?.alemDaEscala).toBe(false);
  });

  it('o #1039, que vence em 1 h: o gasto até o agora e o que resta até a marca, na atenção', () => {
    const barra = barraDoPrazo(situacao(correndo(5, 60)));
    expect(barra?.tom).toBe('atencao');
    expect(barra?.gasto.de).toBeCloseTo(33.333, 2);
    expect(barra?.gasto.ate).toBeCloseTo(55.556, 2);
    expect(barra?.resta?.de).toBeCloseTo(55.556, 2);
    expect(barra?.resta?.ate).toBeCloseTo(61.111, 2);
    expect(barra?.estouro).toBeNull();
    expect(barra?.marca).toBeCloseTo(61.111, 2);
  });

  it('o que passa da escala fica cortado na borda, e a marca além do +8 h vira a seta', () => {
    const noLimite = barraDoPrazo(situacao(correndo(24, 8 * 60)));
    expect(noLimite?.tom).toBe('neutro');
    expect(noLimite?.gasto.de).toBe(0);
    expect(noLimite?.marca).toBe(100);
    expect(noLimite?.alemDaEscala).toBe(false);
    const alem = barraDoPrazo(situacao(correndo(24, 10 * 60)));
    expect(alem?.resta?.ate).toBe(100);
    expect(alem?.marca).toBe(100);
    expect(alem?.alemDaEscala).toBe(true);
    const longe = barraDoPrazo(situacao(correndo(8, -12 * 60)));
    expect(longe?.gasto).toEqual({ de: 0, ate: 0 });
    expect(longe?.estouro?.de).toBe(0);
    expect(longe?.marca).toBe(0);
  });

  it('o relógio parado fica sem a barra', () => {
    expect(barraDoPrazo(situacao(parado(4, 2 * 60 + 16)))).toBeNull();
  });
});

describe('quem na linha', () => {
  it('quem pediu e o primeiro nome de quem atende, ou "sem responsável"', () => {
    expect(quemNaLinha(doMockup(1033))).toBe('Sandra Vieira · Renato');
    expect(quemNaLinha(doMockup(1038))).toBe('Helena Prado · sem responsável');
  });
});
