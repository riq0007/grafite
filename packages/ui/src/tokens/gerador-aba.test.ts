// As cores da aba dos chamados (spec design-tokens, "Cores da aba"; change chamados-da-ti, design,
// decisão 16): na matiz da informação, com a luminosidade e o croma dos mockups aprovados, os canais
// cortados como o navegador mostrou o mockup, e o contorno, que nos temas claros é o próprio fundo.
import { describe, expect, it } from 'vitest';
import { nomeDaEntrada, varredura } from '../teste/varredura.ts';
import { compor, contraste } from './contraste.ts';
import { gerarAba, gerarTema, MATIZES_DAS_SITUACOES } from './gerador.ts';
import { oklchParaHexCortando } from './oklch.ts';
import { camadasDeEstado } from './papeis.ts';
import { temas } from './temas.ts';

const INFO = MATIZES_DAS_SITUACOES.info.matiz;
const ATENCAO = MATIZES_DAS_SITUACOES.atencao.matiz;
const ESCURO = gerarTema({ tom: 'escuro', base: { matiz: 265, croma: 0.006 }, contraste: 45 });
const CLARO = gerarTema({ tom: 'claro', base: { matiz: 80, croma: 0.016 }, contraste: 45 });

describe('gerarAba: as cores do mockup', () => {
  it('o fundo, o fundo 2, o bloco e o texto, na matiz da informação', () => {
    const aba = gerarAba(ESCURO);
    expect(aba.fundo).toBe(oklchParaHexCortando({ l: 0.42, c: 0.16, h: INFO }));
    expect(aba.fundo2).toBe(oklchParaHexCortando({ l: 0.34, c: 0.13, h: INFO }));
    expect(aba.bloco).toBe(oklchParaHexCortando({ l: 0.49, c: 0.165, h: INFO }));
    expect(aba.texto).toBe(oklchParaHexCortando({ l: 0.985, c: 0.012, h: INFO }));
  });

  it('o fundo e o bloco são os azuis que o navegador mostrou no mockup aprovado', () => {
    const aba = gerarAba(ESCURO);
    expect([aba.fundo, aba.bloco]).toEqual(['#004f9d', '#0064b6']);
  });

  it('a atenção da aba e o texto sobre ela, na matiz da atenção', () => {
    const aba = gerarAba(ESCURO);
    expect(aba.atencao).toBe(oklchParaHexCortando({ l: 0.8, c: 0.145, h: ATENCAO }));
    expect(aba.sobreAtencao).toBe(oklchParaHexCortando({ l: 0.2, c: 0.04, h: ATENCAO }));
  });

  it('o contorno claro nos temas escuros e, nos claros, o próprio fundo, como o mockup no Papel', () => {
    expect(gerarAba(ESCURO).contorno).toBe(oklchParaHexCortando({ l: 0.8, c: 0.1, h: INFO }));
    expect(gerarAba(CLARO).contorno).toBe(gerarAba(CLARO).fundo);
  });

  it('fora o contorno, a aba é a mesma nos dois tons', () => {
    const { contorno: _escuro, ...noEscuro } = gerarAba(ESCURO);
    const { contorno: _claro, ...noClaro } = gerarAba(CLARO);
    expect(noClaro).toEqual(noEscuro);
  });

  it('cada tema de fábrica traz a aba do tom dele', () => {
    expect(temas.papel.aba).toEqual(gerarAba(CLARO));
    expect(temas.grafite.aba).toEqual(gerarAba(ESCURO));
    expect(temas['alto-contraste'].aba.contorno).toBe(temas['alto-contraste'].aba.fundo);
    expect(temas.oled.aba.contorno).not.toBe(temas.oled.aba.fundo);
  });
});

describe('gerarAba: mínimos garantidos', () => {
  it.each(varredura().map((e) => [nomeDaEntrada(e), e] as const))('%s', (_nome, entrada) => {
    const tema = gerarTema(entrada);
    const { cores } = tema;
    const aba = gerarAba(tema);
    const { pressionado } = camadasDeEstado(cores);
    for (const fundo of [
      aba.fundo,
      compor(pressionado, aba.fundo),
      aba.fundo2,
      aba.bloco,
      compor(pressionado, aba.bloco),
    ]) {
      expect(contraste(aba.texto, fundo), `texto da aba sobre ${fundo}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
    expect(contraste(aba.sobreAtencao, aba.atencao), 'o selo').toBeGreaterThanOrEqual(4.5);
    for (const superficie of [cores.superficie, cores.superficie2, cores.superficieElevada]) {
      expect(
        contraste(aba.contorno, superficie),
        `contorno contra ${superficie}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});
