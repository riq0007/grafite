import { describe, expect, it } from 'vitest';
import { comAlfa, compor, contraste } from './contraste.ts';
import { TINTA_DO_ROTULO } from './escalas.ts';
import { type EntradaDoTema, gerarDados, gerarSituacoes, gerarTema } from './gerador.ts';
import { camadasDeEstado, type Tom } from './papeis.ts';

function temas(): Array<[string, EntradaDoTema]> {
  const lista: Array<[string, EntradaDoTema]> = [
    ['oled', { tom: 'escuro', base: { matiz: 0, croma: 0 }, contraste: 70, oled: true }],
  ];
  for (const tom of ['escuro', 'claro'] as Tom[]) {
    for (let matiz = 0; matiz < 360; matiz += 45) {
      for (const croma of [0, 0.06]) {
        for (const nivel of [0, 45, 100]) {
          lista.push([
            `${tom} ${matiz}/${croma} ${nivel}`,
            { tom, base: { matiz, croma }, contraste: nivel },
          ]);
        }
      }
    }
  }
  return lista;
}

describe('gerarSituacoes: mínimos garantidos', () => {
  it.each(temas())('%s', (_nome, entrada) => {
    const tema = gerarTema(entrada);
    const { cores } = tema;
    const { pressionado } = camadasDeEstado(cores);
    const situacoes = gerarSituacoes(tema);
    for (const [id, s] of Object.entries(situacoes)) {
      const fundos = [
        cores.superficie,
        cores.superficie2,
        cores.fundo,
        compor(cores.material, cores.fundo),
        compor(pressionado, cores.superficie2),
        compor(pressionado, cores.fundo),
        compor(comAlfa(s.cor, TINTA_DO_ROTULO.situacao), cores.superficie),
        compor(comAlfa(s.cor, TINTA_DO_ROTULO.situacao), cores.superficie2),
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
      expect(s.fundo).toBe(comAlfa(s.cor, TINTA_DO_ROTULO.situacao));
      expect(s.borda).toBe(comAlfa(s.cor, 0.4));
    }
  });
});

describe('gerarDados: mínimos garantidos', () => {
  it.each(temas())('%s', (_nome, entrada) => {
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
