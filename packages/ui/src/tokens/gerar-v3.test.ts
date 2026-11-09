import { describe, expect, it } from 'vitest';
import { gerarCss, gerarDtcg, gerarVariaveis } from './gerar.ts';
import { type IdDoTema, temas } from './temas.ts';

/** Declarações do primeiro bloco cujo seletor é exatamente `seletor`. */
function bloco(css: string, seletor: string): Record<string, string> {
  const inicio = css.indexOf(`${seletor} {`);
  if (inicio < 0) throw new Error(`bloco não encontrado: ${seletor}`);
  const corpo = css.slice(css.indexOf('{', inicio) + 1, css.indexOf('}', inicio));
  return Object.fromEntries(
    corpo
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]),
  );
}

const css = gerarCss();
const ids = Object.keys(temas) as IdDoTema[];

describe('as variáveis da fundamentos-v3', () => {
  it('o raio de fábrica é 10 px, e a escala ganha a legenda e o numeral', () => {
    const raiz = bloco(css, ':root');
    expect(raiz['--raio-base']).toBe('10px');
    expect(raiz['--texto-legenda']).toBe('11px');
    expect(raiz['--texto-numeral']).toBe('28px');
  });

  it.each(ids)('o tema %s traz as quatro superfícies e as duas sombras', (id) => {
    const tema = bloco(css, `[data-theme="${id}"]`);
    expect(tema['--cor-superficie-afundada']).toBe(temas[id].cores.superficieAfundada);
    expect(tema['--cor-superficie-elevada']).toBe(temas[id].cores.superficieElevada);
    expect(tema['--sombra-elevada']).toBe(temas[id].sombraElevada);
    expect(tema['--sombra-sobreposta']).toBe(temas[id].sombraMaterial);
    expect(tema['--sombra-material']).toBe(temas[id].sombraMaterial);
  });

  it.each(ids)('o tema %s traz as situações completas', (id) => {
    const tema = bloco(css, `[data-theme="${id}"]`);
    for (const [situacao, cores] of Object.entries(temas[id].situacoes)) {
      expect(tema[`--cor-${situacao}`]).toBe(cores.cor);
      expect(tema[`--cor-${situacao}-fundo`]).toBe(cores.fundo);
      expect(tema[`--cor-${situacao}-borda`]).toBe(cores.borda);
      expect(tema[`--cor-${situacao}-forte`]).toBe(cores.forte);
      expect(tema[`--cor-sobre-${situacao}`]).toBe(cores.sobre);
    }
  });

  it.each(ids)('o tema %s traz as oito séries e as quatro tintas', (id) => {
    const tema = bloco(css, `[data-theme="${id}"]`);
    temas[id].dados.series.forEach((serie, indice) => {
      expect(tema[`--cor-serie-${indice + 1}`]).toBe(serie);
    });
    for (const [tinta, cor] of Object.entries(temas[id].dados.tintas)) {
      expect(tema[`--cor-tinta-${tinta}`]).toBe(cor);
    }
  });

  it(':root traz os papéis novos do tema de fábrica', () => {
    const raiz = bloco(css, ':root');
    expect(raiz['--cor-ok-fundo']).toBe(temas.grafite.situacoes.ok.fundo);
    expect(raiz['--cor-serie-1']).toBe(temas.grafite.dados.series[0]);
    expect(raiz['--cor-tinta-amarelo']).toBe(temas.grafite.dados.tintas.amarelo);
    expect(raiz['--cor-superficie-elevada']).toBe(temas.grafite.cores.superficieElevada);
  });

  it('o DTCG traz os papéis novos, com o nome da variável de cada um', () => {
    const dtcg = gerarDtcg();
    const variaveis = new Set(gerarVariaveis());
    for (const nome of ['ok-fundo', 'critico-forte', 'sobre-atencao', 'serie-8', 'tinta-preto']) {
      const css = dtcg.cor[nome]?.$extensions?.['grafite.css'];
      expect(css, nome).toBe(`--cor-${nome}`);
      expect(variaveis.has(css ?? '')).toBe(true);
    }
    expect(dtcg.texto.numeral?.$value).toBe('28px');
    expect(dtcg.sombra?.elevada?.$extensions?.['grafite.css']).toBe('--sombra-elevada');
  });
});
