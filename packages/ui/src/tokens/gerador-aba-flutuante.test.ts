// A aba do Windows (change aba-dos-colaboradores, design, decisão 9): o azul, o texto e o âmbar da
// aba dos chamados; o fio claro nos dois temas; o que muda entre o escuro e o claro é só o que fica
// por fora da forma; no alto contraste, só as cores do sistema.
import { describe, expect, it } from 'vitest';
import { comAlfa } from './contraste.ts';
import {
  AREA_DO_WINDOWS,
  avaliarAbaFlutuante,
  CORES_DO_SISTEMA_DE_REFERENCIA,
  coresDaAbaNoWindows,
  PARES_DA_ABA_FLUTUANTE,
} from './contraste-pares.ts';
import {
  gerarAba,
  gerarAbaFlutuante,
  gerarTema,
  MATIZES_DAS_SITUACOES,
  type TemaDoWindows,
} from './gerador.ts';
import { oklchParaHexCortando } from './oklch.ts';

const INFO = MATIZES_DAS_SITUACOES.info.matiz;
const ABA_DOS_CHAMADOS = gerarAba(
  gerarTema({ tom: 'escuro', base: { matiz: 265, croma: 0.006 }, contraste: 45 }),
);
const ESCURO = gerarAbaFlutuante('escuro');
const CLARO = gerarAbaFlutuante('claro');
const TEMAS: TemaDoWindows[] = ['escuro', 'claro', 'altoContraste'];

describe('gerarAbaFlutuante', () => {
  it('o azul, o texto e o âmbar são os da aba dos chamados', () => {
    for (const nome of ['fundo', 'fundo2', 'bloco', 'texto', 'atencao', 'sobreAtencao'] as const) {
      expect(ESCURO[nome], nome).toBe(ABA_DOS_CHAMADOS[nome]);
    }
  });

  it('o fio claro do mockup vale no Windows escuro e no claro', () => {
    expect(ESCURO.contorno).toBe(ABA_DOS_CHAMADOS.contorno);
    expect(CLARO.contorno).toBe(ESCURO.contorno);
  });

  it('o que é novo sai da luminosidade e do croma do mockup, na matiz da informação', () => {
    const na = (l: number, c: number) => oklchParaHexCortando({ l, c, h: INFO });
    expect(ESCURO.blocoSobMouse).toBe(na(0.52, 0.165));
    expect(ESCURO.segundoTom).toBe(na(0.975, 0.025));
    expect(ESCURO.neutro).toBe(na(0.42, 0.018));
    expect(ESCURO.neutro2).toBe(na(0.34, 0.014));
    expect(ESCURO.neutroBloco).toBe(na(0.49, 0.02));
    expect(ESCURO.neutroContorno).toBe(na(0.8, 0.014));
  });

  it('a opção larga é o texto, com o fundo 2 por cima, e o foco é o anel na cor do texto', () => {
    expect(ESCURO.opcaoLarga).toBe(ESCURO.texto);
    expect(ESCURO.sobreOpcaoLarga).toBe(ESCURO.fundo2);
    expect(ESCURO.foco).toBe(ESCURO.texto);
  });

  it('do escuro para o claro, mudam só o fio escuro por fora, a sombra e o anel do mouse', () => {
    const { fioEscuro: _f1, sombra: _s1, anel: _a1, ...noEscuro } = ESCURO;
    const { fioEscuro: _f2, sombra: _s2, anel: _a2, ...noClaro } = CLARO;
    expect(noClaro).toEqual(noEscuro);
    expect(CLARO.fioEscuro).not.toBe(ESCURO.fioEscuro);
    expect(ESCURO.anel).toBe(comAlfa(ESCURO.contorno, 0.28));
    expect(CLARO.anel).toBe(comAlfa(CLARO.fundo, 0.34));
  });

  it('no alto contraste, todas as cores são do sistema', () => {
    for (const [nome, cor] of Object.entries(gerarAbaFlutuante('altoContraste'))) {
      expect(Object.keys(CORES_DO_SISTEMA_DE_REFERENCIA), nome).toContain(cor);
    }
  });
});

describe('o contraste da aba nos três temas do Windows', () => {
  it('mede o alto contraste com as cores de referência, sem nome de cor do sistema', () => {
    const cores = coresDaAbaNoWindows('altoContraste');
    expect(cores.fundo).toBe('#000000');
    expect(cores.opcaoLarga).toBe('#1aebff');
    expect(Object.values(cores).every((cor) => cor.startsWith('#') || cor.startsWith('rgba'))).toBe(
      true,
    );
  });

  it('cada tema mede os pares dele, sobre a área do Windows daquele tema', () => {
    const resultados = avaliarAbaFlutuante();
    for (const tema of TEMAS) {
      const usos = resultados.filter((r) => r.tema === tema).map((r) => r.uso);
      const esperados = PARES_DA_ABA_FLUTUANTE.filter((p) => !p.temas || p.temas.includes(tema));
      expect(usos).toEqual(esperados.map((p) => p.uso));
    }
    expect(coresDaAbaNoWindows('claro').area).toBe(AREA_DO_WINDOWS.claro);
    expect(resultados.some((r) => r.tema === 'claro' && r.uso === 'fio claro sobre a área')).toBe(
      false,
    );
  });

  it('passa em todos os pares, nos três temas', () => {
    const reprovados = avaliarAbaFlutuante()
      .filter((r) => !r.passou)
      .map((r) => `${r.tema}: ${r.uso} = ${r.razao} (mínimo ${r.minimo})`);
    expect(reprovados).toEqual([]);
  });

  it('os números do mockup: texto sobre o azul 7,7:1, sobre a opção 5,7:1, fio sobre o azul 4,4:1', () => {
    const razao = (uso: string) =>
      avaliarAbaFlutuante().find((r) => r.tema === 'escuro' && r.uso === uso)?.razao;
    expect(razao('texto sobre o azul')).toBeCloseTo(7.7, 1);
    expect(razao('texto sobre a opção')).toBeCloseTo(5.7, 1);
    expect(razao('fio sobre o azul')).toBeCloseTo(4.4, 1);
    expect(razao('texto sobre o neutro (sem conexão)')).toBeCloseTo(8.1, 1);
  });
});
