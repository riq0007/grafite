import { describe, expect, it } from 'vitest';
import { comAlfa, compor, contraste, luminancia } from './contraste.ts';
import { type EntradaDoDestaque, type EntradaDoTema, gerarDestaque, gerarTema } from './gerador.ts';

const TEMAS: Record<string, EntradaDoTema> = {
  grafite: { tom: 'escuro', base: { matiz: 265, croma: 0.006 }, contraste: 45 },
  'meia-noite': { tom: 'escuro', base: { matiz: 262, croma: 0.035 }, contraste: 45 },
  oled: { tom: 'escuro', base: { matiz: 0, croma: 0 }, contraste: 70, oled: true },
  nevoa: { tom: 'claro', base: { matiz: 260, croma: 0.006 }, contraste: 45 },
  papel: { tom: 'claro', base: { matiz: 80, croma: 0.016 }, contraste: 45 },
  'alto-contraste': { tom: 'claro', base: { matiz: 0, croma: 0 }, contraste: 100 },
  'escuro sem contraste': { tom: 'escuro', base: { matiz: 30, croma: 0.06 }, contraste: 0 },
  'claro sem contraste': { tom: 'claro', base: { matiz: 95, croma: 0.06 }, contraste: 0 },
};

function destaques(): Array<[string, EntradaDoDestaque]> {
  const lista: Array<[string, EntradaDoDestaque]> = [['monocromático', { matiz: 0, croma: 0 }]];
  for (let matiz = 0; matiz < 360; matiz += 15) {
    for (const croma of [0.08, 0.2]) lista.push([`${matiz}/${croma}`, { matiz, croma }]);
  }
  return lista;
}

describe('gerarDestaque: mínimos garantidos', () => {
  const casos = Object.entries(TEMAS).flatMap(([nomeDoTema, tema]) =>
    destaques().map(([nome, destaque]) => [`${nomeDoTema} · ${nome}`, tema, destaque] as const),
  );

  it.each(casos)('%s', (_nome, entradaDoTema, entradaDoDestaque) => {
    const tema = gerarTema(entradaDoTema);
    const d = gerarDestaque(tema, entradaDoDestaque);
    const { cores } = tema;
    for (const fundo of [
      cores.fundo,
      cores.superficie,
      cores.superficie2,
      compor(cores.material, cores.fundo),
    ]) {
      expect(
        contraste(d.destaqueTexto, fundo),
        `texto do destaque sobre ${fundo}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    for (const preenchimento of [d.destaque, d.destaqueHover, d.destaquePressionado]) {
      expect(
        contraste(d.sobreDestaque, preenchimento),
        `sobre ${preenchimento}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    for (const fundo of [cores.fundo, cores.superficie, cores.superficie2]) {
      expect(contraste(d.destaque, fundo), `foco sobre ${fundo}`).toBeGreaterThanOrEqual(3);
    }
    const selecao = compor(comAlfa(d.destaque, 0.13), cores.superficie);
    expect(contraste(cores.texto, selecao)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('gerarDestaque: o monocromático', () => {
  it('no escuro, o preenchimento é quase branco, com o texto escuro sobre ele', () => {
    const tema = gerarTema(TEMAS.grafite as EntradaDoTema);
    const d = gerarDestaque(tema, { matiz: 0, croma: 0 });
    expect(luminancia(d.destaque)).toBeGreaterThan(0.6);
    expect(luminancia(d.sobreDestaque)).toBeLessThan(0.05);
    expect(d.destaqueTexto).toBe(tema.cores.texto);
  });

  it('no claro, o preenchimento é quase preto, com o texto branco', () => {
    const tema = gerarTema(TEMAS.nevoa as EntradaDoTema);
    const d = gerarDestaque(tema, { matiz: 0, croma: 0 });
    expect(luminancia(d.destaque)).toBeLessThan(0.05);
    expect(d.sobreDestaque).toBe('#ffffff');
    expect(d.destaqueTexto).toBe(tema.cores.texto);
  });

  it('o amarelo de croma 0,2 passa no Papel e no OLED', () => {
    for (const nome of ['papel', 'oled']) {
      const tema = gerarTema(TEMAS[nome] as EntradaDoTema);
      const d = gerarDestaque(tema, { matiz: 95, croma: 0.2 });
      expect(contraste(d.sobreDestaque, d.destaque)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(d.destaque, tema.cores.superficie)).toBeGreaterThanOrEqual(3);
    }
  });
});
