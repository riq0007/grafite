import { describe, expect, it } from 'vitest';
import { nomeDaEntrada, varredura } from '../teste/varredura.ts';
import { comAlfa, compor, contraste } from './contraste.ts';
import {
  type CoresDaSituacaoGerada,
  type CoresGeradas,
  gerarDados,
  gerarSituacoes,
  gerarTema,
  type IdDaSituacao,
  MATIZES_DAS_SITUACOES,
} from './gerador.ts';
import { distancia, distanciaNoCroma, oklchParaHex } from './oklch.ts';
import { camadasDeEstado, type Tom } from './papeis.ts';
import { type IdDoTema, temas } from './temas.ts';

const entradas = varredura().map((e) => [nomeDaEntrada(e), e] as const);

const situacoesDe = (situacoes: Record<IdDaSituacao, CoresDaSituacaoGerada>) =>
  Object.entries(situacoes) as Array<[IdDaSituacao, CoresDaSituacaoGerada]>;

/** A fonte da tinta: a cor da situação na luminosidade 0,7 nos temas claros e 0,8 nos escuros. */
const fonteDaTinta = (id: IdDaSituacao, tom: Tom) =>
  oklchParaHex({
    l: tom === 'claro' ? 0.7 : 0.8,
    c: MATIZES_DAS_SITUACOES[id].croma,
    h: MATIZES_DAS_SITUACOES[id].matiz,
  });

/** A tinta do fundo sutil, em pontos percentuais: o alfa do `rgba()`. */
const tintaDe = (fundo: string) =>
  Math.round(Number(fundo.slice(fundo.lastIndexOf(',') + 1, -1)) * 100);

/**
 * A menor distância do fundo sutil aos neutros, no plano do croma e no OKLab inteiro, nos doze
 * pares: o fundo composto sobre a superfície e sobre a superfície 2, contra o fundo da janela, a
 * afundada, a superfície, a superfície 2 e o rótulo neutro sobre as duas (change
 * ajustes-dos-tokens, design, decisão 2).
 */
function menorDistancia(cores: CoresGeradas, fundo: string) {
  const rotuloNeutro = comAlfa(cores.texto2, 0.1);
  const neutros = [
    cores.fundo,
    cores.superficieAfundada,
    cores.superficie,
    cores.superficie2,
    compor(rotuloNeutro, cores.superficie),
    compor(rotuloNeutro, cores.superficie2),
  ];
  const pares = [cores.superficie, cores.superficie2].flatMap((base) => {
    const composto = compor(fundo, base);
    return neutros.map((neutro) => ({
      croma: distanciaNoCroma(composto, neutro),
      total: distancia(composto, neutro),
    }));
  });
  return {
    croma: Math.min(...pares.map((p) => p.croma)),
    total: Math.min(...pares.map((p) => p.total)),
  };
}

/** A regra: 0,02 no croma e, nos temas claros, também 0,03 no OKLab inteiro. */
const longeDosNeutros = (tom: Tom, d: { croma: number; total: number }) =>
  d.croma >= 0.02 && (tom === 'escuro' || d.total >= 0.03);

describe('gerarSituacoes: mínimos garantidos', () => {
  it.each(entradas)('%s', (_nome, entrada) => {
    const tema = gerarTema(entrada);
    const { cores } = tema;
    const { pressionado } = camadasDeEstado(cores);
    for (const [id, s] of situacoesDe(gerarSituacoes(tema))) {
      const fonte = fonteDaTinta(id, entrada.tom);
      const tinta = tintaDe(s.fundo);
      expect(s.fundo, `${id}: a fonte da tinta, numa tinta inteira`).toBe(
        comAlfa(fonte, tinta / 100),
      );
      expect(tinta, `${id}: a tinta`).toBeGreaterThanOrEqual(15);
      expect(tinta, `${id}: a tinta`).toBeLessThanOrEqual(30);
      if (tinta < 30) {
        const d = menorDistancia(cores, s.fundo);
        expect(
          longeDosNeutros(entrada.tom, d),
          `${id} a ${tinta}%: ${d.croma} no croma e ${d.total} no total`,
        ).toBe(true);
      }
      for (let menor = 15; menor < tinta; menor++) {
        const d = menorDistancia(cores, comAlfa(fonte, menor / 100));
        expect(longeDosNeutros(entrada.tom, d), `${id}: a ${menor}% já passava`).toBe(false);
      }
      if (entrada.base.croma === 0) {
        expect(tinta, `${id}: a base neutra chega à distância antes do teto`).toBeLessThan(30);
      }
      const fundos = [
        cores.superficie,
        cores.superficie2,
        cores.fundo,
        compor(cores.material, cores.fundo),
        compor(pressionado, cores.superficie2),
        compor(pressionado, cores.fundo),
        compor(s.fundo, cores.superficie),
        compor(s.fundo, cores.superficie2),
      ];
      for (const fundo of fundos) {
        expect(contraste(s.cor, fundo), `${id} sobre ${fundo}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contraste(s.sobre, s.forte),
        `${id}: texto sobre o preenchimento`,
      ).toBeGreaterThanOrEqual(4.5);
      for (const fundo of [cores.superficie, cores.superficie2]) {
        expect(
          contraste(s.forte, fundo),
          `${id}: preenchimento sobre ${fundo}`,
        ).toBeGreaterThanOrEqual(3);
      }
      expect(s.borda).toBe(comAlfa(s.cor, 0.4));
    }
  });
});

// O cenário "Base na matiz de uma situação" da spec design-tokens: a base clara de matiz 30, perto
// da do crítico (25).
describe('gerarSituacoes: a base na matiz de uma situação', () => {
  it('o crítico fica no teto, com o texto legível e a borda na cor dele', () => {
    const tema = gerarTema({ tom: 'claro', base: { matiz: 30, croma: 0.06 }, contraste: 45 });
    const { cores } = tema;
    const { critico } = gerarSituacoes(tema);
    const fonte = fonteDaTinta('critico', 'claro');
    for (let tinta = 15; tinta <= 30; tinta++) {
      const d = menorDistancia(cores, comAlfa(fonte, tinta / 100));
      expect(d.croma, `a ${tinta}%, no croma`).toBeLessThan(0.02);
    }
    expect(critico.fundo).toBe(comAlfa(fonte, 0.3));
    for (const base of [cores.superficie, cores.superficie2]) {
      expect(contraste(critico.cor, compor(critico.fundo, base))).toBeGreaterThanOrEqual(4.5);
    }
    expect(critico.borda).toBe(comAlfa(critico.cor, 0.4));
  });
});

describe('gerarSituacoes: os temas de fábrica', () => {
  const ids = Object.keys(temas) as IdDoTema[];

  /** A tinta de cada situação (change ajustes-dos-tokens, design, decisão 3). */
  const TINTAS: Record<IdDoTema, Record<IdDaSituacao, number>> = {
    grafite: { ok: 15, atencao: 15, critico: 15, info: 17 },
    'meia-noite': { ok: 15, atencao: 15, critico: 15, info: 24 },
    oled: { ok: 15, atencao: 15, critico: 15, info: 15 },
    nevoa: { ok: 21, atencao: 19, critico: 19, info: 27 },
    papel: { ok: 21, atencao: 26, critico: 23, info: 23 },
    'alto-contraste': { ok: 22, atencao: 19, critico: 21, info: 25 },
  };

  /** A cor do texto das situações antes da change, que ela não muda. */
  const ESCUROS = { ok: '#75d78d', atencao: '#f2af48', critico: '#ffa098', info: '#80c5ff' };
  const CLAROS = { ok: '#00682d', atencao: '#7b5100', critico: '#ab2428', info: '#005d95' };
  const TEXTO: Record<IdDoTema, Record<IdDaSituacao, string>> = {
    grafite: ESCUROS,
    'meia-noite': ESCUROS,
    oled: ESCUROS,
    nevoa: CLAROS,
    papel: CLAROS,
    'alto-contraste': { ok: '#00622a', atencao: '#754d00', critico: '#a51e24', info: '#00588e' },
  };

  it.each(ids)('o tema %s tem a tinta de cada situação, longe dos neutros', (id) => {
    const { tom, cores, situacoes } = temas[id];
    for (const [situacao, s] of situacoesDe(situacoes)) {
      expect(tintaDe(s.fundo), `${situacao}: a tinta`).toBe(TINTAS[id][situacao]);
      const d = menorDistancia(cores, s.fundo);
      expect(d.croma, `${situacao}: no croma`).toBeGreaterThanOrEqual(0.02);
      if (tom === 'claro') {
        expect(d.total, `${situacao}: no OKLab inteiro`).toBeGreaterThanOrEqual(0.03);
      }
    }
  });

  it.each(ids)('o tema %s tem a mesma cor do texto das situações', (id) => {
    const { tom, situacoes } = temas[id];
    for (const [situacao, s] of situacoesDe(situacoes)) {
      expect(s.cor, situacao).toBe(TEXTO[id][situacao]);
      // Nos temas escuros, a fonte é a própria cor do texto: com 15%, o fundo é o de antes.
      if (tom === 'escuro' && TINTAS[id][situacao] === 15) {
        expect(s.fundo, `${situacao}: o fundo de 15%`).toBe(comAlfa(TEXTO[id][situacao], 0.15));
      }
    }
  });

  // A elevada fica fora dos neutros, pela medida (change ajustes-dos-tokens, design, decisão 2).
  it.each(ids)('no tema %s, o fundo sutil sobre a elevada fica longe dela e legível', (id) => {
    const { cores, situacoes } = temas[id];
    for (const [situacao, s] of situacoesDe(situacoes)) {
      const naElevada = compor(s.fundo, cores.superficieElevada);
      expect(
        distanciaNoCroma(naElevada, cores.superficieElevada),
        `${situacao}: da elevada`,
      ).toBeGreaterThanOrEqual(0.02);
      expect(
        distanciaNoCroma(naElevada, cores.superficie2),
        `${situacao}: da superfície 2`,
      ).toBeGreaterThanOrEqual(0.02);
      expect(contraste(s.cor, naElevada), `${situacao}: o texto`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('gerarDados: mínimos garantidos', () => {
  it.each(entradas)('%s', (_nome, entrada) => {
    const tema = gerarTema(entrada);
    const { cores } = tema;
    const { series, tintas } = gerarDados(tema);
    expect(series).toHaveLength(8);
    expect(new Set(series).size).toBe(8);
    for (const serie of series) {
      expect(contraste(serie, cores.superficie), `série ${serie}`).toBeGreaterThanOrEqual(3);
    }
    for (const [nome, tinta] of Object.entries(tintas)) {
      for (const fundo of [cores.superficie, cores.superficie2, cores.superficieAfundada]) {
        expect(contraste(tinta, fundo), `tinta ${nome} sobre ${fundo}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('as tintas são as quatro dos suprimentos', () => {
    const tema = gerarTema({ tom: 'escuro', base: { matiz: 265, croma: 0.006 }, contraste: 45 });
    expect(Object.keys(gerarDados(tema).tintas)).toEqual(['ciano', 'magenta', 'amarelo', 'preto']);
  });
});
