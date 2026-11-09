import { describe, expect, it } from 'vitest';
import { comAlfa, compor, contraste, luminancia } from './contraste.ts';
import { type EntradaDoTema, gerarTema } from './gerador.ts';
import { camadasDeEstado, OPACIDADE_DO_ANEL, type Tom } from './papeis.ts';

/** Todas as entradas da varredura: matizes de 15 em 15, três cromas e três contrastes por tom. */
function varredura(): EntradaDoTema[] {
  const entradas: EntradaDoTema[] = [];
  for (const tom of ['escuro', 'claro'] as Tom[]) {
    for (let matiz = 0; matiz < 360; matiz += 15) {
      for (const croma of [0, 0.03, 0.06]) {
        for (const nivel of [0, 45, 100]) {
          entradas.push({ tom, base: { matiz, croma }, contraste: nivel });
        }
      }
    }
  }
  entradas.push({ tom: 'escuro', base: { matiz: 0, croma: 0 }, contraste: 70, oled: true });
  return entradas;
}

const nome = (e: EntradaDoTema) =>
  `${e.tom} ${e.base.matiz}/${e.base.croma} contraste ${e.contraste}${e.oled ? ' oled' : ''}`;

describe('gerarTema: mínimos garantidos', () => {
  it.each(varredura().map((e) => [nome(e), e] as const))('%s', (_nome, entrada) => {
    const { cores } = gerarTema(entrada);
    const { pressionado } = camadasDeEstado(cores);
    const fundosDoTexto = [
      cores.fundo,
      cores.superficie,
      cores.superficie2,
      cores.superficieAfundada,
      cores.superficieElevada,
      cores.materialSolido,
      compor(pressionado, cores.superficie2),
      compor(pressionado, cores.fundo),
      compor(cores.material, cores.fundo),
      compor(cores.barra, cores.fundo),
      compor(cores.zebra, cores.superficie),
    ];
    for (const fundo of fundosDoTexto) {
      expect(contraste(cores.texto, fundo), `texto sobre ${fundo}`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(cores.texto2, fundo), `texto 2 sobre ${fundo}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contraste(cores.texto, cores.superficie2)).toBeGreaterThanOrEqual(7);
    const neutro = comAlfa(cores.texto2, 0.1);
    for (const base of [cores.superficie, cores.superficie2]) {
      expect(contraste(cores.texto2, compor(neutro, base))).toBeGreaterThanOrEqual(4.5);
      expect(contraste(cores.bordaControle, base)).toBeGreaterThanOrEqual(3);
    }
    const anel = comAlfa(cores.texto, OPACIDADE_DO_ANEL[entrada.tom]);
    for (const fundo of [cores.fundo, cores.superficie, cores.superficie2]) {
      expect(contraste(compor(anel, fundo), fundo), `anel sobre ${fundo}`).toBeGreaterThanOrEqual(
        3,
      );
    }
  });
});

describe('gerarTema: superfícies', () => {
  it('no escuro, a elevação clareia: afundada, padrão, 2 e elevada', () => {
    const { cores } = gerarTema({
      tom: 'escuro',
      base: { matiz: 265, croma: 0.006 },
      contraste: 45,
    });
    const l = (cor: string) => luminancia(cor);
    expect(l(cores.superficieAfundada)).toBeLessThan(l(cores.superficie));
    expect(l(cores.superficie)).toBeLessThan(l(cores.superficie2));
    expect(l(cores.superficie2)).toBeLessThanOrEqual(l(cores.superficieElevada));
    expect(l(cores.fundo)).toBeLessThan(l(cores.superficie));
  });

  it('no claro, a superfície é a mais clara, e o fundo atrás da janela, o mais escuro', () => {
    const { cores } = gerarTema({
      tom: 'claro',
      base: { matiz: 260, croma: 0.006 },
      contraste: 45,
    });
    const l = (cor: string) => luminancia(cor);
    expect(l(cores.fundo)).toBeLessThan(l(cores.superficieAfundada));
    expect(l(cores.superficieAfundada)).toBeLessThan(l(cores.superficie2));
    expect(l(cores.superficie2)).toBeLessThan(l(cores.superficie));
    expect(cores.superficieElevada).toBe('#ffffff');
  });

  it('o OLED tem o fundo preto absoluto', () => {
    const { cores } = gerarTema({
      tom: 'escuro',
      base: { matiz: 0, croma: 0 },
      contraste: 70,
      oled: true,
    });
    expect(cores.fundo).toBe('#000000');
    expect(cores.superficieAfundada).toBe('#000000');
  });

  it('mais contraste escurece o texto secundário de um tema claro', () => {
    const base = { tom: 'claro', base: { matiz: 260, croma: 0.006 } } as const;
    const medio = gerarTema({ ...base, contraste: 45 }).cores;
    const alto = gerarTema({ ...base, contraste: 100 }).cores;
    expect(luminancia(alto.texto2)).toBeLessThan(luminancia(medio.texto2));
  });

  it('a matiz da base tinge os neutros', () => {
    const papel = gerarTema({
      tom: 'claro',
      base: { matiz: 80, croma: 0.016 },
      contraste: 45,
    }).cores;
    const neutro = gerarTema({ tom: 'claro', base: { matiz: 0, croma: 0 }, contraste: 45 }).cores;
    expect(papel.fundo).not.toBe(neutro.fundo);
  });

  it('as sombras têm uma camada só', () => {
    for (const tom of ['escuro', 'claro'] as Tom[]) {
      const tema = gerarTema({ tom, base: { matiz: 0, croma: 0 }, contraste: 45 });
      expect(tema.sombraElevada).not.toContain('),');
      expect(tema.sombraSobreposta).not.toContain('),');
    }
  });
});
